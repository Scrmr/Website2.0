import { CellState, PlayerColor, MatchPhase } from './domain.js';

const C = {
  bg:           '#0e0e0e',
  red:          '#e84040',
  blue:         '#4090e8',
  redDraft:     'rgba(232,64,64,0.55)',
  blueDraft:    'rgba(64,144,232,0.55)',
  redDraftDim:  'rgba(232,64,64,0.18)',
  blueDraftDim: 'rgba(64,144,232,0.18)',
  redHover:     'rgba(232,64,64,0.28)',
  blueHover:    'rgba(64,144,232,0.28)',
  redSide:      'rgba(232,64,64,0.032)',
  blueSide:     'rgba(64,144,232,0.032)',
  stampValid:   { red: 'rgba(232,64,64,0.75)', blue: 'rgba(64,144,232,0.75)' },
  stampInvalid: 'rgba(180,60,60,0.22)',
  grid:         '#1a1a1a',
  divider:      '#484848',
};

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

  resize(containerWidth) {
    const { boardWidth, boardHeight } = this._settings;
    this._s = Math.max(4, Math.floor(containerWidth / boardWidth));
    this._canvas.width  = this._s * boardWidth;
    this._canvas.height = this._s * boardHeight;
  }

  render(board, phase) {
    const { boardWidth, boardHeight } = this._settings;
    const s   = this._s;
    const ctx = this._ctx;
    const mid = Math.floor(boardWidth / 2);
    const isPlacement = phase === MatchPhase.SETUP_PLACEMENT ||
                        phase === MatchPhase.REINFORCEMENT_PLACEMENT;

    // Background
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    // Subtle side tints during placement
    if (isPlacement) {
      ctx.fillStyle = C.redSide;
      ctx.fillRect(0, 0, mid * s, this._canvas.height);
      ctx.fillStyle = C.blueSide;
      ctx.fillRect(mid * s, 0, this._canvas.width - mid * s, this._canvas.height);
    }

    // Cells and draft overlays
    for (let r = 0; r < boardHeight; r++) {
      for (let c = 0; c < boardWidth; c++) {
        const state = board.getCellAt(r, c);
        let color   = null;

        if (state === CellState.RED) {
          color = C.red;
        } else if (state === CellState.BLUE) {
          color = C.blue;
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

    // Stamp preview (drawn on top of draft, below grid lines)
    if (this._stamp && isPlacement) {
      const validColor   = C.stampValid[this._stamp.color] ?? C.stampValid.red;
      const invalidColor = C.stampInvalid;

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
          ctx.fillStyle = invalidColor;
          ctx.fillRect(c * s + 1, r * s + 1, s - 1, s - 1);
        }
      }
    }

    // Grid lines
    if (s >= 6) {
      ctx.strokeStyle = C.grid;
      ctx.lineWidth   = 0.5;
      ctx.beginPath();
      for (let c = 0; c <= boardWidth;  c++) {
        ctx.moveTo(c * s, 0);
        ctx.lineTo(c * s, this._canvas.height);
      }
      for (let r = 0; r <= boardHeight; r++) {
        ctx.moveTo(0, r * s);
        ctx.lineTo(this._canvas.width, r * s);
      }
      ctx.stroke();
    }

    // Centre divider
    ctx.strokeStyle = C.divider;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(mid * s, 0);
    ctx.lineTo(mid * s, this._canvas.height);
    ctx.stroke();

    // Hover highlight (only when not in stamp mode, stamp shows its own preview)
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
