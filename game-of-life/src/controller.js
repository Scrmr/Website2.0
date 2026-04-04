import { CellState, PlayerColor, MatchPhase, MatchResultType, Position } from './domain.js';

/**
 * LocalMatchController — presentation layer for local hotseat play.
 *
 * Wires canvas pointer events and HTML button clicks to coordinator commands.
 * Does not contain any game rules; it translates user gestures into
 * updateDraft / setReady / cancelReady calls.
 *
 * Designed so it can later be replaced by (or run alongside) a
 * NetworkPlayerInputAdapter without touching the coordinator or domain.
 */
export class LocalMatchController {
  constructor(coordinator, renderer, settings) {
    this._coord    = coordinator;
    this._renderer = renderer;
    this._settings = settings;
    this._canvas   = null;
    this._ui       = null;
    this._drafts   = { [PlayerColor.RED]: [], [PlayerColor.BLUE]: [] };
    this._prevPhase = null;
    this._handlers  = null;
    this._newGameCb = null;
  }

  /** Called when "New Game" is pressed. */
  onNewGame(fn) { this._newGameCb = fn; }

  /** Attach event listeners and do the first render. */
  attach(canvas, ui) {
    this._canvas = canvas;
    this._ui     = ui;

    this._handlers = {
      pointermove:  e => this._onPointerMove(e),
      pointerleave: () => { this._renderer.clearHover(); this._doRender(); },
      pointerdown:  e => { e.preventDefault(); this._onPointerDown(e); },
      resize:       () => this._onResize(),
    };

    canvas.addEventListener('pointermove',  this._handlers.pointermove);
    canvas.addEventListener('pointerleave', this._handlers.pointerleave);
    canvas.addEventListener('pointerdown',  this._handlers.pointerdown);
    window.addEventListener('resize',       this._handlers.resize);

    ui.redReady.addEventListener('click',  () => this._onReady(PlayerColor.RED));
    ui.blueReady.addEventListener('click', () => this._onReady(PlayerColor.BLUE));
    ui.newGame.addEventListener('click',   () => { if (this._newGameCb) this._newGameCb(); });

    this._coord.onUpdate(() => this._doRender());
    this._onResize();
  }

  /** Remove all event listeners. Call before creating a new game. */
  detach() {
    if (!this._canvas || !this._handlers) return;
    this._canvas.removeEventListener('pointermove',  this._handlers.pointermove);
    this._canvas.removeEventListener('pointerleave', this._handlers.pointerleave);
    this._canvas.removeEventListener('pointerdown',  this._handlers.pointerdown);
    window.removeEventListener('resize', this._handlers.resize);
    this._coord.dispose();
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _onResize() {
    const w = this._canvas.parentElement.clientWidth;
    this._renderer.resize(w);
    this._doRender();
  }

  /** Convert a pointer event to board Position, or null if out of bounds. */
  _getPos(e) {
    const rect   = this._canvas.getBoundingClientRect();
    const scaleX = this._canvas.width  / rect.width;
    const scaleY = this._canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top)  * scaleY;
    const s = this._renderer.cellSize;
    if (!s) return null;
    const col = Math.floor(x / s);
    const row = Math.floor(y / s);
    const { boardWidth, boardHeight } = this._settings;
    if (row < 0 || row >= boardHeight || col < 0 || col >= boardWidth) return null;
    return new Position(row, col);
  }

  _onPointerMove(e) {
    const pos   = this._getPos(e);
    const phase = this._coord.match.phase;
    this._renderer.setHover(pos);

    // Update cursor
    const isPlacement = phase === MatchPhase.SETUP_PLACEMENT ||
                        phase === MatchPhase.REINFORCEMENT_PLACEMENT;
    if (pos && isPlacement) {
      const mid   = Math.floor(this._settings.boardWidth / 2);
      const color = pos.col < mid ? PlayerColor.RED : PlayerColor.BLUE;
      this._canvas.style.cursor = this._coord.isReady(color) ? 'not-allowed' : 'crosshair';
    } else {
      this._canvas.style.cursor = 'default';
    }

    this._doRender();
  }

  _onPointerDown(e) {
    const phase = this._coord.match.phase;
    const isPlacement = phase === MatchPhase.SETUP_PLACEMENT ||
                        phase === MatchPhase.REINFORCEMENT_PLACEMENT;
    if (!isPlacement) return;

    const pos = this._getPos(e);
    if (!pos) return;

    const mid   = Math.floor(this._settings.boardWidth / 2);
    const color = pos.col < mid ? PlayerColor.RED : PlayerColor.BLUE;

    // Ignore clicks if player is already locked in
    if (this._coord.isReady(color)) return;

    // Ignore clicks on occupied board cells (cells placed in previous rounds)
    if (this._coord.match.board.getCell(pos) !== CellState.EMPTY) return;

    // Toggle position in draft
    const draft   = this._drafts[color];
    const idx     = draft.findIndex(p => p.row === pos.row && p.col === pos.col);

    if (idx >= 0) {
      draft.splice(idx, 1);
    } else {
      const max = phase === MatchPhase.SETUP_PLACEMENT
        ? this._settings.initialPlacementCount
        : this._settings.reinforcementMaxPlacementCount;
      if (draft.length < max) draft.push(pos);
    }

    this._coord.updateDraft(color, draft);
    this._renderer.setDraft(color, draft);
    this._doRender();
  }

