import { CellState, MatchPhase, PlayerColor, Position, PATTERNS } from './domain.js';

function mirrorH(cells) {
  const cols = cells.map(([, c]) => c);
  const minC = Math.min(...cols);
  const maxC = Math.max(...cols);
  return cells.map(([r, c]) => [r, minC + maxC - c]);
}

function centrePattern(cells) {
  const rows = cells.map(([r]) => r);
  const cols = cells.map(([, c]) => c);
  const offR = Math.floor((Math.min(...rows) + Math.max(...rows)) / 2);
  const offC = Math.floor((Math.min(...cols) + Math.max(...cols)) / 2);
  return cells.map(([r, c]) => [r - offR, c - offC]);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function randomInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

const BOT_PROFILES = {
  normal: {
    delayMs: 360,
    burst: 5,
    patternIds: ['block', 'beehive', 'toad', 'glider', 'lwss', 'eater', 'diehard'],
    pressure: 0.58,
  },
  hard: {
    delayMs: 240,
    burst: 9,
    patternIds: ['block', 'beehive', 'pond', 'toad', 'beacon', 'glider', 'lwss', 'mwss', 'eater', 'diehard', 'rpent'],
    pressure: 0.72,
  },
  strange: {
    delayMs: 300,
    burst: 7,
    patternIds: ['tub', 'beacon', 'pulsar', 'pentadecathlon', 'rpent', 'acorn', 'diehard', 'queenbee', 'eater'],
    pressure: 0.48,
  },
  cruel: {
    delayMs: 180,
    burst: 10,
    patternIds: ['block', 'eater', 'glider', 'lwss', 'mwss', 'diehard', 'rpent', 'acorn'],
    pressure: 0.86,
  },
};

export class LocalBotOpponent {
  constructor(coordinator, difficulty = 'normal', color = PlayerColor.BLUE) {
    this._coord = coordinator;
    this._difficulty = BOT_PROFILES[difficulty] ? difficulty : 'normal';
    this._profile = BOT_PROFILES[this._difficulty];
    this._color = color;
    this._pendingPlacement = false;
    this._lastLiveAt = 0;
    this._lastGeneration = -1;
  }

  get label() {
    return `${this._difficulty[0].toUpperCase()}${this._difficulty.slice(1)} Bot`;
  }

  handleUpdate() {
    const match = this._coord.match;
    if (match.phase === MatchPhase.ENDED) return;

    if (match.phase === MatchPhase.SETUP_PLACEMENT ||
        match.phase === MatchPhase.REINFORCEMENT_PLACEMENT) {
      this._schedulePlacement();
      return;
    }

    if (match.settings.continuousMode && match.phase === MatchPhase.SIMULATION) {
      this._spendLiveBank();
    }
  }

  _schedulePlacement() {
    if (this._pendingPlacement || this._coord.isReady(this._color)) return;
    this._pendingPlacement = true;
    setTimeout(() => {
      this._pendingPlacement = false;
      this._playPlacementPhase();
    }, this._profile.delayMs + randomInt(0, 220));
  }

  _playPlacementPhase() {
    const match = this._coord.match;
    if (this._coord.isReady(this._color)) return;
    if (match.phase !== MatchPhase.SETUP_PLACEMENT &&
        match.phase !== MatchPhase.REINFORCEMENT_PLACEMENT) return;

    const isSetup = match.phase === MatchPhase.SETUP_PLACEMENT;
    const target = isSetup
      ? match.settings.initialPlacementCount
      : this._chooseReinforcementCount();
    const draft = this._buildDraft(target, isSetup);

    this._coord.updateDraft(this._color, draft);
    const result = this._coord.setReady(this._color, !isSetup && draft.length === 0);
    if (!result.success) {
      const fallback = this._buildSingles(target, []);
      this._coord.updateDraft(this._color, fallback);
      this._coord.setReady(this._color, !isSetup && fallback.length === 0);
    }
  }

  _chooseReinforcementCount() {
    const { reinforcementMinPlacementCount: min } = this._coord.match.settings;
    const max = this._coord.getMaxPlaceable(this._color);
    const pressure = this._profile.pressure;
    return clamp(Math.round(min + (max - min) * pressure), min, max);
  }

  _buildDraft(target, isSetup) {
    const draft = [];
    const draftKeys = new Set();
    const candidates = this._patternCandidates(isSetup);

    while (draft.length < target && candidates.length > 0) {
      const pattern = candidates[randomInt(0, candidates.length - 1)];
      if (!this._tryAddPattern(pattern, target, draft, draftKeys, isSetup)) {
        candidates.splice(candidates.indexOf(pattern), 1);
      }
    }

    if (draft.length < target) {
      for (const pos of this._buildSingles(target - draft.length, draft)) {
        draft.push(pos);
      }
    }

    return draft.slice(0, target);
  }

  _patternCandidates(isSetup) {
    const budget = isSetup
      ? this._coord.match.settings.initialPlacementCount
      : this._coord.getMaxPlaceable(this._color);
    const preferred = new Set(this._profile.patternIds);
    return PATTERNS
      .filter(p => preferred.has(p.id) && p.cells.length <= budget)
      .sort((a, b) => a.cells.length - b.cells.length);
  }

  _tryAddPattern(pattern, target, draft, draftKeys, isSetup) {
    if (draft.length + pattern.cells.length > target) return false;
    const board = this._coord.match.board;
    const cells = centrePattern(pattern.mirrorForBlue ? mirrorH(pattern.cells) : pattern.cells);

    let best = null;
    let bestScore = -Infinity;
    const tries = isSetup ? 80 : 130;

    for (let i = 0; i < tries; i++) {
      const cursor = this._candidateCursor(pattern);
      const positions = [];
      let ok = true;
      for (const [dr, dc] of cells) {
        const pos = new Position(cursor.row + dr, cursor.col + dc);
        if (!board.isInBounds(pos) ||
            board.getCell(pos) !== CellState.EMPTY ||
            draftKeys.has(pos.key()) ||
            !this._coord.isInPlayerRegion(this._color, pos)) {
          ok = false;
          break;
        }
        positions.push(pos);
      }
      if (!ok) continue;

      const score = this._scorePositions(positions, pattern);
      if (score > bestScore) {
        best = positions;
        bestScore = score;
      }
    }

    if (!best) return false;
    for (const pos of best) {
      draft.push(pos);
      draftKeys.add(pos.key());
    }
    return true;
  }

  _buildSingles(count, existing) {
    const board = this._coord.match.board;
    const keys = new Set(existing.map(p => p.key()));
    const cells = [];
    const tries = Math.max(180, count * 80);

    for (let i = 0; i < tries && cells.length < count; i++) {
      const pos = this._candidateCursor({ tag: 'Seed' });
      if (!board.isInBounds(pos)) continue;
      if (board.getCell(pos) !== CellState.EMPTY) continue;
      if (keys.has(pos.key())) continue;
      if (!this._coord.isInPlayerRegion(this._color, pos)) continue;
      cells.push(pos);
      keys.add(pos.key());
    }

    return cells;
  }

  _candidateCursor(pattern) {
    const { boardWidth: w, boardHeight: h } = this._coord.match.settings;
    const mid = Math.floor(w / 2);
    const redCentroid = this._opponentCentroid();
    const pressure = this._profile.pressure;
    const row = clamp(Math.round(
      redCentroid
        ? redCentroid.row + randomInt(-8, 8)
        : randomInt(4, h - 5)
    ), 1, h - 2);

    const isAttack = ['Mover', 'Chaos', 'Fuse'].includes(pattern.tag);
    const front = mid + randomInt(2, Math.max(3, Math.floor(w * 0.16)));
    const back = randomInt(mid + Math.floor(w * 0.2), w - 3);
    const col = Math.random() < (isAttack ? pressure : pressure * 0.55)
      ? front
      : back;

    return new Position(row, clamp(col, mid, w - 2));
  }

  _opponentCentroid() {
    const board = this._coord.match.board;
    let rowSum = 0;
    let colSum = 0;
    let count = 0;
    for (let row = 0; row < board.height; row++) {
      for (let col = 0; col < board.width; col++) {
        if (board.getCellAt(row, col) !== CellState.RED) continue;
        rowSum += row;
        colSum += col;
        count++;
      }
    }
    if (!count) return null;
    return {
      row: Math.round(rowSum / count),
      col: Math.round(colSum / count),
    };
  }

  _scorePositions(positions, pattern) {
    const board = this._coord.match.board;
    const mid = Math.floor(board.width / 2);
    const rowMean = positions.reduce((sum, p) => sum + p.row, 0) / positions.length;
    const colMean = positions.reduce((sum, p) => sum + p.col, 0) / positions.length;
    const target = this._opponentCentroid();
    const targetRow = target?.row ?? board.height / 2;
    let score = 0;

    score -= Math.abs(rowMean - targetRow) * 0.8;
    score -= Math.abs(colMean - mid) * (['Mover', 'Chaos', 'Fuse'].includes(pattern.tag) ? 0.45 : 0.2);

    for (const pos of positions) {
      for (const n of board.getNeighbours(pos)) {
        const state = board.getCell(n);
        if (state === CellState.BLUE) score += 1.3;
        if (state === CellState.RED) score += this._difficulty === 'cruel' ? 2.3 : 1.1;
      }
    }

    return score + Math.random() * 4;
  }

  _spendLiveBank() {
    const now = Date.now();
    const match = this._coord.match;
    if (match.totalGenerations === this._lastGeneration) return;
    if (now - this._lastLiveAt < this._profile.delayMs) return;
    if (this._coord.getBank(this._color) <= 0) return;

    this._lastGeneration = match.totalGenerations;
    this._lastLiveAt = now;
    const burst = Math.min(this._profile.burst, this._coord.getBank(this._color));
    const draft = this._buildDraft(burst, false);
    for (const pos of draft) {
      if (!this._coord.placeLiveCell(this._color, pos)) break;
    }
  }
}
