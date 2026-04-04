import { CellState, PlayerColor, MatchPhase } from './domain.js';

// Colour palette
const C = {
  bg:          '#0e0e0e',
  red:         '#e84040',
  blue:        '#4090e8',
  redDraft:    'rgba(232,64,64,0.55)',
  blueDraft:   'rgba(64,144,232,0.55)',
  redDraftDim: 'rgba(232,64,64,0.2)',
  blueDraftDim:'rgba(64,144,232,0.2)',
  redHover:    'rgba(232,64,64,0.28)',
  blueHover:   'rgba(64,144,232,0.28)',
  redSide:     'rgba(232,64,64,0.035)',
  blueSide:    'rgba(64,144,232,0.035)',
  grid:        '#1a1a1a',
  divider:     '#484848',
};

/**
 * GameRenderer — pure drawing concern.
 * Knows nothing about match rules or player input; only draws what it is told.
 */
export class GameRenderer {
  constructor(canvas, settings) {
    this._canvas   = canvas;
    this._ctx      = canvas.getContext('2d');
    this._settings = settings;
    this._s        = 1;                    // cell size in pixels (set by resize())
    this._hover    = null;                 // Position | null
    this._draft    = {
      [PlayerColor.RED]:  new Set(),
      [PlayerColor.BLUE]: new Set(),
    };
    this._redReady  = false;
    this._blueReady = false;
  }

  /** Cell size for use by the controller's hit-testing. */
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

  /**
   * Resize the canvas to fill containerWidth.
   * Cell size is chosen so the board fits exactly.
   */
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

    // Subtle side tints during placement phases
    if (isPlacement) {
      ctx.fillStyle = C.redSide;
      ctx.fillRect(0, 0, mid * s, this._canvas.height);
      ctx.fillStyle = C.blueSide;
      ctx.fillRect(mid * s, 0, this._canvas.width - mid * s, this._canvas.height);
    }

    // Cells
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

    // Grid lines (only when cells are large enough to benefit from them)
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

    // Centre divider (the boundary between the two players' sides)
    ctx.strokeStyle = C.divider;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(mid * s, 0);
    ctx.lineTo(mid * s, this._canvas.height);
    ctx.stroke();

    // Hover highlight
    if (this._hover && isPlacement) {
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
