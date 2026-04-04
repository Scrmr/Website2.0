import { CellState, PlayerColor, MatchPhase, MatchResultType, Board, Position, ValidationResult } from './domain.js';

// ── IPlacementRegionPolicy ────────────────────────────────────────────────────

/**
 * HalfBoardPlacementRegionPolicy
 *
 * Base rule: Red = left half (col < mid), Blue = right half (col >= mid).
 *
 * Contested zone: from contestedZoneUnlocksAtRound onward, the central
 * contestedZoneWidth columns are open to BOTH players, letting them push
 * cells deeper toward the opponent.
 */
export class HalfBoardPlacementRegionPolicy {
  canPlace(color, pos, _board, settings, roundNumber = 1) {
    const mid = Math.floor(settings.boardWidth / 2);

    // Contested zone check (only after unlock round)
    if (settings.contestedZoneWidth > 0 &&
        roundNumber >= settings.contestedZoneUnlocksAtRound) {
      const halfC  = Math.floor(settings.contestedZoneWidth / 2);
      const cStart = mid - halfC;
      const cEnd   = mid + halfC; // exclusive
      if (pos.col >= cStart && pos.col < cEnd) return true;
    }

    return color === PlayerColor.RED ? pos.col < mid : pos.col >= mid;
  }
}

// ── ILifeRuleEngine ───────────────────────────────────────────────────────────

/**
 * CompetitiveLifeRuleEngine
 *
 * Survival: same-colour neighbours ∈ [2,3] AND total living neighbours ≤ 3.
 * Birth:    empty cell with exactly 3 living neighbours → majority colour.
 * All cells evaluated simultaneously (double-buffer). Ages tracked per cell.
 */
export class CompetitiveLifeRuleEngine {
  computeNextGeneration(board) {
    const w = board.width;
    const h = board.height;
    const cells = Array.from({ length: h }, () => new Array(w).fill(CellState.EMPTY));
    const ages  = Array.from({ length: h }, () => new Array(w).fill(0));

    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const current = board.getCellAt(row, col);

        let red = 0, blue = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr, nc = col + dc;
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
            cells[row][col] = current;
            ages[row][col]  = board.getAgeAt(row, col) + 1; // survives: age++
          }
          // else: dies → EMPTY, age stays 0
        } else if (total === 3) {
          cells[row][col] = red >= blue ? CellState.RED : CellState.BLUE;
          ages[row][col]  = 1; // newborn
        }
      }
    }

    return new Board(w, h, cells, ages);
  }
}

// ── IPlacementValidator ───────────────────────────────────────────────────────

export class StandardPlacementValidator {
  /**
   * @param maxOverride   Banking-adjusted max (null = use settings default).
   * @param force         When true (timer expired), skip minimum count check.
   * @param roundNumber   Passed through to the region policy for contested zone.
   */
  validate(color, positions, board, phase, settings, regionPolicy,
           maxOverride = null, force = false, roundNumber = 1) {
    const errors  = [];
    const isSetup = phase === MatchPhase.SETUP_PLACEMENT;

    // Count checks (skipped on force-ready from timer expiry)
    if (!force) {
      if (isSetup) {
        if (positions.length !== settings.initialPlacementCount) {
          errors.push(
            `Place exactly ${settings.initialPlacementCount} cells (you have ${positions.length})`
          );
        }
      } else {
        const max = maxOverride ?? settings.reinforcementMaxPlacementCount;
        if (positions.length < settings.reinforcementMinPlacementCount) {
          errors.push(
            `Place at least ${settings.reinforcementMinPlacementCount} cells (you have ${positions.length})`
          );
        } else if (positions.length > max) {
          errors.push(`Cannot place more than ${max} cells (your budget this round)`);
        }
      }
    }

    // Per-position checks (always enforced, even on force)
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
      if (!regionPolicy.canPlace(color, pos, board, settings, roundNumber)) {
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

    if (!redAlive && !blueAlive) return MatchResultType.DRAW;
    if (!redAlive)               return MatchResultType.BLUE_VICTORY;
    if (!blueAlive)              return MatchResultType.RED_VICTORY;

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
    for (let r = 0; r < board.height; r++)
      for (let c = 0; c < board.width; c++)
        if (board.getCellAt(r, c) === state) count++;
    return count;
  }

  getStatistics(board) {
    return {
      redCount:  this.countCells(board, CellState.RED),
      blueCount: this.countCells(board, CellState.BLUE),
    };
  }
}
