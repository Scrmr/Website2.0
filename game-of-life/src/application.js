import { PlayerColor, MatchPhase, MatchResultType } from './domain.js';

// ── PlacementSubmissionService ────────────────────────────────────────────────

export class PlacementSubmissionService {
  constructor() { this._reset(); }

  _reset() {
    this._submissions = { [PlayerColor.RED]: [], [PlayerColor.BLUE]: [] };
    this._ready       = { [PlayerColor.RED]: false, [PlayerColor.BLUE]: false };
  }

  submit(color, positions) {
    this._submissions[color] = [...positions];
    this._ready[color]       = false;
  }

  setReady(color)      { this._ready[color] = true; }
  cancelReady(color)   { this._ready[color] = false; }
  isReady(color)       { return this._ready[color]; }
  bothReady()          { return this._ready[PlayerColor.RED] && this._ready[PlayerColor.BLUE]; }
  getSubmission(color) { return [...this._submissions[color]]; }
  clear()              { this._reset(); }
}

// ── MatchFlowCoordinator ──────────────────────────────────────────────────────

export class MatchFlowCoordinator {
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

    // Banking: cells carried over from previous rounds (after storage tax).
    this._banks = { [PlayerColor.RED]: 0, [PlayerColor.BLUE]: 0 };
  }

  get match() { return this._match; }

  onUpdate(fn) { this._onUpdate = fn; }

  dispose() {
    this._disposed = true;
    this._onUpdate = null;
  }

  isReady(color)  { return this._subs.isReady(color); }
  getDraft(color) { return this._subs.getSubmission(color); }
  getStats()      { return this._stats.getStatistics(this._match.board); }

  /**
   * The maximum cells a player may place this round (base max + banked cells).
   * During setup the count is exact (initialPlacementCount), not a bank-adjusted max.
   */
  getMaxPlaceable(color) {
    if (this._match.phase === MatchPhase.SETUP_PLACEMENT) {
      return this._match.settings.initialPlacementCount;
    }
    return this._match.settings.reinforcementMaxPlacementCount + this._banks[color];
  }

  getBank(color) { return this._banks[color]; }

  /** Whether pos is within color's allowed placement region. */
  isInPlayerRegion(color, pos) {
    return this._region.canPlace(color, pos, this._match.board, this._match.settings);
  }

  updateDraft(color, positions) {
    if (!this._isPlacementPhase()) {
      return { success: false, errors: ['Not in a placement phase'] };
    }
    this._subs.submit(color, positions);
    this._emit();
    return { success: true };
  }

  setReady(color) {
    if (!this._isPlacementPhase()) {
      return { success: false, errors: ['Not in a placement phase'] };
    }
    const draft      = this._subs.getSubmission(color);
    const maxOverride = this._match.phase === MatchPhase.REINFORCEMENT_PLACEMENT
      ? this.getMaxPlaceable(color)
      : null;
    const result = this._validator.validate(
      color, draft, this._match.board,
      this._match.phase, this._match.settings, this._region, maxOverride
    );
    if (!result.isValid) return { success: false, errors: result.errors };

    this._subs.setReady(color);
    this._emit();

    if (this._subs.bothReady()) this._commitAndSimulate();
    return { success: true };
  }

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

  _commitAndSimulate() {
    const redPos  = this._subs.getSubmission(PlayerColor.RED);
    const bluePos = this._subs.getSubmission(PlayerColor.BLUE);

    // Banking update must happen BEFORE clearing submissions so placed counts are known.
    if (this._match.phase === MatchPhase.REINFORCEMENT_PLACEMENT) {
      this._updateBanks(redPos.length, bluePos.length);
    }

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
   * Apply storage tax and add savings to each player's bank.
   * Rule: save N cells → bank += N - 1  (flat 1-cell storage tax per round saved).
   * Saving exactly 1 cell nets nothing (the tax consumes it).
   */
  _updateBanks(redPlaced, bluePlaced) {
    for (const [color, placed] of [
      [PlayerColor.RED,  redPlaced],
      [PlayerColor.BLUE, bluePlaced],
    ]) {
      const max   = this.getMaxPlaceable(color); // includes current bank before update
      const saved = max - placed;
      if (saved > 0) {
        this._banks[color] = Math.max(0, this._banks[color] + saved - 1);
      }
    }
  }

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
