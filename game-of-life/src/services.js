import { CellState, PlayerColor, MatchPhase, MatchResultType, Board, Position, ValidationResult } from './domain.js';

// ── IPlacementRegionPolicy ────────────────────────────────────────────────────

/**
 * HalfBoardPlacementRegionPolicy
 * Red occupies the left half (col < boardWidth/2).
 * Blue occupies the right half (col >= boardWidth/2).
 * Swap the comparisons here to try alternative map layouts.
 */
export class HalfBoardPlacementRegionPolicy {
  canPlace(color, pos, _board, settings) {
    const mid = Math.floor(settings.boardWidth / 2);
    return color === PlayerColor.RED ? pos.col < mid : pos.col >= mid;
  }
}

// ── ILifeRuleEngine ───────────────────────────────────────────────────────────

/**
 * CompetitiveLifeRuleEngine
 *
 * Survival (for Red or Blue cell):
 *   Lives when same-colour neighbours ∈ [2, 3] AND total living neighbours ≤ 3.
 *   Dies otherwise.
 *
 * Birth (for empty cell):
 *   Becomes occupied when total living neighbours === 3.
 *   Colour = majority of those 3 neighbours (no tie possible with total = 3).
 *
 * All cells are evaluated simultaneously (double-buffer).
 */
export class CompetitiveLifeRuleEngine {
  computeNextGeneration(board) {
    const w = board.width;
    const h = board.height;
    const cells = Array.from({ length: h }, () => new Array(w).fill(CellState.EMPTY));

    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const current = board.getCellAt(row, col);

        // Count neighbours
        let red = 0, blue = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr;
            const nc = col + dc;
            if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
            const s = board.getCellAt(nr, nc);
            if (s === CellState.RED)       red++;
            else if (s === CellState.BLUE) blue++;
          }
        }
        const total = red + blue;

        if (current !== CellState.EMPTY) {
          const same = current === CellState.RED ? red : blue;
          if (same >= 2 && same <= 3 && total <= 3) {
            cells[row][col] = current; // survives
          }
          // else: dies → stays EMPTY
        } else if (total === 3) {
          // Birth: majority colour wins (no tie possible when total === 3)
          cells[row][col] = red >= blue ? CellState.RED : CellState.BLUE;
        }
      }
    }

    return new Board(w, h, cells);
  }
}

// ── IPlacementValidator ───────────────────────────────────────────────────────

export class StandardPlacementValidator {
  validate(color, positions, board, phase, settings, regionPolicy) {
    const errors  = [];
    const isSetup = phase === MatchPhase.SETUP_PLACEMENT;

    // Count check
    if (isSetup) {
      if (positions.length !== settings.initialPlacementCount) {
        errors.push(
          `Place exactly ${settings.initialPlacementCount} cells (you have ${positions.length})`
        );
      }
    } else {
      if (positions.length < settings.reinforcementMinPlacementCount) {
        errors.push(
          `Place at least ${settings.reinforcementMinPlacementCount} cells (you have ${positions.length})`
        );
      } else if (positions.length > settings.reinforcementMaxPlacementCount) {
        errors.push(`Cannot place more than ${settings.reinforcementMaxPlacementCount} cells`);
      }
    }

    // Per-position checks
    const seen = new Set();
    for (const pos of positions) {
      const k = pos.key();
      if (seen.has(k)) {
        errors.push(`Duplicate position (${pos.row}, ${pos.col})`);
        continue;
      }
      seen.add(k);

      if (!board.isInBounds(pos)) {
        errors.push(`Out of bounds: (${pos.row}, ${pos.col})`);
        continue;
      }
      if (board.getCell(pos) !== CellState.EMPTY) {
        errors.push(`Cell (${pos.row}, ${pos.col}) is already occupied`);
      }
      if (!regionPolicy.canPlace(color, pos, board, settings)) {
        errors.push(`(${pos.row}, ${pos.col}) is not on your side of the board`);
      }
    }

    return errors.length === 0 ? ValidationResult.ok() : ValidationResult.fail(errors);
  }
}

// ── IWinConditionEvaluator ────────────────────────────────────────────────────

export class StandardWinConditionEvaluator {
  evaluate(board, totalGenerations, settings, statsService) {
    const { redCount, blueCount } = statsService.getStatistics(board);
    const redAlive  = redCount  > 0;
    const blueAlive = blueCount > 0;

    // Elimination (checked before generation cap)
    if (!redAlive && !blueAlive) return MatchResultType.DRAW;
    if (!redAlive)               return MatchResultType.BLUE_VICTORY;
    if (!blueAlive)              return MatchResultType.RED_VICTORY;

    // Generation cap
    if (totalGenerations >= settings.maxGenerations) {
      if (redCount  > blueCount) return MatchResultType.RED_VICTORY;
      if (blueCount > redCount)  return MatchResultType.BLUE_VICTORY;
      return MatchResultType.DRAW;
    }

    return MatchResultType.IN_PROGRESS;
  }
}

// ── IBoardStatisticsService ───────────────────────────────────────────────────

export class BoardStatisticsService {
  countCells(board, state) {
    let count = 0;
    for (let r = 0; r < board.height; r++) {
      for (let c = 0; c < board.width; c++) {
        if (board.getCellAt(r, c) === state) count++;
      }
    }
    return count;
  }

  getStatistics(board) {
    return {
      redCount:  this.countCells(board, CellState.RED),
      blueCount: this.countCells(board, CellState.BLUE),
    };
  }
}
