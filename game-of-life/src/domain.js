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
  constructor(width, height, cells = null) {
    this.width  = width;
    this.height = height;
    this._cells = cells ?? Array.from({ length: height }, () =>
      new Array(width).fill(CellState.EMPTY));
  }

  /** Get the state of a cell. Accepts any object with .row and .col. */
  getCell(pos) { return this._cells[pos.row][pos.col]; }

  /** Fast accessor — avoids creating Position objects in hot loops. */
  getCellAt(row, col) { return this._cells[row][col]; }

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

  /**
   * Returns a new Board with the given placements applied.
   * placements: Array<{ pos: Position, state: CellState }>
   */
  withCells(placements) {
    const cells = this._cells.map(row => [...row]);
    for (const { pos, state } of placements) {
      cells[pos.row][pos.col] = state;
    }
    return new Board(this.width, this.height, cells);
  }

  clone() {
    return new Board(this.width, this.height, this._cells.map(r => [...r]));
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
    Object.freeze(this);
  }
}

export class Match {
  constructor(settings) {
    this.settings         = settings;
    this.board            = new Board(settings.boardWidth, settings.boardHeight);
    this.phase            = MatchPhase.SETUP_PLACEMENT;
    this.totalGenerations = 0;
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
