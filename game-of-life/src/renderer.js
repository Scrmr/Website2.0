import { CellState, PlayerColor, MatchPhase, Position } from './domain.js';

// Maximum age at which tinting is fully applied (cells older than this
// look the same as cells at this age).
const MAX_TINT_AGE = 18;

const C = {
  bg:           '#0e0e0e',
  grid:         '#1a1a1a',
  divider:      '#484848',
  redSide:      'rgba(232,64,64,0.032)',
  blueSide:     'rgba(64,144,232,0.032)',
  // Draft overlays
  redDraft:     'rgba(232,64,64,0.55)',
  blueDraft:    'rgba(64,144,232,0.55)',
  redDraftDim:  'rgba(232,64,64,0.18)',
  blueDraftDim: 'rgba(64,144,232,0.18)',
  // Hover
  redHover:     'rgba(232,64,64,0.28)',
  blueHover:    'rgba(64,144,232,0.28)',
  // Stamp preview
  stampValid:   { red: 'rgba(232,64,64,0.75)', blue: 'rgba(64,144,232,0.75)' },
  stampInvalid: 'rgba(160,50,50,0.22)',
  // Contested zone
  contestedTint:   'rgba(255,200,50,0.04)',
  contestedBorder: 'rgba(255,200,50,0.22)',
};

/** Returns the HSL fill color for a live cell given its colour and age. */
function liveCellColor(state, age) {
  const t = Math.min(age / MAX_TINT_AGE, 1); // 0 = newborn, 1 = veteran
  if (state === CellState.RED) {
    // lightness: 38% (young) → 58% (veteran)
    return `hsl(0,74%,${38 + t * 20}%)`;
  } else {
    // lightness: 46% (young) → 66% (veteran)
    return `hsl(213,74%,${46 + t * 20}%)`;
  }
}

export class GameRenderer {
  constructor(canvas, settings) {
    this._canvas   = canvas;
    this._ctx      = canvas.getContext('2d');
    this._settings = settings;
    this._s        = 1;
    this._hover    = null;
    this._draft    = { [PlayerColor.RED]: new Set(), [PlayerColor.BLUE]: new Set() };
    this._redReady  = false;
    this._blueReady = false;
    this._stamp     = null; // { valid: Set<key>, invalid: Set<key>, color }
  }

  get cellSize() { return this._s; }

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

  /** Convert canvas pixel coordinates to board cell. Returns Position or null. */
  hitTest(canvasX, canvasY) {
    const s = this._s;
    if (!s) return null;
    const { boardWidth, boardHeight } = this._settings;
    const col = Math.floor(canvasX / s);
    const row = Math.floor(canvasY / s);
    if (row < 0 || row >= boardHeight || col < 0 || col >= boardWidth) return null;
    return new Position(row, col);
  }

  resize(containerWidth) {
    const { boardWidth, boardHeight } = this._settings;
    this._s = Math.max(4, Math.floor(containerWidth / boardWidth));
    this._canvas.width  = this._s * boardWidth;
    this._canvas.height = this._s * boardHeight;
  }

