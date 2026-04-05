import { CellState, PlayerColor, MatchPhase, MatchResultType, Position, PATTERNS } from './domain.js';

// ── Pattern helpers ───────────────────────────────────────────────────────────

function mirrorH(cells) {
  const cols = cells.map(([, c]) => c);
  const minC = Math.min(...cols), maxC = Math.max(...cols);
  return cells.map(([r, c]) => [r, minC + maxC - c]);
}

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

    this._drafts = { [PlayerColor.RED]: [], [PlayerColor.BLUE]: [] };
    this._drag   = { active: false, mode: null, processed: new Set() };
    this._stamp  = { pattern: null, color: null };
    this._patternBtns = { [PlayerColor.RED]: {}, [PlayerColor.BLUE]: {} };

    this._prevPhase    = null;
    this._handlers     = null;
    this._newGameCb    = null;
    this._timerInterval = null;
    this._timerLeft    = 0;
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
    this._stopTimer();
    this._coord.dispose();
  }

  // ── Pattern buttons ───────────────────────────────────────────────────────

  _buildPatternButtons(color, container) {
    container.innerHTML = '';
    for (const pattern of PATTERNS) {
      const btn = document.createElement('button');
      btn.className = 'btn-pattern';
      btn.title     = `${pattern.name} (${pattern.cells.length} cells) — ${pattern.desc}`;
      btn.innerHTML =
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
    const phase           = this._coord.match.phase;
    const isContinuousSim = this._settings.continuousMode && phase === MatchPhase.SIMULATION;

    if (isContinuousSim) {
      if (this._stamp.pattern) { this._doLiveStamp(e); } else { this._startLiveDrag(e); }
      return;
    }

    if (phase !== MatchPhase.SETUP_PLACEMENT && phase !== MatchPhase.REINFORCEMENT_PLACEMENT) return;
    if (this._stamp.pattern) { this._doStamp(e); } else { this._startDrag(e); }
  }

  _onPointerMove(e) {
    const pos             = this._getPos(e);
    const phase           = this._coord.match.phase;
    const isContinuousSim = this._settings.continuousMode && phase === MatchPhase.SIMULATION;
    const isPlace         = phase === MatchPhase.SETUP_PLACEMENT ||
                            phase === MatchPhase.REINFORCEMENT_PLACEMENT ||
                            isContinuousSim;

    this._renderer.setHover(pos);
    this._updateCursor(pos, isPlace);

    if (isPlace) {
      if (isContinuousSim) {
        if (this._stamp.pattern && pos) {
          const { valid, invalid } = this._computeLiveStampCells(this._stamp.pattern, pos, this._stamp.color);
          this._renderer.setStampPreview(valid, invalid, this._stamp.color);
        } else if (this._drag.active && pos) {
          this._liveDragProcessCell(pos);
        }
      } else {
        if (this._stamp.pattern && pos) {
          const { valid, invalid } = this._computeStampCells(this._stamp.pattern, pos, this._stamp.color);
          this._renderer.setStampPreview(valid, invalid, this._stamp.color);
        } else if (this._drag.active && pos) {
          const mid   = Math.floor(this._settings.boardWidth / 2);
          const color = pos.col < mid ? PlayerColor.RED : PlayerColor.BLUE;
          this._dragProcessCell(pos, color);
        }
      }
    }

    this._doRender();
  }

  _onPointerUp(_e) {
    this._drag.active = false;
    this._drag.mode   = null;
    this._drag.processed.clear();
  }

  // ── Drag ─────────────────────────────────────────────────────────────────

  _startDrag(e) {
    const pos = this._getPos(e);
    if (!pos) return;
    const mid   = Math.floor(this._settings.boardWidth / 2);
    const color = pos.col < mid ? PlayerColor.RED : PlayerColor.BLUE;
    if (this._coord.isReady(color)) return;

    const draft   = this._drafts[color];
    const key     = pos.key();
    const inDraft = draft.some(p => p.key() === key);

    if (inDraft) {
      this._drag.mode = 'remove';
    } else if (this._coord.match.board.getCell(pos) === CellState.EMPTY) {
      this._drag.mode = 'add';
    } else {
      return;
    }

    this._drag.active    = true;
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
      if (this._coord.match.board.getCell(pos) !== CellState.EMPTY) return;
      if (!this._coord.isInPlayerRegion(color, pos)) return;
      if (draft.length >= this._coord.getMaxPlaceable(color)) return;
      draft.push(pos);
    } else if (this._drag.mode === 'remove' && inDraft) {
      draft.splice(idx, 1);
    } else {
      return;
    }

    this._coord.updateDraft(color, draft);
    this._renderer.setDraft(color, draft);
  }

  // ── Live placement (continuous simulation mode) ───────────────────────────

  _startLiveDrag(e) {
    const pos = this._getPos(e);
    if (!pos) return;
    const mid   = Math.floor(this._settings.boardWidth / 2);
    const color = pos.col < mid ? PlayerColor.RED : PlayerColor.BLUE;
    if (this._coord.getBank(color) <= 0) return;

    this._drag.active    = true;
    this._drag.mode      = 'add';
    this._drag.processed = new Set();
    this._liveDragProcessCell(pos);
  }

  _liveDragProcessCell(pos) {
    if (!this._drag.active) return;
    const key = pos.key();
    if (this._drag.processed.has(key)) return;
    this._drag.processed.add(key);
    const mid   = Math.floor(this._settings.boardWidth / 2);
    const color = pos.col < mid ? PlayerColor.RED : PlayerColor.BLUE;
    this._coord.placeLiveCell(color, pos); // emits internally
  }

  _doLiveStamp(e) {
    const pos = this._getPos(e);
    if (!pos) return;
    const { pattern, color } = this._stamp;
    if (!color) return;
    const { valid } = this._computeLiveStampCells(pattern, pos, color);
    for (const p of valid) {
      if (!this._coord.placeLiveCell(color, p)) break; // stop if bank runs out
    }
    this._doRender();
  }

  _computeLiveStampCells(pattern, cursor, color) {
    let cells = [...pattern.cells];
    if (pattern.mirrorForBlue && color === PlayerColor.BLUE) cells = mirrorH(cells);
    const centred = centrePattern(cells);

    const board = this._coord.match.board;
    const bank  = this._coord.getBank(color);

    const valid = [], invalid = [];
    let validCount = 0;

    for (const [dr, dc] of centred) {
      const pos = new Position(cursor.row + dr, cursor.col + dc);
      if (!board.isInBounds(pos)) continue;
      const ok = board.getCell(pos) === CellState.EMPTY &&
                 this._coord.isInPlayerRegion(color, pos) &&
                 validCount < bank;
      if (ok) { valid.push(pos); validCount++; }
      else    { invalid.push(pos); }
    }
    return { valid, invalid };
  }

  // ── Stamp ─────────────────────────────────────────────────────────────────

  _toggleStampMode(pattern, color) {
    const phase           = this._coord.match.phase;
    const isContinuousSim = this._settings.continuousMode && phase === MatchPhase.SIMULATION;
    if (!isContinuousSim && phase !== MatchPhase.SETUP_PLACEMENT && phase !== MatchPhase.REINFORCEMENT_PLACEMENT) return;

    const same = this._stamp.pattern?.id === pattern.id && this._stamp.color === color;
    if (same) {
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

    const draft    = this._drafts[color];
    const draftKeys = new Set(draft.map(p => p.key()));
    for (const p of valid) {
      if (!draftKeys.has(p.key())) draft.push(p);
    }

    this._coord.updateDraft(color, draft);
    this._renderer.setDraft(color, draft);
    this._doRender();
  }

  _computeStampCells(pattern, cursor, color) {
    let cells = [...pattern.cells];
    if (pattern.mirrorForBlue && color === PlayerColor.BLUE) cells = mirrorH(cells);
    const centred = centrePattern(cells);

    const board     = this._coord.match.board;
    const draft     = this._drafts[color];
    const draftKeys = new Set(draft.map(p => p.key()));
    const remaining = this._coord.getMaxPlaceable(color) - draft.length;

    const valid = [], invalid = [];
    let validCount = 0;

    for (const [dr, dc] of centred) {
      const pos = new Position(cursor.row + dr, cursor.col + dc);
      if (!board.isInBounds(pos)) continue;

      const ok = board.getCell(pos) === CellState.EMPTY &&
                 this._coord.isInPlayerRegion(color, pos) &&
                 !draftKeys.has(pos.key());

      if (ok && validCount < remaining) { valid.push(pos); validCount++; }
      else                              { invalid.push(pos); }
    }
    return { valid, invalid };
  }

  // ── Ready ─────────────────────────────────────────────────────────────────

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

  // ── Timer ─────────────────────────────────────────────────────────────────

  _startTimer() {
    if (!this._settings.placementTimerSeconds) return;
    this._timerLeft = this._settings.placementTimerSeconds;
    this._renderTimer();
    this._timerInterval = setInterval(() => {
      this._timerLeft--;
      this._renderTimer();
      if (this._timerLeft <= 0) {
        this._stopTimer();
        this._forceReady();
      }
    }, 1000);
  }

  _stopTimer() {
    if (this._timerInterval) { clearInterval(this._timerInterval); this._timerInterval = null; }
    if (this._ui?.timer) {
      this._ui.timer.textContent = '';
      this._ui.timer.classList.remove('timer-urgent');
    }
  }

  _renderTimer() {
    if (!this._ui?.timer) return;
    this._ui.timer.textContent = `⏱ ${this._timerLeft}s`;
    this._ui.timer.classList.toggle('timer-urgent', this._timerLeft <= 8);
  }

  _forceReady() {
    for (const color of [PlayerColor.RED, PlayerColor.BLUE]) {
      if (!this._coord.isReady(color)) this._coord.setReady(color, true);
    }
  }

  // ── Cursor ────────────────────────────────────────────────────────────────

  _updateCursor(pos, isPlacement) {
    if (!isPlacement)          { this._canvas.style.cursor = 'default'; return; }
    if (this._stamp.pattern)   { this._canvas.style.cursor = 'copy';    return; }
    if (!pos)                  { this._canvas.style.cursor = 'default'; return; }
    const mid             = Math.floor(this._settings.boardWidth / 2);
    const color           = pos.col < mid ? PlayerColor.RED : PlayerColor.BLUE;
    const phase           = this._coord.match.phase;
    const isContinuousSim = this._settings.continuousMode && phase === MatchPhase.SIMULATION;
    if (isContinuousSim) {
      this._canvas.style.cursor = this._coord.getBank(color) > 0 ? 'crosshair' : 'not-allowed';
      return;
    }
    this._canvas.style.cursor = this._coord.isReady(color) ? 'not-allowed' : 'crosshair';
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  _onResize() {
    const w = this._canvas.parentElement.clientWidth;
    this._renderer.resize(w);
    this._doRender();
  }

  // ── Hit-test ──────────────────────────────────────────────────────────────

  _getPos(e) {
    const rect   = this._canvas.getBoundingClientRect();
    const scaleX = this._canvas.width  / rect.width;
    const scaleY = this._canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top)  * scaleY;
    return this._renderer.hitTest(x, y);
  }

  // ── Sparkline ─────────────────────────────────────────────────────────────

  _drawSparkline(canvas, history, color) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (history.length < 2) return;

    const n   = history.length;
    const max = Math.max(...history) || 1;
    const toX = i => (i / (n - 1)) * W;
    const toY = v => H - 2 - ((v / max) * (H - 4));

    const lineColor = color === PlayerColor.RED ? '#e84040' : '#4090e8';
    const fillColor = color === PlayerColor.RED ? 'rgba(232,64,64,0.14)' : 'rgba(64,144,232,0.14)';

    // Fill area
    ctx.beginPath();
    ctx.moveTo(toX(0), H);
    history.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
    ctx.lineTo(toX(n - 1), H);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Line
    ctx.beginPath();
    history.forEach((v, i) => i === 0 ? ctx.moveTo(toX(0), toY(v)) : ctx.lineTo(toX(i), toY(v)));
    ctx.strokeStyle = lineColor;
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // End dot
    ctx.beginPath();
    ctx.arc(toX(n - 1), toY(history[n - 1]), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
  }

  // ── Main render ───────────────────────────────────────────────────────────

  _doRender() {
    const match   = this._coord.match;
    const { phase, board, result, totalGenerations, settings } = match;
    const roundNumber = this._coord.getRoundNumber();

    // ── Phase transition handling ──
    const isPlacement     = phase === MatchPhase.SETUP_PLACEMENT ||
                            phase === MatchPhase.REINFORCEMENT_PLACEMENT;
    const isContinuousSim = settings.continuousMode && phase === MatchPhase.SIMULATION;
    const wasPlacement    = this._prevPhase === MatchPhase.SETUP_PLACEMENT ||
                            this._prevPhase === MatchPhase.REINFORCEMENT_PLACEMENT;

    if (isPlacement && !wasPlacement) {
      // Just entered a placement phase — start timer
      this._startTimer();
    }

    if (phase === MatchPhase.SIMULATION && this._prevPhase !== MatchPhase.SIMULATION) {
      // Just entered simulation — stop timer, clear drafts
      this._stopTimer();
      for (const color of [PlayerColor.RED, PlayerColor.BLUE]) {
        this._drafts[color] = [];
        this._renderer.setDraft(color, []);
      }
      // Only clear stamp if NOT entering continuous sim (players keep their stamp selection)
      if (!settings.continuousMode) {
        this._stamp = { pattern: null, color: null };
        this._renderer.clearStampPreview();
      }
    }

    this._prevPhase = phase;

    // ── Draw board ──
    const redReady  = this._coord.isReady(PlayerColor.RED);
    const blueReady = this._coord.isReady(PlayerColor.BLUE);
    this._renderer.setReadyStates(redReady, blueReady);
    this._renderer.render(board, phase, roundNumber);

    // ── Cell counts ──
    let red = 0, blue = 0;
    for (let r = 0; r < board.height; r++) {
      for (let c = 0; c < board.width; c++) {
        const s = board.getCellAt(r, c);
        if      (s === 'red')  red++;
        else if (s === 'blue') blue++;
      }
    }
    const total = red + blue;

    // ── Dominance bar ──
    const redPct = total > 0 ? Math.round((red / total) * 100) : 50;
    if (this._ui.domRed && this._ui.domBlue) {
      this._ui.domRed.style.width  = redPct + '%';
      this._ui.domBlue.style.width = (100 - redPct) + '%';
    }
    if (this._ui.domRedPct)  this._ui.domRedPct.textContent  = total > 0 ? redPct + '%'           : '–';
    if (this._ui.domBluePct) this._ui.domBluePct.textContent = total > 0 ? (100 - redPct) + '%'   : '–';

    // ── Status bar ──
    this._ui.genCounter.textContent = `Gen ${totalGenerations} / ${settings.maxGenerations}`;

    let phaseText = '';
    switch (phase) {
      case MatchPhase.SETUP_PLACEMENT:
        phaseText = `Round 1 · Setup — place ${settings.initialPlacementCount} cells each`;
        break;
      case MatchPhase.SIMULATION:
        phaseText = settings.continuousMode
          ? `Round ${roundNumber} · Simulating — click or drag your half to spend bank cells`
          : `Round ${roundNumber} · Simulating…`;
        break;
      case MatchPhase.REINFORCEMENT_PLACEMENT: {
        const redMax  = this._coord.getMaxPlaceable(PlayerColor.RED);
        const blueMax = this._coord.getMaxPlaceable(PlayerColor.BLUE);
        const isContest = settings.contestedZoneWidth > 0 &&
                          roundNumber >= settings.contestedZoneUnlocksAtRound;
        phaseText = `Round ${roundNumber} · Reinforce` +
          (isContest ? ' · ⚔ contested zone open' : '');
        // player-specific budgets handled in panel labels
        void redMax; void blueMax;
        break;
      }
      case MatchPhase.ENDED:
        if      (result === MatchResultType.RED_VICTORY)  phaseText = 'Red wins!';
        else if (result === MatchResultType.BLUE_VICTORY) phaseText = 'Blue wins!';
        else                                               phaseText = "It's a draw!";
        break;
    }
    this._ui.phaseLabel.textContent = phaseText;

    // ── Player panels ──
    const isSetup    = phase === MatchPhase.SETUP_PLACEMENT;
    const simRunning = phase === MatchPhase.SIMULATION;
    const { reinforcementMinPlacementCount: minR } = settings;

    for (const [color, alive, readyEl, cellsEl, placedEl, bankEl, catchupEl, errorEl, patternBtns, sparkCanvas] of [
      [PlayerColor.RED,  red,
        this._ui.redReady, this._ui.redCells, this._ui.redPlaced,
        this._ui.redBank, this._ui.redCatchup, this._ui.redError,
        this._patternBtns[PlayerColor.RED], this._ui.redSpark],
      [PlayerColor.BLUE, blue,
        this._ui.blueReady, this._ui.blueCells, this._ui.bluePlaced,
        this._ui.blueBank, this._ui.blueCatchup, this._ui.blueError,
        this._patternBtns[PlayerColor.BLUE], this._ui.blueSpark],
    ]) {
      const isReady   = this._coord.isReady(color);
      const staged    = this._drafts[color].length;
      const maxBudget = this._coord.getMaxPlaceable(color);
      const bank      = this._coord.getBank(color);
      const catchup   = this._coord.getCatchupBonus(color);

      cellsEl.textContent = `Cells alive: ${alive}`;

      if (isContinuousSim) {
        placedEl.textContent = bank > 0 ? `Bank: ${bank} — click to place` : 'Waiting for cells…';
        bankEl.textContent   = catchup > 0 ? `+${catchup} catch-up` : '';
      } else if (isPlacement) {
        placedEl.textContent = isSetup
          ? `Staged: ${staged} / ${maxBudget}`
          : `Staged: ${staged} / ${maxBudget}  (min ${minR})`;
        bankEl.textContent    = (!isSetup && bank > 0) ? `Bank +${bank}` : '';
        catchupEl.textContent = (!isSetup && catchup > 0) ? `+${catchup} catch-up` : '';
      } else {
        placedEl.textContent  = '';
        bankEl.textContent    = (!isSetup && bank > 0) ? `Bank +${bank}` : '';
        catchupEl.textContent = (!isSetup && catchup > 0) ? `+${catchup} catch-up` : '';
      }

      readyEl.disabled    = !isPlacement || simRunning;
      readyEl.textContent = isContinuousSim ? '—' : (isReady ? 'Cancel' : 'Ready');
      readyEl.classList.toggle('btn-ready-active', isReady && !isContinuousSim);

      // Pattern buttons: enabled during placement phases AND during continuous simulation
      const showPatterns = (isPlacement && !simRunning) || isContinuousSim;
      for (const pattern of PATTERNS) {
        const btn = patternBtns[pattern.id];
        if (!btn) continue;
        btn.disabled = !showPatterns || (!isContinuousSim && isReady);
        btn.classList.toggle('active',
          this._stamp.pattern?.id === pattern.id && this._stamp.color === color);
      }

      // Sparkline
      this._drawSparkline(sparkCanvas, this._coord.getHistory(color), color);
    }

    this._ui.newGame.style.display = phase === MatchPhase.ENDED ? 'inline-block' : 'none';
  }
}