  _onReady(color) {
    const phase = this._coord.match.phase;
    if (phase !== MatchPhase.SETUP_PLACEMENT && phase !== MatchPhase.REINFORCEMENT_PLACEMENT) return;

    if (this._coord.isReady(color)) {
      this._coord.cancelReady(color);
    } else {
      const result = this._coord.setReady(color);
      if (!result.success) {
        this._showError(color, result.errors.join('\n'));
      }
    }
    this._doRender();
  }

  _showError(color, msg) {
    const el = color === PlayerColor.RED ? this._ui.redError : this._ui.blueError;
    el.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ''; }, 4000);
  }

  _doRender() {
    const match   = this._coord.match;
    const { phase, board, result, totalGenerations, settings } = match;

    // When simulation starts, discard local draft state
    if (phase === MatchPhase.SIMULATION && this._prevPhase !== MatchPhase.SIMULATION) {
      this._drafts[PlayerColor.RED]  = [];
      this._drafts[PlayerColor.BLUE] = [];
      this._renderer.setDraft(PlayerColor.RED,  []);
      this._renderer.setDraft(PlayerColor.BLUE, []);
    }
    this._prevPhase = phase;

    const redReady  = this._coord.isReady(PlayerColor.RED);
    const blueReady = this._coord.isReady(PlayerColor.BLUE);
    this._renderer.setReadyStates(redReady, blueReady);
    this._renderer.render(board, phase);

    // ── Live cell counts (direct iteration — no extra allocation) ──
    let red = 0, blue = 0;
    for (let r = 0; r < board.height; r++) {
      for (let c = 0; c < board.width; c++) {
        const s = board.getCellAt(r, c);
        if      (s === 'red')  red++;
        else if (s === 'blue') blue++;
      }
    }

    const isPlacement = phase === MatchPhase.SETUP_PLACEMENT ||
                        phase === MatchPhase.REINFORCEMENT_PLACEMENT;
    const isSetup     = phase === MatchPhase.SETUP_PLACEMENT;
    const redDraft    = this._drafts[PlayerColor.RED].length;
    const blueDraft   = this._drafts[PlayerColor.BLUE].length;
    const required    = isSetup ? settings.initialPlacementCount : null;
    const { reinforcementMinPlacementCount: minR, reinforcementMaxPlacementCount: maxR } = settings;

    // Generation counter
    this._ui.genCounter.textContent = `Generation ${totalGenerations} / ${settings.maxGenerations}`;

    // Phase label
    let phaseText = '';
    switch (phase) {
      case MatchPhase.SETUP_PLACEMENT:
        phaseText = `Setup — place ${settings.initialPlacementCount} cells each, then press Ready`;
        break;
      case MatchPhase.SIMULATION:
        phaseText = 'Simulating…';
        break;
      case MatchPhase.REINFORCEMENT_PLACEMENT:
        phaseText = `Reinforcement — place ${minR}–${maxR} cells each, then press Ready`;
        break;
      case MatchPhase.ENDED:
        if      (result === MatchResultType.RED_VICTORY)  phaseText = 'Red wins!';
        else if (result === MatchResultType.BLUE_VICTORY) phaseText = 'Blue wins!';
        else                                               phaseText = "It's a draw!";
        break;
    }
    this._ui.phaseLabel.textContent = phaseText;

    // ── Player panels ──
    this._ui.redCells.textContent   = `Cells alive: ${red}`;
    this._ui.blueCells.textContent  = `Cells alive: ${blue}`;
    this._ui.redPlaced.textContent  = isPlacement
      ? `Staged: ${redDraft}${required != null ? ' / ' + required : ''}`
      : '';
    this._ui.bluePlaced.textContent = isPlacement
      ? `Staged: ${blueDraft}${required != null ? ' / ' + required : ''}`
      : '';

    const simRunning = phase === MatchPhase.SIMULATION;
    this._ui.redReady.disabled  = !isPlacement || simRunning;
    this._ui.blueReady.disabled = !isPlacement || simRunning;
    this._ui.redReady.textContent  = redReady  ? 'Cancel' : 'Ready';
    this._ui.blueReady.textContent = blueReady ? 'Cancel' : 'Ready';
    this._ui.redReady.classList.toggle('btn-ready-active', redReady);
    this._ui.blueReady.classList.toggle('btn-ready-active', blueReady);

    this._ui.newGame.style.display = phase === MatchPhase.ENDED ? 'inline-block' : 'none';
  }
}