  /**
   * @param {Board}      board
   * @param {string}     phase       — MatchPhase value
   * @param {number}     roundNumber — used to determine if contested zone is active
   */
  render(board, phase, roundNumber = 1) {
    const { boardWidth, boardHeight, contestedZoneWidth, contestedZoneUnlocksAtRound } = this._settings;
    const s   = this._s;
    const ctx = this._ctx;
    const mid = Math.floor(boardWidth / 2);
    const isPlacement = phase === MatchPhase.SETUP_PLACEMENT ||
                        phase === MatchPhase.REINFORCEMENT_PLACEMENT ||
                        (this._settings.continuousMode && phase === MatchPhase.SIMULATION);
    const isContested = contestedZoneWidth > 0 &&
                        roundNumber >= contestedZoneUnlocksAtRound;

    // ── Background ──
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    // ── Side tints ──
    if (isPlacement) {
      ctx.fillStyle = C.redSide;
      ctx.fillRect(0, 0, mid * s, this._canvas.height);
      ctx.fillStyle = C.blueSide;
      ctx.fillRect(mid * s, 0, this._canvas.width - mid * s, this._canvas.height);
    }

    // ── Contested zone overlay ──
    if (isContested && isPlacement) {
      const halfC  = Math.floor(contestedZoneWidth / 2);
      const cStart = mid - halfC;
      ctx.fillStyle = C.contestedTint;
      ctx.fillRect(cStart * s, 0, contestedZoneWidth * s, this._canvas.height);
    }

    // ── Cells ──
    for (let r = 0; r < boardHeight; r++) {
      for (let c = 0; c < boardWidth; c++) {
        const state = board.getCellAt(r, c);
        let color   = null;

        if (state === CellState.RED || state === CellState.BLUE) {
          // Age-tinted live cell
          color = liveCellColor(state, board.getAgeAt(r, c));
        } else if (isPlacement) {
          const k = `${r},${c}`;
          if (this._draft[PlayerColor.RED].has(k)) {
            color = this._redReady ? C.redDraftDim : C.redDraft;
          } else if (this._draft[PlayerColor.BLUE].has(k)) {
            color = this._blueReady ? C.blueDraftDim : C.blueDraft;
          }
        }

        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(c * s + 1, r * s + 1, s - 1, s - 1);
        }
      }
    }

    // ── Stamp preview ──
    if (this._stamp && isPlacement) {
      const validColor = C.stampValid[this._stamp.color] ?? C.stampValid.red;
      for (const key of this._stamp.valid) {
        const [r, c] = key.split(',').map(Number);
        if (r >= 0 && r < boardHeight && c >= 0 && c < boardWidth) {
          ctx.fillStyle = validColor;
          ctx.fillRect(c * s + 1, r * s + 1, s - 1, s - 1);
        }
      }
      for (const key of this._stamp.invalid) {
        const [r, c] = key.split(',').map(Number);
        if (r >= 0 && r < boardHeight && c >= 0 && c < boardWidth) {
          ctx.fillStyle = C.stampInvalid;
          ctx.fillRect(c * s + 1, r * s + 1, s - 1, s - 1);
        }
      }
    }

    // ── Grid lines ──
    if (s >= 6) {
      ctx.strokeStyle = C.grid;
      ctx.lineWidth   = 0.5;
      ctx.beginPath();
      for (let c = 0; c <= boardWidth;  c++) { ctx.moveTo(c * s, 0); ctx.lineTo(c * s, this._canvas.height); }
      for (let r = 0; r <= boardHeight; r++) { ctx.moveTo(0, r * s); ctx.lineTo(this._canvas.width, r * s); }
      ctx.stroke();
    }

    // ── Contested zone dashed borders ──
    if (isContested) {
      const halfC  = Math.floor(contestedZoneWidth / 2);
      const cStart = mid - halfC;
      const cEnd   = mid + halfC;
      ctx.strokeStyle = C.contestedBorder;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cStart * s, 0); ctx.lineTo(cStart * s, this._canvas.height);
      ctx.moveTo(cEnd   * s, 0); ctx.lineTo(cEnd   * s, this._canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Centre divider ──
    ctx.strokeStyle = C.divider;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(mid * s, 0);
    ctx.lineTo(mid * s, this._canvas.height);
    ctx.stroke();

    // ── Hover ──
    if (this._hover && isPlacement && !this._stamp) {
      const { row, col } = this._hover;
      const isRed = col < mid;
      const color = isRed
        ? (this._redReady  ? 'rgba(232,64,64,0.08)'  : C.redHover)
        : (this._blueReady ? 'rgba(64,144,232,0.08)' : C.blueHover);
      ctx.fillStyle = color;
      ctx.fillRect(col * s + 1, row * s + 1, s - 1, s - 1);
    }
  }
}
