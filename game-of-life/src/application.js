import { PlayerColor, MatchPhase, MatchResultType } from './domain.js';

// ── PlacementSubmissionService ────────────────────────────────────────────────

/**
 * Stores each player's pending placement draft and ready state.
 * The authoritative board is NOT mutated until both players are ready.
 * This model supports future online multiplayer: each player submits
 * independently and the system resolves once both are locked in.
 */
export class PlacementSubmissionService {
  constructor() { this._reset(); }

  _reset() {
    this._submissions = { [PlayerColor.RED]: [], [PlayerColor.BLUE]: [] };
    this._ready       = { [PlayerColor.RED]: false, [PlayerColor.BLUE]: false };
  }

  /** Replace a player's draft. Resets their ready state. */
  submit(color, positions) {
    this._submissions[color] = [...positions];
    this._ready[color]       = false;
  }

  setReady(color)    { this._ready[color] = true; }
  cancelReady(color) { this._ready[color] = false; }
  isReady(color)     { return this._ready[color]; }
  bothReady()        { return this._ready[PlayerColor.RED] && this._ready[PlayerColor.BLUE]; }
  getSubmission(color) { return [...this._submissions[color]]; }
  clear()            { this._reset(); }
}

// ── MatchFlowCoordinator ──────────────────────────────────────────────────────

/**
 * Orchestrates phase transitions:
 *   SetupPlacement → Simulation → ReinforcementPlacement → Simulation → … → Ended
 *
 * Depends on abstractions (interfaces), not concrete implementations.
 * The simulation loop is async so the UI can animate each generation.
 */
export class MatchFlowCoordinator {
  /**
   * @param {Match}                      match
   * @param {PlacementSubmissionService} submissionService
   * @param {StandardPlacementValidator} validator
   * @param {CompetitiveLifeRuleEngine}  ruleEngine
   * @param {StandardWinConditionEvaluator} winEvaluator
   * @param {BoardStatisticsService}     statsService
   * @param {HalfBoardPlacementRegionPolicy} regionPolicy
   */
  constructor(match, submissionService, validator, ruleEngine, winEvaluator, statsService, regionPolicy) {
    this._match    = match;
    this._subs     = submissionService;
    this._validator = validator;
    this._engine   = ruleEngine;
    this._winEval  = winEvaluator;
    this._stats    = statsService;
    this._region   = regionPolicy;
    this._onUpdate = null;
    this._disposed = false;
  }

  get match() { return this._match; }

  /** Register a callback that fires whenever match state changes. */
  onUpdate(fn) { this._onUpdate = fn; }

  /**
   * Dispose this coordinator so stale async simulation loops become no-ops.
   * Call before creating a new game.
   */
  dispose() {
    this._disposed = true;
    this._onUpdate = null;
  }

  isReady(color)    { return this._subs.isReady(color); }
  getDraft(color)   { return this._subs.getSubmission(color); }
  getStats()        { return this._stats.getStatistics(this._match.board); }

  /**
   * Update a player's draft without locking them in.
   * Returns { success: boolean, errors?: string[] }.
   */
  updateDraft(color, positions) {
    if (!this._isPlacementPhase()) {
      return { success: false, errors: ['Not in a placement phase'] };
    }
    this._subs.submit(color, positions);
    this._emit();
    return { success: true };
  }

  /**
   * Lock a player in with their current draft.
   * Validates the draft first. If both players are now ready, commits placements
   * and starts the simulation block.
   */
  setReady(color) {
    if (!this._isPlacementPhase()) {
      return { success: false, errors: ['Not in a placement phase'] };
    }
    const draft  = this._subs.getSubmission(color);
    const result = this._validator.validate(
      color, draft, this._match.board,
      this._match.phase, this._match.settings, this._region
    );
    if (!result.isValid) return { success: false, errors: result.errors };

    this._subs.setReady(color);
    this._emit();

    if (this._subs.bothReady()) this._commitAndSimulate();
    return { success: true };
  }

  /** Un-lock a player (only allowed outside the simulation phase). */
  cancelReady(color) {
    if (this._match.phase === MatchPhase.SIMULATION) return;
    this._subs.cancelReady(color);
    this._emit();
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _isPlacementPhase() {
    const p = this._match.phase;
    return p === MatchPhase.SETUP_PLACEMENT || p === MatchPhase.REINFORCEMENT_PLACEMENT;
  }

  /** Atomically apply both players' placements, then start simulation. */
  _commitAndSimulate() {
    const redPos  = this._subs.getSubmission(PlayerColor.RED);
    const bluePos = this._subs.getSubmission(PlayerColor.BLUE);

    const placements = [
      ...redPos.map(pos  => ({ pos, state: 'red' })),
      ...bluePos.map(pos => ({ pos, state: 'blue' })),
    ];

    this._match.board = this._match.board.withCells(placements);
    this._subs.clear();
    this._match.phase = MatchPhase.SIMULATION;
    this._emit();
    this._runSimulation();
  }

  /**
   * Runs one simulation block (simulationBlockSize generations) asynchronously,
   * emitting an update after each generation so the UI can animate.
   * Checks for disposal at each step so restarting a game is safe.
   */
  async _runSimulation() {
    const { simulationBlockSize, simulationStepMs } = this._match.settings;

    for (let i = 0; i < simulationBlockSize; i++) {
      await new Promise(r => setTimeout(r, simulationStepMs));
      if (this._disposed) return;
      this._match.board = this._engine.computeNextGeneration(this._match.board);
      this._match.totalGenerations++;
      this._emit();
    }

    if (this._disposed) return;

    const result = this._winEval.evaluate(
      this._match.board,
      this._match.totalGenerations,
      this._match.settings,
      this._stats
    );

    if (result !== MatchResultType.IN_PROGRESS) {
      this._match.phase  = MatchPhase.ENDED;
      this._match.result = result;
    } else {
      this._match.phase = MatchPhase.REINFORCEMENT_PLACEMENT;
    }

    this._emit();
  }

  _emit() {
    if (!this._disposed && this._onUpdate) this._onUpdate();
  }
}
