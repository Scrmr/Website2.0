import { CellState, PlayerColor, MatchPhase, MatchResultType, Board, Position, PATTERNS } from './domain.js';
import { BoardStatisticsService } from './services.js';

// ── Pattern helpers (duplicated from controller.js) ───────────────────────────

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

// ── OnlineMatchController ─────────────────────────────────────────────────────
//
// Mirrors the interface of LocalMatchController but routes player actions
// through a Socket.io socket instead of a local MatchFlowCoordinator.
// The server is the single source of truth; state arrives via 'stateUpdate'.

export class OnlineMatchController {
  constructor(socket, myColor, renderer, settings) {
    this._socket   = socket;
    this._myColor  = myColor;
    this._renderer = renderer;
    this._settings = settings; // overridden by each stateUpdate
    this._canvas   = null;
    this._ui       = null;
    this._state    = null; // last received serialised state

    // Local draft for my colour — tracked client-side for immediate feedback.
    this._draft       = [];
    this._livePending = new Map(); // key → Position: optimistic placements awaiting server confirmation
    this._drag        = { active: false, mode: null, processed: new Set() };
    this._stamp       = { pattern: null, color: null };
    this._patternBtns = { [PlayerColor.RED]: {}, [PlayerColor.BLUE]: {} };

    this._prevPhase     = null;
    this._boardCache    = null;
    this._statsCache    = null; // { red, blue } — built once per stateUpdate
    this._statsService  = new BoardStatisticsService();
    this._myTitleEl     = null;
    this._origTitle     = '';
    this._handlers      = null;
    this._newGameCb     = null;
    this._timerInterval = null;
    this._timerLeft     = 0;

    // Stable bound references so detach() removes the right listeners.
    this._onStateUpdate     = s   => this._handleStateUpdate(s);
    this._onValidationError = msg => this._showError(this._myColor, msg);
    this._onOpponentLeft    = ()  => this._handleOpponentLeft();
  }

