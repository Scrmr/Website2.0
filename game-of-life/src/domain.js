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
    // 0 means endless: the match ends only by elimination or surrender/new game.
    this.maxGenerations                 = overrides.maxGenerations                 ?? 0;
    this.simulationStepMs               = overrides.simulationStepMs               ?? 140;
    // Contested middle strip: both players may place here from this round onward.
    this.contestedZoneWidth             = overrides.contestedZoneWidth             ?? 4;
    this.contestedZoneUnlocksAtRound    = overrides.contestedZoneUnlocksAtRound    ?? 3;
    // Placement timer (seconds per phase; 0 = disabled).
    this.placementTimerSeconds          = overrides.placementTimerSeconds          ?? 0;
    // Continuous mode: skip reinforcement placement phases; auto-place cells each block.
    this.continuousMode                 = overrides.continuousMode                 ?? false;
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
//
// Tags: Anchor · Stable · Pulse · Mover · Chaos · Fuse · Trap
//
// mirrorForBlue: true  → Blue receives the pattern mirrored horizontally so
//                        directional structures (movers, asymmetric stills)
//                        face toward Red rather than away.

export const PATTERNS = [

  // ── Anchors (smallest still lifes — cheapest permanent territory) ──────────

  {
    id:           'block',
    name:         'Block',
    tag:          'Anchor',
    tagColor:     '#6fcf97',
    desc:         '2×2 square. Each cell has 3 same-colour neighbours — the ' +
                  'minimum still life. Never changes. Place anywhere to lock ' +
                  'down territory permanently.',
    cells:        [[0,0],[0,1],[1,0],[1,1]],
    mirrorForBlue: false,
  },
  {
    id:           'tub',
    name:         'Tub',
    tag:          'Anchor',
    tagColor:     '#6fcf97',
    desc:         'Diamond of 4 cells — each has exactly 2 neighbours. ' +
                  'Narrower footprint than the block. Good for plugging a ' +
                  'single-column gap without overcrowding neighbours.',
    cells:        [[0,1],[1,0],[1,2],[2,1]],
    mirrorForBlue: false,
  },

  // ── Still lifes (larger permanent structures) ──────────────────────────────

  {
    id:           'boat',
    name:         'Boat',
    tag:          'Stable',
    tagColor:     '#6fcf97',
    desc:         '5-cell L-shaped still life. Holds a slightly wider area ' +
                  'than a block. Useful for covering an awkward corner near ' +
                  'your border without wasting extra cells.',
    cells:        [[0,0],[0,1],[1,0],[1,2],[2,1]],
    mirrorForBlue: true,
  },
  {
    id:           'beehive',
    name:         'Beehive',
    tag:          'Stable',
    tagColor:     '#6fcf97',
    desc:         'Compact 6-cell oval. Each edge cell has 2 neighbours, ' +
                  'the interior cells 3 — permanently stable. Wide enough to ' +
                  'block births in the column in front of it.',
    cells:        [[0,1],[0,2],[1,0],[1,3],[2,1],[2,2]],
    mirrorForBlue: false,
  },
  {
    id:           'loaf',
    name:         'Loaf',
    tag:          'Stable',
    tagColor:     '#6fcf97',
    desc:         '7-cell stepped still life. Covers a 4-row strip and ' +
                  'suppresses births along its entire edge. Efficient at ' +
                  'holding a wider lane than the beehive.',
    cells:        [[0,1],[0,2],[1,0],[1,3],[2,1],[2,3],[3,2]],
    mirrorForBlue: true,
  },
  {
    id:           'pond',
    name:         'Pond',
    tag:          'Stable',
    tagColor:     '#6fcf97',
    desc:         'Symmetric 8-cell ring. The most territory-efficient still ' +
                  'life here — 8 cells enclose a 4×4 area. High placement ' +
                  'cost but locks down a large zone permanently.',
    cells:        [[0,1],[0,2],[1,0],[1,3],[2,0],[2,3],[3,1],[3,2]],
    mirrorForBlue: false,
  },

  // ── Oscillators (periodic structures that keep generating local activity) ──

  {
    id:           'blinker',
    name:         'Blinker',
    tag:          'Pulse',
    tagColor:     '#f2994a',
    desc:         '3-cell line that alternates vertical ↔ horizontal every ' +
                  'generation. Constantly triggers births on its ends, ' +
                  'creating persistent local churn near your front line.',
    cells:        [[0,0],[1,0],[2,0]],
    mirrorForBlue: false,
  },
  {
    id:           'toad',
    name:         'Toad',
    tag:          'Pulse',
    tagColor:     '#f2994a',
    desc:         '6-cell period-2 oscillator. Two offset rows shift back ' +
                  'and forth each generation, firing births on all four ' +
                  'corners alternately. Good pressure tool near the midline.',
    cells:        [[0,1],[0,2],[0,3],[1,0],[1,1],[1,2]],
    mirrorForBlue: false,
  },
  {
    id:           'beacon',
    name:         'Beacon',
    tag:          'Pulse',
    tagColor:     '#f2994a',
    desc:         'Two 2×2 blocks diagonally touching. Their inner corners ' +
                  'die and are reborn every generation. Creates a steady ' +
                  'double-block pulse over a wide area. Hard to fully ignore.',
    cells:        [[0,0],[0,1],[1,0],[1,1],[2,2],[2,3],[3,2],[3,3]],
    mirrorForBlue: false,
  },

  // ── Spaceships (self-propelled structures that cross the board) ────────────

  {
    id:           'glider',
    name:         'Glider',
    tag:          'Mover',
    tagColor:     '#e84040',
    desc:         '5-cell diagonal traveller. Crosses a 40-wide board in ' +
                  '~40 generations. Cheap to place and hard to stop if ' +
                  'there is a clear lane. Always mirrored for Blue.',
    cells:        [[0,1],[1,2],[2,0],[2,1],[2,2]],
    mirrorForBlue: true,
  },
  {
    id:           'lwss',
    name:         'LWSS',
    tag:          'Mover',
    tagColor:     '#e84040',
    desc:         'Lightweight Spaceship — 9 cells moving horizontally ' +
                  'toward the opponent. Travels faster than a glider and ' +
                  'survives many collisions. Strong mid-game attacker.',
    cells:        [[0,1],[0,4],[1,0],[2,0],[2,4],[3,0],[3,1],[3,2],[3,3]],
    mirrorForBlue: true,
  },

  // ── Chaotic (methuselahs — small seeds with enormous long-term output) ─────

  {
    id:           'rpent',
    name:         'R-pentomino',
    tag:          'Chaos',
    tagColor:     '#bb6bd9',
    desc:         '5-cell seed that takes 1,103 generations to stabilise, ' +
                  'emitting gliders and debris throughout. Placed near the ' +
                  'border it will churn through the opponent\'s territory.',
    cells:        [[0,1],[0,2],[1,0],[1,1],[2,1]],
    mirrorForBlue: true,
  },
  {
    id:           'acorn',
    name:         'Acorn',
    tag:          'Chaos',
    tagColor:     '#bb6bd9',
    desc:         '7-cell methuselah — takes ~5,200 generations and produces ' +
                  '633 cells before stabilising. In a 250-gen game it never ' +
                  'settles; it is pure unstoppable chaos for the whole match.',
    cells:        [[0,1],[1,3],[2,0],[2,1],[2,4],[2,5],[2,6]],
    mirrorForBlue: true,
  },

  // ── Fuse (self-destructs after a fixed countdown) ─────────────────────────

  {
    id:           'diehard',
    name:         'Diehard',
    tag:          'Fuse',
    tagColor:     '#2d9cdb',
    desc:         '7-cell pattern that generates aggressive activity for ' +
                  'exactly 130 generations then disappears completely. A ' +
                  'disposable weapon — disrupts the opponent and leaves no trace.',
    cells:        [[0,6],[1,0],[1,1],[2,1],[2,5],[2,6],[2,7]],
    mirrorForBlue: true,
  },

  // ── Trap (stable hook that absorbs incoming movers) ───────────────────────

  {
    id:           'eater',
    name:         'Eater',
    tag:          'Trap',
    tagColor:     '#27ae60',
    desc:         '7-cell stable hook. When a glider strikes its corner, the ' +
                  'Eater absorbs it and returns to its original form. Place ' +
                  'near your border to neutralise incoming movers cheaply.',
    cells:        [[0,0],[0,1],[1,0],[1,2],[2,2],[3,2],[3,3]],
    mirrorForBlue: true,
  },

  {
    id:           'ship',
    name:         'Ship',
    tag:          'Anchor',
    tagColor:     '#6fcf97',
    role:         'Small diagonal bunker',
    desc:         '6-cell still life. Slightly denser than a boat and good ' +
                  'for sealing diagonal leaks around a larger stable wall.',
    cells:        [[0,0],[0,1],[1,0],[1,2],[2,1],[2,2]],
    mirrorForBlue: true,
  },
  {
    id:           'longboat',
    name:         'Long Boat',
    tag:          'Stable',
    tagColor:     '#6fcf97',
    role:         'Cheap edge holder',
    desc:         '7-cell still life with a longer diagonal edge. Useful ' +
                  'when a normal boat is too compact to suppress a lane.',
    cells:        [[0,0],[0,1],[1,0],[1,2],[2,1],[2,3],[3,2]],
    mirrorForBlue: true,
  },
  {
    id:           'barge',
    name:         'Barge',
    tag:          'Stable',
    tagColor:     '#6fcf97',
    role:         'Thin stable bridge',
    desc:         '6-cell diagonal still life. Spans more distance than a ' +
                  'block without filling the centre, so nearby births can be shaped.',
    cells:        [[0,1],[0,2],[1,0],[1,3],[2,1],[2,2]],
    mirrorForBlue: true,
  },
  {
    id:           'clock',
    name:         'Clock',
    tag:          'Pulse',
    tagColor:     '#f2994a',
    role:         'Tiny local churn',
    desc:         '6-cell period-2 oscillator. Low-cost pressure that keeps ' +
                  'a small patch alive without committing to a large engine.',
    cells:        [[0,2],[1,0],[1,2],[2,1],[2,3],[3,1]],
    mirrorForBlue: false,
  },
  {
    id:           'pentadecathlon',
    name:         'Pentadecathlon',
    tag:          'Pulse',
    tagColor:     '#f2994a',
    role:         'Long-period metronome',
    desc:         '12-cell period-15 oscillator. Excellent for a durable ' +
                  'rear engine that periodically disturbs nearby lanes.',
    cells:        [[0,1],[1,1],[2,0],[2,2],[3,1],[4,1],[5,1],[6,1],[7,0],[7,2],[8,1],[9,1]],
    mirrorForBlue: false,
  },
  {
    id:           'pulsar',
    name:         'Pulsar',
    tag:          'Pulse',
    tagColor:     '#f2994a',
    role:         'Large pressure engine',
    desc:         '48-cell period-3 oscillator. Expensive, loud, and hard ' +
                  'to ignore; it broadcasts rhythmic birth pressure in every direction.',
    cells:        [
      [0,2],[0,3],[0,4],[0,8],[0,9],[0,10],
      [2,0],[2,5],[2,7],[2,12],
      [3,0],[3,5],[3,7],[3,12],
      [4,0],[4,5],[4,7],[4,12],
      [5,2],[5,3],[5,4],[5,8],[5,9],[5,10],
      [7,2],[7,3],[7,4],[7,8],[7,9],[7,10],
      [8,0],[8,5],[8,7],[8,12],
      [9,0],[9,5],[9,7],[9,12],
      [10,0],[10,5],[10,7],[10,12],
      [12,2],[12,3],[12,4],[12,8],[12,9],[12,10],
    ],
    mirrorForBlue: false,
  },
  {
    id:           'mwss',
    name:         'MWSS',
    tag:          'Mover',
    tagColor:     '#e84040',
    role:         'Heavier lane attack',
    desc:         'Middleweight spaceship. Costs more than LWSS but carries ' +
                  'a broader collision profile through cluttered lanes.',
    cells:        [[0,2],[0,3],[1,0],[1,5],[2,6],[3,0],[3,6],[4,1],[4,2],[4,3],[4,4],[4,5],[4,6]],
    mirrorForBlue: true,
  },
  {
    id:           'hwss',
    name:         'HWSS',
    tag:          'Mover',
    tagColor:     '#e84040',
    role:         'Heavy breach ship',
    desc:         'Heavyweight spaceship. A costly moving wall that can punch ' +
                  'through loose debris better than smaller ships.',
    cells:        [[0,2],[0,3],[1,0],[1,6],[2,7],[3,0],[3,7],[4,1],[4,2],[4,3],[4,4],[4,5],[4,6],[4,7]],
    mirrorForBlue: true,
  },
  {
    id:           'bheptomino',
    name:         'B-heptomino',
    tag:          'Chaos',
    tagColor:     '#bb6bd9',
    role:         'Medium methuselah',
    desc:         '7-cell seed that stays active for a long time before ' +
                  'settling. Smaller and more controllable than Acorn.',
    cells:        [[0,0],[0,1],[1,1],[1,2],[2,1],[2,2],[3,1]],
    mirrorForBlue: true,
  },
  {
    id:           'piheptomino',
    name:         'Pi-heptomino',
    tag:          'Chaos',
    tagColor:     '#bb6bd9',
    role:         'Symmetric burst seed',
    desc:         '7-cell methuselah with a compact symmetric start. Useful ' +
                  'for creating a timed bloom near an already unstable front.',
    cells:        [[0,0],[0,1],[0,2],[1,0],[1,2],[2,0],[2,2]],
    mirrorForBlue: false,
  },
  {
    id:           'gosper',
    name:         'Gosper Gun',
    tag:          'Engine',
    tagColor:     '#56ccf2',
    role:         'Glider factory',
    desc:         '36-cell glider gun. Very expensive but turns a safe rear ' +
                  'position into a repeating stream of long-range pressure.',
    cells:        [
      [5,1],[5,2],[6,1],[6,2],
      [3,13],[3,14],[4,12],[4,16],[5,11],[5,17],[6,11],[6,15],[6,17],[6,18],
      [7,11],[7,17],[8,12],[8,16],[9,13],[9,14],
      [1,25],[2,23],[2,25],[3,21],[3,22],[4,21],[4,22],[5,21],[5,22],
      [6,23],[6,25],[7,25],
      [3,35],[3,36],[4,35],[4,36],
    ],
    mirrorForBlue: true,
  },

];
