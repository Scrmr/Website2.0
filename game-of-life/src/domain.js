// ── Enumerations ──────────────────────────────────────────────────────────────

export const CellState = Object.freeze({
  EMPTY: 'empty',
  RED:   'red',
  BLUE:  'blue',
});

export const PlayerColor = Object.freeze({
  RED:  'red',
  BLUE: 'blue',
});

export const MatchPhase = Object.freeze({
  SETUP_PLACEMENT:         'SetupPlacement',
  SIMULATION:              'Simulation',
  REINFORCEMENT_PLACEMENT: 'ReinforcementPlacement',
  ENDED:                   'Ended',
});

export const MatchResultType = Object.freeze({
  RED_VICTORY:  'RedVictory',
  BLUE_VICTORY: 'BlueVictory',
  DRAW:         'Draw',
  IN_PROGRESS:  'InProgress',
});

// ── Value Objects ─────────────────────────────────────────────────────────────

export class Position {
  constructor(row, col) {
    this.row = row;
    this.col = col;
    Object.freeze(this);
  }
  equals(other) { return this.row === other.row && this.col === other.col; }
  key()         { return `${this.row},${this.col}`; }
}

// ── Board ─────────────────────────────────────────────────────────────────────

export class Board {
  /**
   * @param {number}   width
   * @param {number}   height
   * @param {string[][]|null}  cells  — 2D array of CellState values
   * @param {number[][]|null}  ages   — parallel 2D array; each entry is the
   *                                    number of consecutive generations the
   *                                    cell at that position has been alive
   *                                    (0 = empty / just died).
   */
  constructor(width, height, cells = null, ages = null) {
    this.width  = width;
    this.height = height;
    this._cells = cells ?? Array.from({ length: height }, () =>
      new Array(width).fill(CellState.EMPTY));
    this._ages  = ages  ?? Array.from({ length: height }, () =>
      new Array(width).fill(0));
  }

  getCell(pos)          { return this._cells[pos.row][pos.col]; }
  getCellAt(row, col)   { return this._cells[row][col]; }
  getAgeAt(row, col)    { return this._ages[row][col]; }

  isInBounds(pos) {
    return pos.row >= 0 && pos.row < this.height &&
           pos.col >= 0 && pos.col < this.width;
  }

  getNeighbours(pos) {
    const result = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const n = new Position(pos.row + dr, pos.col + dc);
        if (this.isInBounds(n)) result.push(n);
      }
    }
    return result;
  }

  /** Returns a new Board with the given placements applied. Newly placed cells start at age 1. */
  withCells(placements) {
    const cells = this._cells.map(r => [...r]);
    const ages  = this._ages.map(r => [...r]);
    for (const { pos, state } of placements) {
      cells[pos.row][pos.col] = state;
      ages[pos.row][pos.col]  = state !== CellState.EMPTY ? 1 : 0;
    }
    return new Board(this.width, this.height, cells, ages);
  }

  clone() {
    return new Board(
      this.width, this.height,
      this._cells.map(r => [...r]),
      this._ages.map(r => [...r])
    );
  }
}

// ── Entities ──────────────────────────────────────────────────────────────────

export class Player {
  constructor(color, name) {
    this.color = color;
    this.name  = name;
  }
}

export class GameSettings {
  constructor(overrides = {}) {
    this.boardWidth                     = overrides.boardWidth                     ?? 40;
    this.boardHeight                    = overrides.boardHeight                    ?? 24;
    this.initialPlacementCount          = overrides.initialPlacementCount          ?? 10;
    this.reinforcementMinPlacementCount = overrides.reinforcementMinPlacementCount ?? 5;
    this.reinforcementMaxPlacementCount = overrides.reinforcementMaxPlacementCount ?? 10;
    this.simulationBlockSize            = overrides.simulationBlockSize            ?? 10;
    this.maxGenerations                 = overrides.maxGenerations                 ?? 250;
    this.simulationStepMs               = overrides.simulationStepMs               ?? 140;
    // Contested middle strip: both players may place here from this round onward.
    this.contestedZoneWidth             = overrides.contestedZoneWidth             ?? 4;
    this.contestedZoneUnlocksAtRound    = overrides.contestedZoneUnlocksAtRound    ?? 3;
    // Placement timer (seconds per phase; 0 = disabled).
    this.placementTimerSeconds          = overrides.placementTimerSeconds          ?? 0;
    Object.freeze(this);
  }
}

export class Match {
  constructor(settings) {
    this.settings         = settings;
    this.board            = new Board(settings.boardWidth, settings.boardHeight);
    this.phase            = MatchPhase.SETUP_PLACEMENT;
    this.totalGenerations = 0;
    this.roundNumber      = 1;   // increments after each simulation block
    this.result           = MatchResultType.IN_PROGRESS;
    this.players = {
      [PlayerColor.RED]:  new Player(PlayerColor.RED,  'Red'),
      [PlayerColor.BLUE]: new Player(PlayerColor.BLUE, 'Blue'),
    };
  }
}

export class ValidationResult {
  constructor(isValid, errors = []) {
    this.isValid = isValid;
    this.errors  = errors;
    Object.freeze(this);
  }
  static ok()         { return new ValidationResult(true, []); }
  static fail(errors) { return new ValidationResult(false, errors); }
}

// ── Pre-made placement patterns ───────────────────────────────────────────────

export const PATTERNS = [
  {
    id:           'block',
    name:         'Block',
    tag:          'Stable',
    tagColor:     '#6fcf97',
    desc:         'Solid 2×2 square. Reliable anchor point.',
    cells:        [[0,0],[0,1],[1,0],[1,1]],
    mirrorForBlue: false,
  },
  {
    id:           'blinker',
    name:         'Blinker',
    tag:          'Pulse',
    tagColor:     '#f2994a',
    desc:         'Vertical 3-cell line that oscillates every generation.',
    cells:        [[0,0],[1,0],[2,0]],
    mirrorForBlue: false,
  },
  {
    id:           'beehive',
    name:         'Beehive',
    tag:          'Stable',
    tagColor:     '#6fcf97',
    desc:         'Compact 6-cell stable cluster.',
    cells:        [[0,1],[0,2],[1,0],[1,3],[2,1],[2,2]],
    mirrorForBlue: false,
  },
  {
    id:           'glider',
    name:         'Glider',
    tag:          'Mover',
    tagColor:     '#e84040',
    desc:         '5-cell diagonal traveller. Mirrored for Blue so it faces Red.',
    cells:        [[0,1],[1,2],[2,0],[2,1],[2,2]],
    mirrorForBlue: true,
  },
  {
    id:           'rpent',
    name:         'R-pentomino',
    tag:          'Chaos',
    tagColor:     '#bb6bd9',
    desc:         '5-cell chaotic growth — unpredictable and explosive.',
    cells:        [[0,1],[0,2],[1,0],[1,1],[2,1]],
    mirrorForBlue: true,
  },
  {
    id:           'toad',
    name:         'Toad',
    tag:          'Pulse',
    tagColor:     '#f2994a',
    desc:         '6-cell period-2 oscillator with an alternating shape.',
    cells:        [[0,1],[0,2],[0,3],[1,0],[1,1],[1,2]],
    mirrorForBlue: false,
  },
];