  onNewGame(fn) { this._newGameCb = fn; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  attach(canvas, ui) {
    this._canvas = canvas;
    this._ui     = ui;

    // Mark the player's own panel with a "You" label so they know their colour.
    const titleSel  = this._myColor === PlayerColor.RED ? '.panel-red .panel-title' : '.panel-blue .panel-title';
    this._myTitleEl = document.querySelector(titleSel);
    if (this._myTitleEl) {
      this._origTitle = this._myTitleEl.textContent;
      this._myTitleEl.textContent += ' · You';
    }

    this._socket.on('stateUpdate',     this._onStateUpdate);
    this._socket.on('validationError', this._onValidationError);
    this._socket.on('opponentLeft',    this._onOpponentLeft);

    this._handlers = {
      pointermove:  e => this._onPointerMove(e),
      pointerleave: () => this._onPointerLeave(),
      pointerdown:  e => { e.preventDefault(); this._onPointerDown(e); },
      pointerup:    () => this._onPointerUp(),
      resize:       () => this._onResize(),
    };

    canvas.addEventListener('pointermove',  this._handlers.pointermove);
    canvas.addEventListener('pointerleave', this._handlers.pointerleave);
    canvas.addEventListener('pointerdown',  this._handlers.pointerdown);
    window.addEventListener('pointerup',    this._handlers.pointerup);
    window.addEventListener('resize',       this._handlers.resize);

    ui.redReady.addEventListener('click',  () => { if (this._myColor === PlayerColor.RED)  this._onReady(); });
    ui.blueReady.addEventListener('click', () => { if (this._myColor === PlayerColor.BLUE) this._onReady(); });
    ui.newGame.addEventListener('click',   () => { if (this._newGameCb) this._newGameCb(); });

    this._buildPatternButtons(PlayerColor.RED,  ui.redPatterns);
    this._buildPatternButtons(PlayerColor.BLUE, ui.bluePatterns);

    this._onResize();
  }

  detach() {
    if (!this._canvas || !this._handlers) return;
    if (this._myTitleEl) {
      this._myTitleEl.textContent = this._origTitle;
      this._myTitleEl = null;
    }
    this._canvas.removeEventListener('pointermove',  this._handlers.pointermove);
    this._canvas.removeEventListener('pointerleave', this._handlers.pointerleave);
    this._canvas.removeEventListener('pointerdown',  this._handlers.pointerdown);
    window.removeEventListener('pointerup', this._handlers.pointerup);
    window.removeEventListener('resize',    this._handlers.resize);
    this._stopTimer();
    this._socket.off('stateUpdate',     this._onStateUpdate);
    this._socket.off('validationError', this._onValidationError);
    this._socket.off('opponentLeft',    this._onOpponentLeft);
  }

  // ── Socket handlers ───────────────────────────────────────────────────────

  _handleStateUpdate(state) {
    const prevPhase = this._state?.phase;
    this._state     = state;

    // Rebuild board and stats once per server tick so pointer-move renders are free.
    const { width, height, cells, ages } = state.board;
    this._boardCache = new Board(width, height, cells, ages);
    let redCount = 0, blueCount = 0;
    for (let r = 0; r < height; r++)
      for (let c = 0; c < width; c++) {
        const s = cells[r][c];
        if      (s === CellState.RED)  redCount++;
        else if (s === CellState.BLUE) blueCount++;
      }
    this._statsCache = { red: redCount, blue: blueCount };

    const isPlacement  = state.phase === MatchPhase.SETUP_PLACEMENT ||
                         state.phase === MatchPhase.REINFORCEMENT_PLACEMENT;
    const wasPlacement = prevPhase   === MatchPhase.SETUP_PLACEMENT ||
                         prevPhase   === MatchPhase.REINFORCEMENT_PLACEMENT;

    if (isPlacement && !wasPlacement) this._startTimer();

    if (state.phase === MatchPhase.SIMULATION && prevPhase !== MatchPhase.SIMULATION) {
      this._stopTimer();
      this._draft = [];
      this._livePending.clear();
      this._renderer.setDraft(PlayerColor.RED,  []);
      this._renderer.setDraft(PlayerColor.BLUE, []);
      if (!state.settings.continuousMode) {
        this._stamp = { pattern: null, color: null };
        this._renderer.clearStampPreview();
      }
    }

    // Push the opponent's latest draft into the renderer for display.
    const opp     = this._myColor === PlayerColor.RED ? PlayerColor.BLUE : PlayerColor.RED;
    const oppDraft = state.players[opp].draft.map(p => new Position(p.row, p.col));
    this._renderer.setDraft(opp, oppDraft);

    // Prune pending live cells that the server has now confirmed (cell is no longer empty).
    if (this._livePending.size > 0) {
      for (const [key, pos] of this._livePending) {
        if (state.board.cells[pos.row]?.[pos.col] !== CellState.EMPTY) {
          this._livePending.delete(key);
        }
      }
      this._renderer.setDraft(this._myColor, [...this._livePending.values()]);
    }

    this._doRender();
  }

  _handleOpponentLeft() {
    this._stopTimer();
    if (this._ui?.phaseLabel) this._ui.phaseLabel.textContent = 'Opponent disconnected.';
    if (this._ui?.newGame)    this._ui.newGame.style.display  = 'inline-block';
  }

  // ── Pattern buttons ───────────────────────────────────────────────────────

  _buildPatternButtons(color, container) {
    container.innerHTML = '';
    for (const pattern of PATTERNS) {
      const btn = document.createElement('button');
      btn.className = 'btn-pattern';
      btn.title     = `${pattern.name} (${pattern.cells.length} cells) — ${pattern.desc}`;
      const role = pattern.role ?? pattern.tag;
      btn.innerHTML =
        `<span class="pat-main"><span class="pat-tag" style="background:${pattern.tagColor}">${pattern.tag}</span>` +
        `<span class="pat-name">${pattern.name}</span>` +
        `<span class="pat-cost">${pattern.cells.length}c</span></span>` +
        `<span class="pat-role">${role}</span>`;
      btn.addEventListener('click', () => {
        if (color === this._myColor) this._toggleStampMode(pattern, color);
      });
      container.appendChild(btn);
      this._patternBtns[color][pattern.id] = btn;
    }
  }

  // ── Pointer events ────────────────────────────────────────────────────────

  _onPointerLeave() {
    this._renderer.clearHover();
    this._renderer.clearStampPreview();
    if (this._state) this._doRender();
  }

  _onPointerDown(e) {
    if (!this._state) return;
    const { phase, settings } = this._state;
    const isContinuousSim = settings.continuousMode && phase === MatchPhase.SIMULATION;

    if (isContinuousSim) {
      if (this._stamp.pattern) { this._doLiveStamp(e); } else { this._startLiveDrag(e); }
      return;
    }

    if (phase !== MatchPhase.SETUP_PLACEMENT && phase !== MatchPhase.REINFORCEMENT_PLACEMENT) return;
    if (this._stamp.pattern) { this._doStamp(e); } else { this._startDrag(e); }
  }

  _onPointerMove(e) {
    if (!this._state) return;
    const pos               = this._getPos(e);
    const { phase, settings } = this._state;
    const isContinuousSim   = settings.continuousMode && phase === MatchPhase.SIMULATION;
    const isPlace           = phase === MatchPhase.SETUP_PLACEMENT ||
                              phase === MatchPhase.REINFORCEMENT_PLACEMENT ||
                              isContinuousSim;

    this._renderer.setHover(pos);
    this._updateCursor(pos, isPlace);

    if (isPlace) {
      if (isContinuousSim) {
        if (this._stamp.pattern && pos) {
          const { valid, invalid } = this._computeLiveStampCells(this._stamp.pattern, pos, this._myColor);
          this._renderer.setStampPreview(valid, invalid, this._myColor);
        } else if (this._drag.active && pos) {
          this._liveDragProcessCell(pos);
        }
      } else {
        if (this._stamp.pattern && pos) {
          const { valid, invalid } = this._computeStampCells(this._stamp.pattern, pos, this._myColor);
          this._renderer.setStampPreview(valid, invalid, this._myColor);
        } else if (this._drag.active && pos) {
          const mid   = Math.floor(settings.boardWidth / 2);
          const color = pos.col < mid ? PlayerColor.RED : PlayerColor.BLUE;
          if (color === this._myColor) this._dragProcessCell(pos);
        }
      }
    }

    this._doRender();
  }

  _onPointerUp() {
    this._drag.active = false;
    this._drag.mode   = null;
    this._drag.processed.clear();
  }

  // ── Drag ─────────────────────────────────────────────────────────────────

  _startDrag(e) {
    const pos = this._getPos(e);
    if (!pos) return;

    const mid   = Math.floor(this._state.settings.boardWidth / 2);
    const color = pos.col < mid ? PlayerColor.RED : PlayerColor.BLUE;
    if (color !== this._myColor) return;
    if (this._state.players[this._myColor].isReady) return;

    const key     = pos.key();
    const inDraft = this._draft.some(p => p.key() === key);
    const board   = this._getBoard();

    if      (inDraft)                                      { this._drag.mode = 'remove'; }
    else if (board.getCell(pos) === CellState.EMPTY)       { this._drag.mode = 'add'; }
    else                                                   { return; }

    this._drag.active    = true;
    this._drag.processed = new Set();
    this._dragProcessCell(pos);
  }

  _dragProcessCell(pos) {
    if (!this._drag.active) return;
    if (this._state.players[this._myColor].isReady) return;

    const key = pos.key();
    if (this._drag.processed.has(key)) return;
    this._drag.processed.add(key);

    const idx     = this._draft.findIndex(p => p.key() === key);
    const inDraft = idx >= 0;
    const board   = this._getBoard();

    if (this._drag.mode === 'add' && !inDraft) {
      if (board.getCell(pos) !== CellState.EMPTY) return;
      if (!this._isInMyRegion(pos)) return;
      if (this._draft.length >= this._getMaxPlaceable()) return;
      this._draft.push(pos);
    } else if (this._drag.mode === 'remove' && inDraft) {
      this._draft.splice(idx, 1);
    } else {
      return;
    }

    this._renderer.setDraft(this._myColor, this._draft);
    this._emitDraft();
  }

  // ── Live placement (continuous simulation mode) ───────────────────────────

  _startLiveDrag(e) {
    const pos = this._getPos(e);
    if (!pos) return;
    const mid   = Math.floor(this._state.settings.boardWidth / 2);
    const color = pos.col < mid ? PlayerColor.RED : PlayerColor.BLUE;
    if (color !== this._myColor) return;
    if ((this._state.players[this._myColor].bank ?? 0) <= 0) return;

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
    const mid   = Math.floor(this._state.settings.boardWidth / 2);
    const color = pos.col < mid ? PlayerColor.RED : PlayerColor.BLUE;
    if (color !== this._myColor) return;
    // Optimistic update: show the cell immediately without waiting for the server round-trip.
    if (!this._livePending.has(key) && this._getBoard().getCell(pos) === CellState.EMPTY) {
      this._livePending.set(key, pos);
      this._renderer.setDraft(this._myColor, [...this._livePending.values()]);
    }
    this._socket.emit('placeLiveCell', { row: pos.row, col: pos.col });
  }

  _doLiveStamp(e) {
    const pos = this._getPos(e);
    if (!pos) return;
    const { pattern, color } = this._stamp;
    if (!color || color !== this._myColor) return;
    const { valid } = this._computeLiveStampCells(pattern, pos, color);
    let drafted = false;
    for (const p of valid) {
      const k = p.key();
      if (!this._livePending.has(k)) { this._livePending.set(k, p); drafted = true; }
      this._socket.emit('placeLiveCell', { row: p.row, col: p.col });
    }
    if (drafted) this._renderer.setDraft(this._myColor, [...this._livePending.values()]);
    this._doRender();
  }

  _computeLiveStampCells(pattern, cursor, color) {
    let cells = [...pattern.cells];
    if (pattern.mirrorForBlue && color === PlayerColor.BLUE) cells = mirrorH(cells);
    const centred = centrePattern(cells);

    const board = this._getBoard();
    const bank  = (this._state.players[color].bank ?? 0) - this._livePending.size;

    const valid = [], invalid = [];
    let validCount = 0;

    for (const [dr, dc] of centred) {
      const pos = new Position(cursor.row + dr, cursor.col + dc);
      if (!board.isInBounds(pos)) continue;
      const ok = board.getCell(pos) === CellState.EMPTY &&
                 !this._livePending.has(pos.key()) &&
                 this._isInMyRegion(pos) &&
                 validCount < bank;
      if (ok) { valid.push(pos); validCount++; }
      else    { invalid.push(pos); }
    }
    return { valid, invalid };
  }

  // ── Stamp ─────────────────────────────────────────────────────────────────

  _toggleStampMode(pattern, color) {
    if (!this._state) return;
    const { phase, settings } = this._state;
    const isContinuousSim = settings.continuousMode && phase === MatchPhase.SIMULATION;
    if (!isContinuousSim && phase !== MatchPhase.SETUP_PLACEMENT && phase !== MatchPhase.REINFORCEMENT_PLACEMENT) return;

    const same = this._stamp.pattern?.id === pattern.id;
    this._stamp = same ? { pattern: null, color: null } : { pattern, color };
    if (same) this._renderer.clearStampPreview();
    this._doRender();
  }

  _doStamp(e) {
    const pos = this._getPos(e);
    if (!pos) return;
    const { pattern, color } = this._stamp;
    if (!color || color !== this._myColor) return;
    if (this._state.players[this._myColor].isReady) return;

    const { valid } = this._computeStampCells(pattern, pos, color);
    if (valid.length === 0) return;

    const draftKeys = new Set(this._draft.map(p => p.key()));
    for (const p of valid) {
      if (!draftKeys.has(p.key())) this._draft.push(p);
    }

    this._renderer.setDraft(this._myColor, this._draft);
    this._emitDraft();
    this._doRender();
  }

  _computeStampCells(pattern, cursor, color) {
    let cells = [...pattern.cells];
    if (pattern.mirrorForBlue && color === PlayerColor.BLUE) cells = mirrorH(cells);
    const centred = centrePattern(cells);

    const board     = this._getBoard();
    const draftKeys = new Set(this._draft.map(p => p.key()));
    const remaining = this._getMaxPlaceable() - this._draft.length;

    const valid = [], invalid = [];
    let validCount = 0;

    for (const [dr, dc] of centred) {
      const pos = new Position(cursor.row + dr, cursor.col + dc);
      if (!board.isInBounds(pos)) continue;
      const ok = board.getCell(pos) === CellState.EMPTY &&
                 this._isInMyRegion(pos) &&
                 !draftKeys.has(pos.key());
      if (ok && validCount < remaining) { valid.push(pos); validCount++; }
      else                              { invalid.push(pos); }
    }
    return { valid, invalid };
  }

  // ── Ready ─────────────────────────────────────────────────────────────────

  _onReady() {
    if (!this._state) return;
    const { phase } = this._state;
    if (phase !== MatchPhase.SETUP_PLACEMENT && phase !== MatchPhase.REINFORCEMENT_PLACEMENT) return;

    if (this._state.players[this._myColor].isReady) {
      this._socket.emit('cancelReady');
    } else {
      this._socket.emit('setReady', { force: false });
    }
  }

  _showError(color, msg) {
    const el = color === PlayerColor.RED ? this._ui.redError : this._ui.blueError;
    if (!el) return;
    el.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ''; }, 4000);
  }

  // ── Timer ─────────────────────────────────────────────────────────────────

  _startTimer() {
    if (!this._state?.settings.placementTimerSeconds) return;
    this._timerLeft = this._state.settings.placementTimerSeconds;
    this._renderTimer();
    this._timerInterval = setInterval(() => {
      this._timerLeft--;
      this._renderTimer();
      if (this._timerLeft <= 0) {
        this._stopTimer();
        this._socket.emit('setReady', { force: true });
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

  // ── Helpers ───────────────────────────────────────────────────────────────

  _emitDraft() {
    this._socket.emit('updateDraft', this._draft.map(p => ({ row: p.row, col: p.col })));
  }

  _getBoard() { return this._boardCache; }

  _getMaxPlaceable() {
    if (!this._state) return 0;
    const { phase, settings, players } = this._state;
    if (phase === MatchPhase.SETUP_PLACEMENT) return settings.initialPlacementCount;
    const p = players[this._myColor];
    return settings.reinforcementMaxPlacementCount + p.bank + p.catchupBonus;
  }

  _isInMyRegion(pos) {
    const { settings, roundNumber } = this._state;
    const mid = Math.floor(settings.boardWidth / 2);

    if (settings.contestedZoneWidth > 0 && roundNumber >= settings.contestedZoneUnlocksAtRound) {
      const halfC  = Math.floor(settings.contestedZoneWidth / 2);
      const cStart = mid - halfC;
      const cEnd   = mid + halfC;
      if (pos.col >= cStart && pos.col < cEnd) return true;
    }

    return this._myColor === PlayerColor.RED ? pos.col < mid : pos.col >= mid;
  }

  // ── Cursor ────────────────────────────────────────────────────────────────

  _updateCursor(pos, isPlacement) {
    if (!isPlacement)        { this._canvas.style.cursor = 'default'; return; }
    if (this._stamp.pattern) { this._canvas.style.cursor = 'copy';    return; }
    if (!pos)                { this._canvas.style.cursor = 'default'; return; }
    const { settings, phase } = this._state;
    const mid             = Math.floor(settings.boardWidth / 2);
    const color           = pos.col < mid ? PlayerColor.RED : PlayerColor.BLUE;
    const isContinuousSim = settings.continuousMode && phase === MatchPhase.SIMULATION;
    if (isContinuousSim) {
      if (color !== this._myColor)                                { this._canvas.style.cursor = 'not-allowed'; return; }
      const hasBank = (this._state.players[this._myColor].bank ?? 0) > 0;
      this._canvas.style.cursor = hasBank ? 'crosshair' : 'not-allowed';
      return;
    }
    if (color !== this._myColor)                                { this._canvas.style.cursor = 'not-allowed'; return; }
    if (this._state.players[this._myColor].isReady)             { this._canvas.style.cursor = 'not-allowed'; return; }
    this._canvas.style.cursor = 'crosshair';
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  _onResize() {
    const w = this._canvas.parentElement.clientWidth;
    this._renderer.resize(w);
    if (this._state) this._doRender();
  }

  // ── Hit-test ──────────────────────────────────────────────────────────────

  _getPos(e) {
    const rect   = this._canvas.getBoundingClientRect();
    const scaleX = this._canvas.width  / rect.width;
    const scaleY = this._canvas.height / rect.height;
    return this._renderer.hitTest(
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top)  * scaleY,
    );
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

    ctx.beginPath();
    ctx.moveTo(toX(0), H);
    history.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
    ctx.lineTo(toX(n - 1), H);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.beginPath();
    history.forEach((v, i) => i === 0 ? ctx.moveTo(toX(0), toY(v)) : ctx.lineTo(toX(i), toY(v)));
    ctx.strokeStyle = lineColor;
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(toX(n - 1), toY(history[n - 1]), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
  }

  // ── Main render ───────────────────────────────────────────────────────────

  _renderEcology(metrics) {
    const pairs = [
      [metrics.stability, this._ui.ecoStability, this._ui.ecoStabilityBar],
      [metrics.diversity, this._ui.ecoDiversity, this._ui.ecoDiversityBar],
      [metrics.age, this._ui.ecoAge, this._ui.ecoAgeBar],
      [metrics.volatility, this._ui.ecoVolatility, this._ui.ecoVolatilityBar],
      [metrics.territory, this._ui.ecoTerritory, this._ui.ecoTerritoryBar],
    ];

    for (const [value, label, bar] of pairs) {
      const pct = Math.max(0, Math.min(100, value ?? 0));
      if (label) label.textContent = `${pct}%`;
      if (bar) bar.style.width = `${pct}%`;
    }
  }

  _doRender() {
    if (!this._state) return;

    const { phase, result, totalGenerations, roundNumber, settings, players } = this._state;
    const board = this._getBoard();

    this._renderer.setReadyStates(players.red.isReady, players.blue.isReady);
    this._renderer.render(board, phase, roundNumber);

    // Cell counts (pre-computed in _handleStateUpdate — free on pointer-move renders)
    const { red, blue } = this._statsCache;
    const total = red + blue;

    // Dominance bar
    const redPct = total > 0 ? Math.round((red / total) * 100) : 50;
    if (this._ui.domRed)     this._ui.domRed.style.width     = redPct + '%';
    if (this._ui.domBlue)    this._ui.domBlue.style.width    = (100 - redPct) + '%';
    if (this._ui.domRedPct)  this._ui.domRedPct.textContent  = total > 0 ? redPct + '%'         : '–';
    if (this._ui.domBluePct) this._ui.domBluePct.textContent = total > 0 ? (100 - redPct) + '%' : '–';
    this._renderEcology(this._statsService.getEcologyMetrics(board));

    // Status bar
    this._ui.genCounter.textContent = settings.maxGenerations > 0
      ? `Gen ${totalGenerations} / ${settings.maxGenerations}`
      : `Gen ${totalGenerations} / endless`;

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
        const isContest = settings.contestedZoneWidth > 0 &&
                          roundNumber >= settings.contestedZoneUnlocksAtRound;
        phaseText = `Round ${roundNumber} · Reinforce` +
          (isContest ? ' · ⚔ contested zone open' : '');
        break;
      }
      case MatchPhase.ENDED:
        if      (result === MatchResultType.RED_VICTORY)  phaseText = 'Red wins!';
        else if (result === MatchResultType.BLUE_VICTORY) phaseText = 'Blue wins!';
        else                                               phaseText = "It's a draw!";
        break;
    }
    this._ui.phaseLabel.textContent = phaseText;

    // Player panels
    const isSetup         = phase === MatchPhase.SETUP_PLACEMENT;
    const simRunning      = phase === MatchPhase.SIMULATION;
    const isPlacement     = isSetup || phase === MatchPhase.REINFORCEMENT_PLACEMENT;
    const isContinuousSim = settings.continuousMode && simRunning;
    const { reinforcementMinPlacementCount: minR } = settings;

    for (const [color, alive, readyEl, cellsEl, placedEl, bankEl, catchupEl, patternBtns, sparkCanvas] of [
      [PlayerColor.RED,  red,
        this._ui.redReady,  this._ui.redCells,  this._ui.redPlaced,
        this._ui.redBank,   this._ui.redCatchup,
        this._patternBtns[PlayerColor.RED],  this._ui.redSpark],
      [PlayerColor.BLUE, blue,
        this._ui.blueReady, this._ui.blueCells, this._ui.bluePlaced,
        this._ui.blueBank,  this._ui.blueCatchup,
        this._patternBtns[PlayerColor.BLUE], this._ui.blueSpark],
    ]) {
      const pData     = players[color];
      const isReady   = pData.isReady;
      const isMe      = color === this._myColor;
      const staged    = isMe ? this._draft.length : pData.draft.length;
      const maxBudget = isSetup
        ? settings.initialPlacementCount
        : settings.reinforcementMaxPlacementCount + pData.bank + pData.catchupBonus;
      const bank      = pData.bank ?? 0;

      cellsEl.textContent = `Cells alive: ${alive}`;

      if (isContinuousSim) {
        placedEl.textContent = bank > 0
          ? (isMe ? `Bank: ${bank} — click to place` : `Bank: ${bank}`)
          : 'Waiting for cells…';
        bankEl.textContent    = pData.catchupBonus > 0 ? `+${pData.catchupBonus} catch-up` : '';
        catchupEl.textContent = '';
      } else if (isPlacement) {
        placedEl.textContent  = isSetup
          ? `Staged: ${staged} / ${maxBudget}`
          : `Staged: ${staged} / ${maxBudget}  (min ${minR})`;
        bankEl.textContent    = (!isSetup && bank > 0)              ? `Bank +${bank}`                : '';
        catchupEl.textContent = (!isSetup && pData.catchupBonus > 0) ? `+${pData.catchupBonus} catch-up` : '';
      } else {
        placedEl.textContent  = '';
        bankEl.textContent    = (!isSetup && bank > 0)              ? `Bank +${bank}`                : '';
        catchupEl.textContent = (!isSetup && pData.catchupBonus > 0) ? `+${pData.catchupBonus} catch-up` : '';
      }

      readyEl.disabled    = !isPlacement || simRunning || !isMe;
      readyEl.textContent = isContinuousSim ? '—' : (isReady ? 'Cancel' : 'Ready');
      readyEl.classList.toggle('btn-ready-active', isReady && !isContinuousSim);

      const showPatterns = (isPlacement && !simRunning && isMe) || (isContinuousSim && isMe);
      for (const pattern of PATTERNS) {
        const btn = patternBtns[pattern.id];
        if (!btn) continue;
        btn.disabled = !showPatterns || (!isContinuousSim && isReady);
        btn.classList.toggle('active',
          this._stamp.pattern?.id === pattern.id && this._stamp.color === color);
      }

      this._drawSparkline(sparkCanvas, pData.history, color);
    }

    this._ui.newGame.textContent = phase === MatchPhase.ENDED ? 'Back to Settings' : 'Give Up';
    this._ui.newGame.style.display = 'inline-block';
  }
}
