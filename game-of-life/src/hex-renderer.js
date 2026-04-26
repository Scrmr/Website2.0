import { CellState, PlayerColor, MatchPhase, Position } from './domain.js';

const MAX_TINT_AGE = 18;

function liveCellColor(state, age) {
  const t = Math.min(age / MAX_TINT_AGE, 1);
  if (state === CellState.RED) return `hsl(0,74%,${38 + t * 20}%)`;
  return `hsl(213,74%,${46 + t * 20}%)`;
}

const C = {
  bg:           '#0e0e0e',
  grid:         '#1e1e1e',
  divider:      '#484848',
  redSide:      'rgba(232,64,64,0.032)',
  blueSide:     'rgba(64,144,232,0.032)',
  redDraft:     'rgba(232,64,64,0.55)',
  blueDraft:    'rgba(64,144,232,0.55)',
  redDraftDim:  'rgba(232,64,64,0.18)',
  blueDraftDim: 'rgba(64,144,232,0.18)',
  redHover:     'rgba(232,64,64,0.28)',
  blueHover:    'rgba(64,144,232,0.28)',
  stampValid:   { red: 'rgba(232,64,64,0.75)', blue: 'rgba(64,144,232,0.75)' },
  stampInvalid: 'rgba(160,50,50,0.22)',
  contestedTint:   'rgba(255,200,50,0.04)',
  contestedBorder: 'rgba(255,200,50,0.55)',
};

export class HexGameRenderer {
  constructor(canvas, settings) {
    this._canvas   = canvas;
    this._ctx      = canvas.getContext('2d');
    this._settings = settings;
    this._r        = 10; // circumradius
    this._hover    = null;
    this._draft    = { [PlayerColor.RED]: new Set(), [PlayerColor.BLUE]: new Set() };
    this._redReady  = false;
    this._blueReady = false;
    this._stamp     = null;
  }

  get cellSize() { return this._r * 2; }

  setHover(pos)  { this._hover = pos; }
  clearHover()   { this._hover = null; }

  setDraft(color, positions) {
    this._draft[color] = new Set(positions.map(p => p.key()));
  }

  setReadyStates(redReady, blueReady) {
    this._redReady  = redReady;
    this._blueReady = blueReady;
  }

  setStampPreview(validPositions, invalidPositions, color) {
    this._stamp = {
      valid:   new Set(validPositions.map(p => p.key())),
      invalid: new Set(invalidPositions.map(p => p.key())),
      color,
    };
  }

  clearStampPreview() { this._stamp = null; }

  resize(containerWidth) {
    const { boardWidth, boardHeight } = this._settings;
    // canvas width = (boardWidth + 0.5) * r * sqrt(3)
    const r = Math.max(5, Math.floor(containerWidth / ((boardWidth + 0.5) * Math.sqrt(3))));
    this._r = r;
    const W = r * Math.sqrt(3);
    this._canvas.width  = Math.ceil((boardWidth  + 0.5) * W);
    this._canvas.height = Math.ceil(boardHeight  * r * 1.5 + r * 0.5);
  }

  /** Screen-space center of hex (row, col) — odd-r offset, pointy-top. */
  _hexCenter(row, col) {
    const r = this._r, W = r * Math.sqrt(3);
    return {
      cx: (col + (row & 1) * 0.5) * W + W * 0.5,
      cy: row * r * 1.5 + r,
    };
  }

