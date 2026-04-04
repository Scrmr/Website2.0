import { CellState, PlayerColor, MatchPhase, MatchResultType, Position, PATTERNS } from './domain.js';

// ── Pattern helpers ───────────────────────────────────────────────────────────

/** Mirror a cell array horizontally within its own bounding box. */
function mirrorH(cells) {
  const cols = cells.map(([, c]) => c);
  const minC = Math.min(...cols), maxC = Math.max(...cols);
  return cells.map(([r, c]) => [r, minC + maxC - c]);
}

/** Return cells offset so the bounding-box centre is at [0, 0]. */
function centrePattern(cells) {
  const rows = cells.map(([r]) => r);
  const cols = cells.map(([, c]) => c);
  const offR = Math.floor((Math.min(...rows) + Math.max(...rows)) / 2);
  const offC = Math.floor((Math.min(...cols) + Math.max(...cols)) / 2);
  return cells.map(([r, c]) => [r - offR, c - offC]);
}

// ── LocalMatchController ──────────────────────────────────────────────────────

export class LocalMatchController {
  constructor(coordinator, renderer, settings) {
    this._coord    = coordinator;
    this._renderer = renderer;
    this._settings = settings;
    this._canvas   = null;
    this._ui       = null;

    // Per-player staged cells (not yet committed to the board)
    this._drafts = { [PlayerColor.RED]: [], [PlayerColor.BLUE]: [] };

    // Drag state
    this._drag = { active: false, mode: null, processed: new Set() };

    // Pattern stamp state
    this._stamp = { pattern: null, color: null };

    // DOM refs for pattern buttons (populated in attach)
    this._patternBtns = { [PlayerColor.RED]: {}, [PlayerColor.BLUE]: {} };

    this._prevPhase = null;
    this._handlers  = null;
    this._newGameCb = null;
  }

