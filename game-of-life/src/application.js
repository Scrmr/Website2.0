import { CellState, PlayerColor, MatchPhase, MatchResultType, Position } from './domain.js';

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

    // Banking: cells carried over from previous rounds (after 1-cell storage tax).
    this._banks = { [PlayerColor.RED]: 0, [PlayerColor.BLUE]: 0 };

    // Per-round catch-up bonus (3 cells added when a player is severely behind).
    // Cleared and recalculated after each simulation block.
    this._catchupBonus = { [PlayerColor.RED]: 0, [PlayerColor.BLUE]: 0 };

    // Cell-count history recorded after each simulation block (for sparklines).
    this._history = { [PlayerColor.RED]: [], [PlayerColor.BLUE]: [] };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  get match() { return this._match; }

  onUpdate(fn) { this._onUpdate = fn; }

  dispose() {
    this._disposed = true;
    this._onUpdate = null;
  }

  isReady(color)      { return this._subs.isReady(color); }
  getDraft(color)     { return this._subs.getSubmission(color); }
  getStats()          { return this._stats.getStatistics(this._match.board); }
  getEcologyMetrics() { return this._stats.getEcologyMetrics(this._match.board); }
  getRoundNumber()    { return this._match.roundNumber; }
  getBank(color)      { return this._banks[color]; }
  getCatchupBonus(color) { return this._catchupBonus[color]; }
  getHistory(color)   { return [...this._history[color]]; }

  /** Maximum cells a player may place this round (base max + banked + catch-up). */
  getMaxPlaceable(color) {
    if (this._match.phase === MatchPhase.SETUP_PLACEMENT) {
      return this._match.settings.initialPlacementCount;
    }
    return this._match.settings.reinforcementMaxPlacementCount
      + this._banks[color]
      + this._catchupBonus[color];
  }

  /** Whether pos is within color's allowed placement region for the current round. */
  isInPlayerRegion(color, pos) {
    return this._region.canPlace(
      color, pos, this._match.board,
      this._match.settings, this._match.roundNumber
    );
  }

  updateDraft(color, positions) {
    if (!this._isPlacementPhase()) {
      return { success: false, errors: ['Not in a placement phase'] };
    }
    this._subs.submit(color, positions);
    this._emit();
    return { success: true };
  }

  /**
   * Lock a player in.
   * @param {string}  color
   * @param {boolean} force  When true (timer expiry), skip minimum count check.
   */
  setReady(color, force = false) {
    if (!this._isPlacementPhase()) {
      return { success: false, errors: ['Not in a placement phase'] };
    }

    const draft      = this._subs.getSubmission(color);
    const maxOverride = this._match.phase === MatchPhase.REINFORCEMENT_PLACEMENT
      ? this.getMaxPlaceable(color)
      : null;

    const result = this._validator.validate(
      color, draft, this._match.board,
      this._match.phase, this._match.settings, this._region,
      maxOverride, force, this._match.roundNumber
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

  // ── Private ──────────────────────────────────────────────────────────────

  _isPlacementPhase() {
    const p = this._match.phase;
    return p === MatchPhase.SETUP_PLACEMENT || p === MatchPhase.REINFORCEMENT_PLACEMENT;
  }

  _commitAndSimulate() {
    const redPos  = this._subs.getSubmission(PlayerColor.RED);
    const bluePos = this._subs.getSubmission(PlayerColor.BLUE);

    // Banking must be calculated BEFORE clearing submissions.
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
   * Save N cells → bank += N - 1 (flat 1-cell storage tax per round if savings > 0).
   * Saving exactly 1 cell nets nothing (the tax consumes it).
   */
  _updateBanks(redPlaced, bluePlaced) {
    for (const [color, placed] of [
      [PlayerColor.RED,  redPlaced],
      [PlayerColor.BLUE, bluePlaced],
    ]) {
      const max   = this.getMaxPlaceable(color);
      const saved = max - placed;
      if (saved > 0) {
        this._banks[color] = Math.max(0, this._banks[color] + saved - 1);
      }
    }
  }

  /**
   * If a player's cells are < 25% of the total, give them a +3 catch-up bonus
   * for next round. Bonus resets each round (doesn't accumulate).
   */
  _updateCatchupBonus() {
    this._catchupBonus[PlayerColor.RED]  = 0;
    this._catchupBonus[PlayerColor.BLUE] = 0;

    const { redCount, blueCount } = this._stats.getStatistics(this._match.board);
    const total = redCount + blueCount;
    if (total < 8) return; // too early; both players just started

    if (redCount  / total < 0.25) this._catchupBonus[PlayerColor.RED]  = 3;
    if (blueCount / total < 0.25) this._catchupBonus[PlayerColor.BLUE] = 3;
  }

  /** Record one data point per simulation block for the sparkline. */
  _recordHistory() {
    const { redCount, blueCount } = this._stats.getStatistics(this._match.board);
    this._history[PlayerColor.RED].push(redCount);
    this._history[PlayerColor.BLUE].push(blueCount);
  }

  async _runSimulation() {
    const { simulationBlockSize, simulationStepMs, continuousMode } = this._match.settings;

    // In continuous mode we loop indefinitely; non-continuous exits after one block.
    while (true) {
      for (let i = 0; i < simulationBlockSize; i++) {
        await new Promise(r => setTimeout(r, simulationStepMs));
        if (this._disposed) return;
        this._match.board = this._engine.computeNextGeneration(this._match.board);
        this._match.totalGenerations++;
        this._emit();
      }

      if (this._disposed) return;

      this._recordHistory();

      const result = this._winEval.evaluate(
        this._match.board, this._match.totalGenerations,
        this._match.settings, this._stats
      );

      if (result !== MatchResultType.IN_PROGRESS) {
        this._match.phase  = MatchPhase.ENDED;
        this._match.result = result;
        this._emit();
        return;
      }

      this._updateCatchupBonus();
      this._match.roundNumber++;

      if (continuousMode) {
        // Credit banks — players spend them by clicking during simulation.
        this._creditLiveBanks();
        this._emit();
        // Loop continues immediately
      } else {
        this._match.phase = MatchPhase.REINFORCEMENT_PLACEMENT;
        this._emit();
        return; // yield; user interaction calls _commitAndSimulate → _runSimulation again
      }
    }
  }

  /**
   * Credit both players' banks at each simulation block boundary (continuous mode).
   * Players spend the bank by clicking/dragging during simulation.
   */
  _creditLiveBanks() {
    const { reinforcementMinPlacementCount } = this._match.settings;
    for (const color of [PlayerColor.RED, PlayerColor.BLUE]) {
      this._banks[color] += reinforcementMinPlacementCount + this._catchupBonus[color];
    }
  }

  /**
   * Place a single cell directly onto the board during simulation (continuous mode).
   * Decrements the player's bank by 1. Returns true if the placement was accepted.
   */
  placeLiveCell(color, pos) {
    if (this._match.phase !== MatchPhase.SIMULATION) return false;
    if (!this._match.settings.continuousMode) return false;
    if (this._banks[color] <= 0) return false;
    if (!this._match.board.isInBounds(pos)) return false;
    if (this._match.board.getCell(pos) !== CellState.EMPTY) return false;
    if (!this._region.canPlace(color, pos, this._match.board, this._match.settings, this._match.roundNumber)) return false;

    this._banks[color]--;
    this._match.board = this._match.board.withCells([{ pos, state: color }]);
    this._emit();
    return true;
  }

  _emit() {
    if (!this._disposed && this._onUpdate) this._onUpdate();
  }
}