  /** Trace a pointy-top hexagon at (cx, cy) with radius slightly inside circumradius. */
  _hexPath(ctx, cx, cy) {
    const r = this._r - 0.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /** Convert canvas pixel coordinates to board cell. Returns Position or null. */
  hitTest(canvasX, canvasY) {
    const r = this._r, W = r * Math.sqrt(3);
    const { boardWidth, boardHeight } = this._settings;

    // Estimate row, then search a small neighbourhood for the closest center
    const approxRow = Math.round((canvasY - r) / (r * 1.5));
    let best = null, bestDist = Infinity;
    for (let tr = Math.max(0, approxRow - 1); tr <= Math.min(boardHeight - 1, approxRow + 1); tr++) {
      const approxCol = Math.round((canvasX - W * 0.5) / W - (tr & 1) * 0.5);
      for (let tc = Math.max(0, approxCol - 1); tc <= Math.min(boardWidth - 1, approxCol + 1); tc++) {
        const { cx, cy } = this._hexCenter(tr, tc);
        const d2 = (canvasX - cx) ** 2 + (canvasY - cy) ** 2;
        if (d2 < bestDist) { bestDist = d2; best = new Position(tr, tc); }
      }
    }
    return best;
  }

  render(board, phase, roundNumber = 1) {
    const { boardWidth, boardHeight, contestedZoneWidth, contestedZoneUnlocksAtRound } = this._settings;
    const r   = this._r;
    const W   = r * Math.sqrt(3);
    const ctx = this._ctx;
    const mid = Math.floor(boardWidth / 2);
    const isPlacement = phase === MatchPhase.SETUP_PLACEMENT ||
                        phase === MatchPhase.REINFORCEMENT_PLACEMENT ||
                        (this._settings.continuousMode && phase === MatchPhase.SIMULATION);
    const isContested = contestedZoneWidth > 0 && roundNumber >= contestedZoneUnlocksAtRound;
    const halfC  = Math.floor(contestedZoneWidth / 2);
    const cStart = mid - halfC;
    const cEnd   = mid + halfC;

    // ── Background ──
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    // ── Per-hex rendering ──
    for (let row = 0; row < boardHeight; row++) {
      for (let col = 0; col < boardWidth; col++) {
        const { cx, cy } = this._hexCenter(row, col);
        const state      = board.getCellAt(row, col);
        const k          = `${row},${col}`;
        const isRedCol   = col < mid;
        const inContest  = isContested && col >= cStart && col < cEnd;

        // Background tint (placement phase only)
        if (isPlacement) {
          this._hexPath(ctx, cx, cy);
          ctx.fillStyle = inContest ? C.contestedTint
                        : isRedCol  ? C.redSide
                        :             C.blueSide;
          ctx.fill();
        }

        // Cell / draft fill
        let fill = null;
        if (state === CellState.RED || state === CellState.BLUE) {
          fill = liveCellColor(state, board.getAgeAt(row, col));
        } else if (isPlacement) {
          if      (this._draft[PlayerColor.RED].has(k))  fill = this._redReady  ? C.redDraftDim  : C.redDraft;
          else if (this._draft[PlayerColor.BLUE].has(k)) fill = this._blueReady ? C.blueDraftDim : C.blueDraft;
        }

        // Stamp preview overrides draft
        if (this._stamp && isPlacement) {
          if      (this._stamp.valid.has(k))   fill = C.stampValid[this._stamp.color] ?? C.stampValid.red;
          else if (this._stamp.invalid.has(k)) fill = C.stampInvalid;
        }

        if (fill) {
          this._hexPath(ctx, cx, cy);
          ctx.fillStyle = fill;
          ctx.fill();
        }

        // Hover
        if (this._hover?.row === row && this._hover?.col === col && isPlacement && !this._stamp) {
          this._hexPath(ctx, cx, cy);
          ctx.fillStyle = isRedCol
            ? (this._redReady  ? 'rgba(232,64,64,0.08)'  : C.redHover)
            : (this._blueReady ? 'rgba(64,144,232,0.08)' : C.blueHover);
          ctx.fill();
        }

        // Hex outline
        if (r >= 7) {
          this._hexPath(ctx, cx, cy);
          ctx.strokeStyle = C.grid;
          ctx.lineWidth   = 0.5;
          ctx.stroke();
        }

        // Contested dashed border per hex
        if (inContest) {
          this._hexPath(ctx, cx, cy);
          ctx.strokeStyle = C.contestedBorder;
          ctx.lineWidth   = 1;
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // ── Centre divider — zigzag following actual hex edge boundaries ──
    // Even rows: boundary at x = mid*W; odd rows: boundary at x = mid*W + W/2
    ctx.strokeStyle = C.divider;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(mid * W, 0);
    for (let row = 0; row < boardHeight; row++) {
      const cy = row * r * 1.5 + r;
      const x  = (row & 1) ? mid * W + W * 0.5 : mid * W;
      ctx.lineTo(x, cy - r * 0.5); // top-right vertex of (row, mid-1)
      ctx.lineTo(x, cy + r * 0.5); // bottom-right vertex of (row, mid-1)
    }
    const lastX = ((boardHeight - 1) & 1) ? mid * W + W * 0.5 : mid * W;
    ctx.lineTo(lastX, this._canvas.height);
    ctx.stroke();
  }
}