  onNewGame(fn) { this._newGameCb = fn; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  attach(canvas, ui) {
    this._canvas = canvas;
    this._ui     = ui;

    this._handlers = {
      pointermove:  e => this._onPointerMove(e),
      pointerleave: () => this._onPointerLeave(),
      pointerdown:  e => { e.preventDefault(); this._onPointerDown(e); },
      pointerup:    e => this._onPointerUp(e),
      resize:       () => this._onResize(),
    };

    canvas.addEventListener('pointermove',  this._handlers.pointermove);
    canvas.addEventListener('pointerleave', this._handlers.pointerleave);
    canvas.addEventListener('pointerdown',  this._handlers.pointerdown);
    window.addEventListener('pointerup',    this._handlers.pointerup);
    window.addEventListener('resize',       this._handlers.resize);

    ui.redReady.addEventListener('click',  () => this._onReady(PlayerColor.RED));
    ui.blueReady.addEventListener('click', () => this._onReady(PlayerColor.BLUE));
    ui.newGame.addEventListener('click',   () => { if (this._newGameCb) this._newGameCb(); });

    // Build pattern buttons for both players
    this._buildPatternButtons(PlayerColor.RED,  ui.redPatterns);
    this._buildPatternButtons(PlayerColor.BLUE, ui.bluePatterns);

    this._coord.onUpdate(() => this._doRender());
    this._onResize();
  }

  detach() {
    if (!this._canvas || !this._handlers) return;
    this._canvas.removeEventListener('pointermove',  this._handlers.pointermove);
    this._canvas.removeEventListener('pointerleave', this._handlers.pointerleave);
    this._canvas.removeEventListener('pointerdown',  this._handlers.pointerdown);
    window.removeEventListener('pointerup', this._handlers.pointerup);
    window.removeEventListener('resize',    this._handlers.resize);
    this._coord.dispose();
  }

  // ── Pattern button setup ──────────────────────────────────────────────────

  _buildPatternButtons(color, container) {
    container.innerHTML = '';
    for (const pattern of PATTERNS) {
      const btn = document.createElement('button');
      btn.className   = 'btn-pattern';
      btn.title       = `${pattern.name} (${pattern.cells.length} cells) — ${pattern.desc}`;
      btn.innerHTML   =
        `<span class="pat-tag" style="background:${pattern.tagColor}">${pattern.tag}</span>` +
        `<span class="pat-name">${pattern.name}</span>` +
        `<span class="pat-cost">${pattern.cells.length}c</span>`;
      btn.addEventListener('click', () => this._toggleStampMode(pattern, color));
      container.appendChild(btn);
      this._patternBtns[color][pattern.id] = btn;
    }
  }

  // ── Pointer events ────────────────────────────────────────────────────────

  _onPointerLeave() {
    this._renderer.clearHover();
    this._renderer.clearStampPreview();
    this._doRender();
  }

  _onPointerDown(e) {
    const phase = this._coord.match.phase;
    if (phase !== MatchPhase.SETUP_PLACEMENT && phase !== MatchPhase.REINFORCEMENT_PLACEMENT) return;

    if (this._stamp.pattern) {
      // Stamp mode: drop the pattern at the cursor
      this._doStamp(e);
    } else {
      // Free mode: start a drag
      this._startDrag(e);
    }
  }

  _onPointerMove(e) {
    const pos       = this._getPos(e);
    const phase     = this._coord.match.phase;
    const isPlace   = phase === MatchPhase.SETUP_PLACEMENT ||
                      phase === MatchPhase.REINFORCEMENT_PLACEMENT;

    this._renderer.setHover(pos);
    this._updateCursor(pos, isPlace);

    if (isPlace) {
      if (this._stamp.pattern && pos) {
        // Update stamp preview centred on cursor
        const { valid, invalid } = this._computeStampCells(this._stamp.pattern, pos, this._stamp.color);
        this._renderer.setStampPreview(valid, invalid, this._stamp.color);
      } else if (this._drag.active && pos) {
        // Extend drag to newly-entered cell
        const mid   = Math.floor(this._settings.boardWidth / 2);
        const color = pos.col < mid ? PlayerColor.RED : PlayerColor.BLUE;
        this._dragProcessCell(pos, color);
      }
    }

    this._doRender();
  }

  _onPointerUp(_e) {
    this._drag.active = false;
    this._drag.mode   = null;
    this._drag.processed.clear();
  }

  // ── Drag helpers ──────────────────────────────────────────────────────────

  _startDrag(e) {
    const pos = this._getPos(e);
    if (!pos) return;

    const mid   = Math.floor(this._settings.boardWidth / 2);
    const color = pos.col < mid ? PlayerColor.RED : PlayerColor.BLUE;
    if (this._coord.isReady(color)) return;

    const draft  = this._drafts[color];
    const key    = pos.key();
    const inDraft = draft.some(p => p.key() === key);

    if (inDraft) {
      this._drag.mode = 'remove';
    } else if (this._coord.match.board.getCell(pos) === CellState.EMPTY) {
      this._drag.mode = 'add';
    } else {
      return; // occupied board cell — can't interact
    }

    this._drag.active = true;
    this._drag.processed = new Set();
    this._dragProcessCell(pos, color);
  }

  _dragProcessCell(pos, color) {
    if (!this._drag.active || this._coord.isReady(color)) return;

    const key = pos.key();
    if (this._drag.processed.has(key)) return;
    this._drag.processed.add(key);

    const draft  = this._drafts[color];
    const idx    = draft.findIndex(p => p.key() === key);
    const inDraft = idx >= 0;

    if (this._drag.mode === 'add' && !inDraft) {
      const board = this._coord.match.board;
      if (board.getCell(pos) !== CellState.EMPTY) return;
      if (!this._coord.isInPlayerRegion(color, pos)) return;
      const max = this._coord.getMaxPlaceable(color);
      if (draft.length >= max) return;
      draft.push(pos);
    } else if (this._drag.mode === 'remove' && inDraft) {
      draft.splice(idx, 1);
    } else {
      return; // nothing to do
    }

    this._coord.updateDraft(color, draft);
    this._renderer.setDraft(color, draft);
  }

  // ── Stamp helpers ─────────────────────────────────────────────────────────

  _toggleStampMode(pattern, color) {
    const phase = this._coord.match.phase;
    if (phase !== MatchPhase.SETUP_PLACEMENT && phase !== MatchPhase.REINFORCEMENT_PLACEMENT) return;

    const same = this._stamp.pattern?.id === pattern.id && this._stamp.color === color;
    if (same) {
      // Deselect
      this._stamp = { pattern: null, color: null };
      this._renderer.clearStampPreview();
    } else {
      this._stamp = { pattern, color };
    }
    this._doRender();
  }

  _doStamp(e) {
    const pos = this._getPos(e);
    if (!pos) return;
    const { pattern, color } = this._stamp;
    if (!color || this._coord.isReady(color)) return;

    const { valid } = this._computeStampCells(pattern, pos, color);
    if (valid.length === 0) return;

    const draft   = this._drafts[color];
    const draftKeys = new Set(draft.map(p => p.key()));
    for (const p of valid) {
      if (!draftKeys.has(p.key())) draft.push(p);
    }

    this._coord.updateDraft(color, draft);
    this._renderer.setDraft(color, draft);
    this._doRender();
  }

  /**
   * For a given pattern and cursor position, compute which cells would be placed
   * (valid) and which are blocked or over-budget (invalid).
   */
  _computeStampCells(pattern, cursor, color) {
    let cells = [...pattern.cells];

    // Mirror horizontally for Blue on patterns that have directionality
    if (pattern.mirrorForBlue && color === PlayerColor.BLUE) {
      cells = mirrorH(cells);
    }

    const centred = centrePattern(cells);
    const board   = this._coord.match.board;
    const draft   = this._drafts[color];
    const draftKeys = new Set(draft.map(p => p.key()));
    const remaining = this._coord.getMaxPlaceable(color) - draft.length;

    const valid   = [];
    const invalid = [];
    let validCount = 0;

    for (const [dr, dc] of centred) {
      const pos = new Position(cursor.row + dr, cursor.col + dc);
      if (!board.isInBounds(pos)) continue; // don't show out-of-bounds

      const ok = board.getCell(pos) === CellState.EMPTY &&
                 this._coord.isInPlayerRegion(color, pos) &&
                 !draftKeys.has(pos.key());

      if (ok && validCount < remaining) {
        valid.push(pos);
        validCount++;
      } else {
        invalid.push(pos);
      }
    }

    return { valid, invalid };
  }

  // ── Ready / error ─────────────────────────────────────────────────────────

  _onReady(color) {
    const phase = this._coord.match.phase;
    if (phase !== MatchPhase.SETUP_PLACEMENT && phase !== MatchPhase.REINFORCEMENT_PLACEMENT) return;

    if (this._coord.isReady(color)) {
      this._coord.cancelReady(color);
    } else {
      const result = this._coord.setReady(color);
      if (!result.success) this._showError(color, result.errors.join('\n'));
    }
    this._doRender();
  }

  _showError(color, msg) {
    const el = color === PlayerColor.RED ? this._ui.redError : this._ui.blueError;
    el.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ''; }, 4000);
  }

  // ── Cursor ────────────────────────────────────────────────────────────────

  _updateCursor(pos, isPlacement) {
    if (!isPlacement) { this._canvas.style.cursor = 'default'; return; }
    if (this._stamp.pattern) { this._canvas.style.cursor = 'copy'; return; }
    if (!pos) { this._canvas.style.cursor = 'default'; return; }
    const mid   = Math.floor(this._settings.boardWidth / 2);
    const color = pos.col < mid ? PlayerColor.RED : PlayerColor.BLUE;
    this._canvas.style.cursor = this._coord.isReady(color) ? 'not-allowed' : 'crosshair';
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  _onResize() {
    const w = this._canvas.parentElement.clientWidth;
    this._renderer.resize(w);
    this._doRender();
  }

  // ── Position hit-test ─────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

  _doRender() {
    const match   = this._coord.match;
    const { phase, board, result, totalGenerations, settings } = match;

    // When transitioning into simulation, clear local draft state
    if (phase === MatchPhase.SIMULATION && this._prevPhase !== MatchPhase.SIMULATION) {
      for (const color of [PlayerColor.RED, PlayerColor.BLUE]) {
        this._drafts[color] = [];
        this._renderer.setDraft(color, []);
      }
      // Also exit stamp mode
      this._stamp = { pattern: null, color: null };
      this._renderer.clearStampPreview();
    }
    this._prevPhase = phase;

    const redReady  = this._coord.isReady(PlayerColor.RED);
    const blueReady = this._coord.isReady(PlayerColor.BLUE);
    this._renderer.setReadyStates(redReady, blueReady);
    this._renderer.render(board, phase);

    // ── Live cell counts ──
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
    const redMax      = this._coord.getMaxPlaceable(PlayerColor.RED);
    const blueMax     = this._coord.getMaxPlaceable(PlayerColor.BLUE);
    const redBank     = this._coord.getBank(PlayerColor.RED);
    const blueBank    = this._coord.getBank(PlayerColor.BLUE);
    const { reinforcementMinPlacementCount: minR } = settings;

    // ── Status bar ──
    this._ui.genCounter.textContent = `Generation ${totalGenerations} / ${settings.maxGenerations}`;

    let phaseText = '';
    switch (phase) {
      case MatchPhase.SETUP_PLACEMENT:
        phaseText = `Setup — place ${settings.initialPlacementCount} cells each, then press Ready`;
        break;
      case MatchPhase.SIMULATION:
        phaseText = 'Simulating…';
        break;
      case MatchPhase.REINFORCEMENT_PLACEMENT:
        phaseText = `Reinforcement — place ${minR}–${redMax} cells (Red) / ${minR}–${blueMax} (Blue)`;
        break;
      case MatchPhase.ENDED:
        if      (result === MatchResultType.RED_VICTORY)  phaseText = 'Red wins!';
        else if (result === MatchResultType.BLUE_VICTORY) phaseText = 'Blue wins!';
        else                                               phaseText = "It's a draw!";
        break;
    }
    this._ui.phaseLabel.textContent = phaseText;

    // ── Player panels ──
    const simRunning = phase === MatchPhase.SIMULATION;
    for (const [color, alive, staged, max, bank, readyEl, cellsEl, placedEl, bankEl, errorEl, patternBtns] of [
      [PlayerColor.RED,  red,  redDraft,  redMax,  redBank,  this._ui.redReady,  this._ui.redCells,  this._ui.redPlaced,  this._ui.redBank,  this._ui.redError,  this._patternBtns[PlayerColor.RED]],
      [PlayerColor.BLUE, blue, blueDraft, blueMax, blueBank, this._ui.blueReady, this._ui.blueCells, this._ui.bluePlaced, this._ui.blueBank, this._ui.blueError, this._patternBtns[PlayerColor.BLUE]],
    ]) {
      const isReady = this._coord.isReady(color);

      cellsEl.textContent  = `Cells alive: ${alive}`;
      placedEl.textContent = isPlacement
        ? `Staged: ${staged} / ${max}` + (isSetup ? '' : ` (min ${minR})`)
        : '';
      bankEl.textContent   = (isPlacement && !isSetup && bank > 0) ? `Bank: +${bank}` : '';

      readyEl.disabled     = !isPlacement || simRunning;
      readyEl.textContent  = isReady ? 'Cancel' : 'Ready';
      readyEl.classList.toggle('btn-ready-active', isReady);

      // Pattern buttons: highlight active, hide during non-placement phases
      const showPatterns = isPlacement && !simRunning;
      for (const pattern of PATTERNS) {
        const btn = patternBtns[pattern.id];
        if (!btn) continue;
        btn.disabled = !showPatterns || isReady;
        btn.classList.toggle('active',
          this._stamp.pattern?.id === pattern.id && this._stamp.color === color
        );
      }
    }

    this._ui.newGame.style.display = phase === MatchPhase.ENDED ? 'inline-block' : 'none';
  }
}
