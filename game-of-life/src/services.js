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

// ── HexCompetitiveLifeRuleEngine ──────────────────────────────────────────────

const HEX_DIRS_EVEN = [[-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]];
const HEX_DIRS_ODD  = [[-1, 0],[-1,1],[0,-1],[0,1],[1, 0],[1,1]];

/**
 * Hex-grid competitive life rules (odd-r offset, pointy-top).
 *
 * Survival: same-colour neighbours ∈ [2,3] AND total living neighbours ≤ 4.
 * Birth:    empty cell with exactly 3 living neighbours → majority colour.
 */
export class HexCompetitiveLifeRuleEngine {
  computeNextGeneration(board) {
    const w = board.width, h = board.height;
    const cells = Array.from({ length: h }, () => new Array(w).fill(CellState.EMPTY));
    const ages  = Array.from({ length: h }, () => new Array(w).fill(0));

    for (let row = 0; row < h; row++) {
      const dirs = (row & 1) ? HEX_DIRS_ODD : HEX_DIRS_EVEN;
      for (let col = 0; col < w; col++) {
        const current = board.getCellAt(row, col);
        let red = 0, blue = 0;
        for (const [dr, dc] of dirs) {
          const nr = row + dr, nc = col + dc;
          if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
          const s = board.getCellAt(nr, nc);
          if      (s === CellState.RED)  red++;
          else if (s === CellState.BLUE) blue++;
        }
        const total = red + blue;

        if (current !== CellState.EMPTY) {
          const same = current === CellState.RED ? red : blue;
          if (same >= 2 && same <= 3 && total <= 4) {
            cells[row][col] = current;
            ages[row][col]  = board.getAgeAt(row, col) + 1;
          }
        } else if (total === 3) {
          cells[row][col] = red >= blue ? CellState.RED : CellState.BLUE;
          ages[row][col]  = 1;
        }
      }
    }
    return new Board(w, h, cells, ages);
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

    if (settings.maxGenerations > 0 && totalGenerations >= settings.maxGenerations) {
      if (redCount  > blueCount) return MatchResultType.RED_VICTORY;
      if (blueCount > redCount)  return MatchResultType.BLUE_VICTORY;
      return MatchResultType.DRAW;
    }

    return MatchResultType.IN_PROGRESS;
  }
}

// ── IBoardStatisticsService ───────────────────────────────────────────────────

export class BoardStatisticsService {
  getStatistics(board) {
    let redCount = 0, blueCount = 0;
    for (let r = 0; r < board.height; r++)
      for (let c = 0; c < board.width; c++) {
        const s = board.getCellAt(r, c);
        if      (s === CellState.RED)  redCount++;
        else if (s === CellState.BLUE) blueCount++;
      }
    return { redCount, blueCount };
  }

  getEcologyMetrics(board) {
    const area = board.width * board.height;
    let live = 0;
    let red = 0;
    let blue = 0;
    let stable = 0;
    let ageSum = 0;
    let birthPressure = 0;
    const occupiedRows = new Set();
    const occupiedCols = new Set();

    for (let row = 0; row < board.height; row++) {
      for (let col = 0; col < board.width; col++) {
        const current = board.getCellAt(row, col);
        let redN = 0;
        let blueN = 0;

        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr;
            const nc = col + dc;
            if (nr < 0 || nr >= board.height || nc < 0 || nc >= board.width) continue;
            const state = board.getCellAt(nr, nc);
            if (state === CellState.RED) redN++;
            else if (state === CellState.BLUE) blueN++;
          }
        }

        const totalN = redN + blueN;
        if (current === CellState.EMPTY) {
          if (totalN === 3) birthPressure++;
          continue;
        }

        live++;
        ageSum += board.getAgeAt(row, col);
        occupiedRows.add(row);
        occupiedCols.add(col);
        if (current === CellState.RED) red++;
        else blue++;

        const same = current === CellState.RED ? redN : blueN;
        if (same >= 2 && same <= 3 && totalN <= 3) stable++;
      }
    }

    if (live === 0) {
      return {
        stability: 0,
        diversity: 0,
        age: 0,
        volatility: 0,
        territory: 0,
      };
    }

    const stability = Math.round((stable / live) * 100);
    const diversity = Math.round((1 - Math.abs(red - blue) / live) * 100);
    const age = Math.round(Math.min(ageSum / live / 24, 1) * 100);
    const pressure = Math.min((birthPressure + (live - stable)) / Math.max(live, 1), 1);
    const volatility = Math.round(pressure * 100);
    const footprint = (occupiedRows.size / board.height + occupiedCols.size / board.width) / 2;
    const density = Math.min(live / Math.max(area * 0.18, 1), 1);
    const territory = Math.round(((footprint * 0.65) + (density * 0.35)) * 100);

    return { stability, diversity, age, volatility, territory };
  }
}
