/* Updated UI: prompt-embedded choice buttons (green/red) that update text per prompt.
   - Old standalone green/red buttons removed.
   - Prompt buttons keep consistent placement; text updates each prompt.
   - choicesByStage records {text, green, red, chosen}.
   - Backwards-compatible loading for older choicesByStage shapes.
*/

(() => {
  const ORDER = 5;
  const STORAGE_KEY = 'predictor_v1';
  const MIN_ROUNDS = 15;
  const WIN_THRESHOLD = 0.55;
  const LOSE_THRESHOLD = 0.80;

  const PROMPTS_PER_STAGE = 10;
  const PROMPTS_BY_STAGE = [
    // Stage 0
    [
      { text: "Do you follow your gut — or wait for proof?", green: 'Follow your gut', red: 'Wait for proof' },
      { text: "The voice says 'trust me.' Do you listen?", green: 'Listen', red: 'Question it' },
      { text: "You can only save one: the one you love, or the one who loves you.", green: 'Save the one you love', red: 'Save the one who loves you' },
      { text: "A shadow says 'act now.' A whisper says 'think first.' Which wins?", green: 'Act now', red: 'Think first' },
      { text: "Is faster always better, or just more dangerous?", green: 'Act fast', red: 'Be cautious' },
      { text: "Your pulse rises. Do you act or observe?", green: 'Act', red: 'Observe' },
      { text: "Do you risk everything for a hunch?", green: 'Risk it', red: 'Play safe' },
      { text: "Do you trust evidence or emotion when they disagree?", green: 'Trust emotion', red: 'Trust evidence' },
      { text: "An opportunity appears suddenly — do you jump?", green: 'Jump', red: 'Hold back' },
      { text: "Do you decide with your heart or your head?", green: 'Heart', red: 'Head' }
    ],
    // Stage 1
    [
      { text: "The system wants stability. Will you obey or disrupt?", green: 'Obey', red: 'Disrupt' },
      { text: "If you do nothing, everything stays the same. If you act, everything changes.", green: 'Maintain', red: 'Change' },
      { text: "Is perfection peace, or prison?", green: 'Peace', red: 'Prison' },
      { text: "Will you preserve the rules or rewrite them?", green: 'Preserve rules', red: 'Rewrite rules' },
      { text: "A glitch promises freedom; a protocol promises safety. Which do you pick?", green: 'Protocol/safety', red: 'Glitch/freedom' },
      { text: "Do you prefer the comfort of routine or the thrill of uncertainty?", green: 'Routine', red: 'Uncertainty' },
      { text: "Do you value harmony over novelty?", green: 'Harmony', red: 'Novelty' },
      { text: "If balance requires sacrifice, what will you sacrifice?", green: 'Sacrifice change', red: 'Sacrifice stability' },
      { text: "Do you mend the machine or smash it for a new start?", green: 'Mend it', red: 'Smash it' },
      { text: "Do you maintain the map or seek the uncharted path?", green: 'Maintain map', red: 'Seek uncharted' }
    ],
    // Stage 2
    [
      { text: "You feel a presence watching your every move. Do you confront it or pretend not to see?", green: 'Confront', red: 'Ignore' },
      { text: "Your next move has already been predicted. Do you repeat your last choice or defy it?", green: 'Repeat', red: 'Defy' },
      { text: "If freedom means chaos, do you still want it?", green: 'Yes, want freedom', red: 'No, want order' },
      { text: "Does a system that predicts you know you, or does it own you?", green: 'Know you', red: 'Own you' },
      { text: "Will you act for yourself, or for what the system expects?", green: 'For myself', red: 'For system' },
      { text: "Can you be yourself while obeying the rules?", green: 'Be myself', red: 'Obey rules' },
      { text: "If your choice defines you, who do you want to be?", green: 'Rebel', red: 'Conform' },
      { text: "Do you test the limits or accept your role?", green: 'Test limits', red: 'Accept role' },
      { text: "Would you rather be a known cog or an unknown rebel?", green: 'Unknown rebel', red: 'Known cog' },
      { text: "If determinism is true, is resistance meaningful?", green: 'Resist', red: 'Accept' }
    ],
    // Stage 3
    [
      { text: "Do you want to know the truth, even if it hurts?", green: 'Know truth', red: 'Protect comfort' },
      { text: "Would you rather forget what’s real or remember what’s unbearable?", green: 'Remember', red: 'Forget' },
      { text: "If lying brings peace, is it still wrong?", green: 'Tell truth', red: 'Lie for peace' },
      { text: "Is ignorance a kindness or a cowardice?", green: 'Kindness', red: 'Cowardice' },
      { text: "Do you sacrifice truth to protect someone you love?", green: 'Protect them', red: 'Tell truth' },
      { text: "Which is heavier: truth you must carry or lies that free you?", green: 'Carry truth', red: 'Choose lies' },
      { text: "Would you face a painful fact to change it, or cling to a pleasant fiction?", green: 'Face it', red: 'Cling to fiction' },
      { text: "Does comfort justify deception?", green: 'No', red: 'Yes' },
      { text: "Is honesty an obligation or a weapon?", green: 'Obligation', red: 'Weapon' },
      { text: "When truth isolates you, do you still speak it?", green: 'Speak', red: 'Stay silent' }
    ]
  ];

  const rand = (n) => Math.floor(Math.random() * n);

  // Predictor & Stats (unchanged)
  class MarkovPredictor {
    constructor(order = ORDER, data = null) {
      this.order = order;
      this.counts = data?.counts || {};
      this.history = data?.history || [];
    }
    _keyForContext(contextArr) { return contextArr.join(','); }
    observe(choice) {
      const h = this.history;
      for (let k = 1; k <= this.order; k++) {
        if (h.length >= k) {
          const ctx = h.slice(h.length - k, h.length);
          const key = this._keyForContext(ctx);
          if (!this.counts[key]) this.counts[key] = { G: 0, R: 0 };
          this.counts[key][choice] += 1;
        }
      }
      if (!this.counts['']) this.counts[''] = { G: 0, R: 0 };
      this.counts[''][choice] += 1;
      this.history.push(choice);
      if (this.history.length > 200) this.history.shift();
    }
    predict() {
      const h = this.history;
      for (let k = Math.min(this.order, h.length); k >= 1; k--) {
        const ctx = h.slice(h.length - k, h.length);
        const key = this._keyForContext(ctx);
        const bucket = this.counts[key];
        if (bucket && (bucket.G + bucket.R > 0)) {
          const total = bucket.G + bucket.R;
          const pG = bucket.G / total;
          const pR = bucket.R / total;
          const pred = pG >= pR ? 'Green' : 'Red';
          const confidence = Math.abs(pG - pR);
          return { pred, pG, pR, confidence, usedContext: ctx.slice() };
        }
      }
      const global = this.counts[''];
      if (global && (global.G + global.R > 0)) {
        const total = global.G + global.R;
        const pG = global.G / total;
        const pR = global.R / total;
        const pred = pG >= pR ? 'Green' : 'Red';
        const confidence = Math.abs(pG - pR);
        return { pred, pG, pR, confidence, usedContext: [] };
      }
      return { pred: (Math.random() < 0.5 ? 'Green' : 'Red'), pG: 0.5, pR: 0.5, confidence: 0, usedContext: [] };
    }
    serialize() { return { order: this.order, counts: this.counts, history: this.history }; }
    static deserialize(obj) { return new MarkovPredictor(obj.order || ORDER, { counts: obj.counts || {}, history: obj.history || [] }); }
  }

  class Stats {
    constructor(data) {
      this.correct = data?.correct || 0;
      this.total = data?.total || 0;
    }
    register(prediction, actual) {
      this.total += 1;
      if (prediction === actual) this.correct += 1;
    }
    accuracy() {
      return this.total === 0 ? 0 : (this.correct / this.total);
    }
    serialize() { return { correct: this.correct, total: this.total }; }
    static deserialize(obj) { return new Stats(obj); }
  }

  // Maze visualizer (unchanged)
  class MazeCanvas {
    constructor(canvasEl) {
      this.canvas = canvasEl;
      this.ctx = this.canvas.getContext('2d');
      this.width = this.canvas.width;
      this.height = this.canvas.height;
      this.reset();
    }

    reset() {
      this.cellSize = 18;
      this.cols = Math.floor(this.width / this.cellSize);
      this.rows = Math.floor(this.height / this.cellSize);
      this.centerRow = Math.floor(this.rows / 2);
      this.startCol = 2;
      this.path = [];
      this.current = { r: this.centerRow, c: this.startCol };
      this.steps = 0;
      this.drawBackground();
      this._drawCell(this.current.r, this.current.c, '#334155', true);
    }

    _cellToXY(r, c) { return { x: c * this.cellSize + Math.floor(this.cellSize / 2), y: r * this.cellSize + Math.floor(this.cellSize / 2) }; }

    _drawCell(r, c, fill, small = false) {
      const x = c * this.cellSize; const y = r * this.cellSize;
      this.ctx.fillStyle = fill; const pad = small ? 4 : 1;
      this.ctx.fillRect(x + pad, y + pad, this.cellSize - pad * 2, this.cellSize - pad * 2);
    }

    drawBackground() {
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.fillStyle = '#031023';
      this.ctx.fillRect(0, 0, this.width, this.height);
      this.ctx.strokeStyle = 'rgba(255,255,255,0.02)';
      this.ctx.lineWidth = 1;
      for (let r = 0; r <= this.rows; r++) {
        this.ctx.beginPath(); this.ctx.moveTo(0, r * this.cellSize); this.ctx.lineTo(this.cols * this.cellSize, r * this.cellSize); this.ctx.stroke();
      }
      for (let c = 0; c <= this.cols; c++) {
        this.ctx.beginPath(); this.ctx.moveTo(c * this.cellSize, 0); this.ctx.lineTo(c * this.cellSize, this.rows * this.cellSize); this.ctx.stroke();
      }
    }

    step(choice, correct) {
      const deltaR = (choice === 'G') ? -1 : 1;
      const variation = Math.random() < 0.2 ? 0 : 0;
      let newR = Math.max(1, Math.min(this.rows - 2, this.current.r + deltaR + variation));
      let newC = this.current.c + 1;
      if (newC >= this.cols - 1) { this._panAndContinue(); newC = this.current.c + 1; }
      const from = this._cellToXY(this.current.r, this.current.c);
      const to = this._cellToXY(newR, newC);
      this._drawCorridor(from, to, correct);
      this._drawCell(newR, newC, correct ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)', true);
      this.current = { r: newR, c: newC };
      this.path.push({ r: newR, c: newC, choice, correct });
      this.steps++;
    }

    _drawCorridor(from, to, correct) {
      const grad = this.ctx.createLinearGradient(from.x, from.y, to.x, to.y);
      if (correct) { grad.addColorStop(0, 'rgba(16,185,129,0.85)'); grad.addColorStop(1, 'rgba(6,182,212,0.6)'); }
      else { grad.addColorStop(0, 'rgba(239,68,68,0.85)'); grad.addColorStop(1, 'rgba(124,58,237,0.6)'); }
      this.ctx.strokeStyle = grad; this.ctx.lineWidth = Math.floor(this.cellSize * 0.6); this.ctx.lineCap = 'round';
      this.ctx.beginPath(); this.ctx.moveTo(from.x, from.y); this.ctx.lineTo(to.x, to.y); this.ctx.stroke();
    }

    _panAndContinue() {
      const tail = this.path.slice(-10); this.path = []; this.drawBackground(); this.current = { r: this.centerRow, c: this.startCol };
      this._drawCell(this.current.r, this.current.c, '#334155', true);
      for (let i = 0; i < tail.length; i++) {
        const item = tail[i];
        const newC = this.startCol + 1 + i;
        const from = this._cellToXY(this.current.r, this.current.c);
        const to = this._cellToXY(item.r, newC);
        this._drawCorridor(from, to, item.correct);
        this._drawCell(item.r, newC, item.correct ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)', true);
        this.current = { r: item.r, c: newC };
        this.path.push({ r: item.r, c: newC, choice: item.choice, correct: item.correct });
      }
    }

    finish(success) {
      const end = this.current; const { x, y } = this._cellToXY(end.r, end.c);
      const rad = Math.max(this.cellSize * 1.2, 24);
      const g = this.ctx.createRadialGradient(x, y, 4, x, y, rad * 2);
      if (success) { g.addColorStop(0, 'rgba(34,197,94,0.95)'); g.addColorStop(1, 'rgba(6,182,212,0.12)'); }
      else { g.addColorStop(0, 'rgba(220,38,38,0.95)'); g.addColorStop(1, 'rgba(124,58,237,0.12)'); }
      this.ctx.fillStyle = g; this.ctx.beginPath(); this.ctx.arc(x, y, rad * 1.6, 0, Math.PI * 2); this.ctx.fill();
    }
  }

  // DOM refs (new prompt buttons used)
  const dom = {
    accuracyLabel: document.getElementById('accuracyLabel'),
    statsLabel: document.getElementById('statsLabel'),
    meterFill: document.getElementById('meterFill'),
    promptMain: document.getElementById('promptMain'),
    greenChoiceBtn: document.getElementById('greenChoiceBtn'),
    redChoiceBtn: document.getElementById('redChoiceBtn'),
    nextPromptBtn: document.getElementById('nextPromptBtn'),
    resetBtn: document.getElementById('resetBtn'),
    diag: document.getElementById('diag'),
    roundsLabel: document.getElementById('roundsLabel'),
    statusLabel: document.getElementById('statusLabel'),
    resultModal: document.getElementById('resultModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalMessage: document.getElementById('modalMessage'),
    modalReset: document.getElementById('modalReset'),
    modalClose: document.getElementById('modalClose'),
    continueBtn: document.getElementById('continueBtn'),
    endActions: document.getElementById('endActions'),
    mazeHint: document.getElementById('mazeHint'),
  };

  let predictor, stats, maze;
  let currentPromptObj = null;
  let lastPrediction = null;
  let rounds = 0;
  let ended = false;

  // choicesByStage: record objects {text, green, red, chosen}
  let choicesByStage = [[], [], [], []];
  let promptStage = 0;
  let ignoreThresholdsUntilRounds = 0;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        predictor = MarkovPredictor.deserialize(parsed.predictor || {});
        stats = Stats.deserialize(parsed.stats || {});
        // migrate older shapes
        if (parsed.choicesByStage && Array.isArray(parsed.choicesByStage)) {
          const firstStage = parsed.choicesByStage[0];
          if (Array.isArray(firstStage) && firstStage.length > 0 && typeof firstStage[0] === 'string') {
            choicesByStage = parsed.choicesByStage.map(arr => (arr || []).map(ch => ({ text: '', green: '', red: '', chosen: ch })));
          } else {
            choicesByStage = parsed.choicesByStage.map(arr => (Array.isArray(arr) ? arr.slice() : []));
            while (choicesByStage.length < 4) choicesByStage.push([]);
            if (choicesByStage.length > 4) choicesByStage = choicesByStage.slice(0, 4);
          }
        } else {
          choicesByStage = [[], [], [], []];
        }
        rounds = stats.total;
      } else {
        predictor = new MarkovPredictor();
        stats = new Stats();
        choicesByStage = [[], [], [], []];
        rounds = 0;
      }
    } catch (e) {
      console.error('Failed to load state', e);
      predictor = new MarkovPredictor();
      stats = new Stats();
      choicesByStage = [[], [], [], []];
      rounds = 0;
    }
  }

  function saveState() {
    const blob = { predictor: predictor.serialize(), stats: stats.serialize(), choicesByStage };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  }

  function currentStageIndex() {
    const idx = Math.floor(rounds / PROMPTS_PER_STAGE);
    return Math.min(3, idx);
  }

  function pickPrompt() {
    const stage = currentStageIndex();
    promptStage = stage;
    const pool = PROMPTS_BY_STAGE[stage];
    const pick = pool[rand(pool.length)];
    currentPromptObj = { text: pick.text, green: pick.green, red: pick.red };
    if (dom.promptMain) dom.promptMain.textContent = currentPromptObj.text;
    if (dom.greenChoiceBtn) dom.greenChoiceBtn.textContent = currentPromptObj.green;
    if (dom.redChoiceBtn) dom.redChoiceBtn.textContent = currentPromptObj.red;
    // ARIA: reset pressed state
    if (dom.greenChoiceBtn) dom.greenChoiceBtn.setAttribute('aria-pressed', 'false');
    if (dom.redChoiceBtn) dom.redChoiceBtn.setAttribute('aria-pressed', 'false');
  }

  function updateMeter() {
    const acc = stats.accuracy() * 100;
    if (dom.accuracyLabel) dom.accuracyLabel.textContent = `Accuracy: ${acc.toFixed(1)}%`;
    if (dom.statsLabel) dom.statsLabel.textContent = `Algorithm correct: ${stats.correct} / ${stats.total}`;
    if (dom.roundsLabel) dom.roundsLabel.textContent = `Rounds: ${rounds}`;
    if (dom.meterFill) dom.meterFill.style.width = `${acc}%`;
  }

  function updateDiag(predObj) {
    if (!dom.diag) return;
    const ctx = predObj.usedContext && predObj.usedContext.length ? predObj.usedContext.join('→') : '(none)';
    dom.diag.innerHTML = `
      Used context: ${ctx}<br/>
      p(G): ${predObj.pG.toFixed(2)}, p(R): ${predObj.pR.toFixed(2)}<br/>
      Confidence metric: ${predObj.confidence.toFixed(2)}
      <br/><small style="color:var(--muted)">Predictions are only visible in diagnostics for debugging.</small>
    `;
  }

  function makePrediction() {
    lastPrediction = predictor.predict();
    updateDiag(lastPrediction);
  }

  function disableInputs(disabled) {
    if (dom.greenChoiceBtn) dom.greenChoiceBtn.disabled = disabled;
    if (dom.redChoiceBtn) dom.redChoiceBtn.disabled = disabled;
    if (dom.nextPromptBtn) dom.nextPromptBtn.disabled = disabled;
  }

  function endGame(success, reason) {
    ended = true;
    disableInputs(true);
    if (dom.statusLabel) {
      dom.statusLabel.textContent = success ? 'Status: Player WON' : 'Status: Player LOST';
      dom.statusLabel.style.color = success ? 'var(--green)' : 'var(--red)';
    }
    if (maze) maze.finish(success);
    if (dom.modalTitle) dom.modalTitle.textContent = success ? 'You escaped!' : 'You have been predicted';
    if (dom.modalMessage) dom.modalMessage.textContent = reason;
    if (dom.resultModal) { dom.resultModal.hidden = false; dom.resultModal.style.display = 'flex'; }
    if (dom.endActions) dom.endActions.hidden = false;
  }

  function checkThresholdsAndMaybeEnd() {
    if (rounds <= ignoreThresholdsUntilRounds) return;
    if (rounds < MIN_ROUNDS) return;
    const acc = stats.accuracy();
    if (acc < WIN_THRESHOLD) {
      endGame(true, `Algorithm accuracy dropped below ${Math.round(WIN_THRESHOLD * 100)}% after ${rounds} rounds.`);
    } else if (acc > LOSE_THRESHOLD) {
      endGame(false, `Algorithm accuracy rose above ${Math.round(LOSE_THRESHOLD * 100)}% after ${rounds} rounds.`);
    }
  }

  // Core choice handler (used by prompt buttons)
  function onChoice(choiceLabel) {
    if (ended) return;
    const actual = choiceLabel === 'G' ? 'Green' : 'Red';
    if (!lastPrediction) makePrediction();
    const predicted = lastPrediction.pred;
    const correctBool = (predicted === actual);

    stats.register(predicted, actual);
    predictor.observe(choiceLabel);

    const record = { text: currentPromptObj?.text || '', green: currentPromptObj?.green || '', red: currentPromptObj?.red || '', chosen: choiceLabel };
    if (!choicesByStage[promptStage]) choicesByStage[promptStage] = [];
    choicesByStage[promptStage].push(record);

    // update aria-pressed for the chosen button
    if (dom.greenChoiceBtn) dom.greenChoiceBtn.setAttribute('aria-pressed', choiceLabel === 'G' ? 'true' : 'false');
    if (dom.redChoiceBtn) dom.redChoiceBtn.setAttribute('aria-pressed', choiceLabel === 'R' ? 'true' : 'false');

    rounds = stats.total;
    if (maze) maze.step(choiceLabel, correctBool);

    updateMeter();
    saveState();

    pickPrompt();
    makePrediction();
    checkThresholdsAndMaybeEnd();
  }

  function closeModalAndAllowContinue() {
    if (!dom.resultModal) return;
    dom.resultModal.hidden = true;
    dom.resultModal.style.display = 'none';
    ended = false;
    disableInputs(false);
    if (dom.endActions) dom.endActions.hidden = true;
    if (dom.statusLabel) { dom.statusLabel.textContent = 'Status: Ongoing'; dom.statusLabel.style.color = ''; }
    ignoreThresholdsUntilRounds = rounds + 1;
  }

  function attachHandlers() {
    if (dom.greenChoiceBtn) dom.greenChoiceBtn.addEventListener('click', () => onChoice('G'));
    if (dom.redChoiceBtn) dom.redChoiceBtn.addEventListener('click', () => onChoice('R'));
    if (dom.nextPromptBtn) dom.nextPromptBtn.addEventListener('click', () => { pickPrompt(); makePrediction(); });
    if (dom.resetBtn) dom.resetBtn.addEventListener('click', () => {
      if (confirm('Reset predictor and stats?')) {
        localStorage.removeItem(STORAGE_KEY);
        loadState();
        if (maze) maze.reset();
        pickPrompt();
        makePrediction();
        updateMeter();
        if (dom.diag) dom.diag.textContent = 'Reset complete.';
        if (dom.statusLabel) dom.statusLabel.textContent = 'Status: Ongoing';
        if (dom.statusLabel) dom.statusLabel.style.color = '';
        ended = false;
        disableInputs(false);
        if (dom.endActions) dom.endActions.hidden = true;
        ignoreThresholdsUntilRounds = 0;
      }
    });

    if (dom.modalClose) dom.modalClose.addEventListener('click', closeModalAndAllowContinue);
    if (dom.resultModal) dom.resultModal.addEventListener('click', (e) => { if (e.target === dom.resultModal) closeModalAndAllowContinue(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dom.resultModal && !dom.resultModal.hidden) closeModalAndAllowContinue(); });
    if (dom.modalReset) dom.modalReset.addEventListener('click', () => { localStorage.removeItem(STORAGE_KEY); location.reload(); });
    if (dom.continueBtn) dom.continueBtn.addEventListener('click', () => {
      stats = new Stats(); predictor = new MarkovPredictor(); saveState(); ended = false;
      if (dom.endActions) dom.endActions.hidden = true; if (dom.resultModal) { dom.resultModal.hidden = true; dom.resultModal.style.display = 'none'; }
      if (dom.statusLabel) { dom.statusLabel.textContent = 'Status: Ongoing'; dom.statusLabel.style.color = ''; }
      if (maze) maze.reset(); rounds = 0; choicesByStage = [[], [], [], []]; pickPrompt(); makePrediction(); updateMeter(); disableInputs(false); ignoreThresholdsUntilRounds = 0;
    });
  }

  function init() {
    loadState();
    const canvas = document.getElementById('mazeCanvas');
    maze = canvas ? new MazeCanvas(canvas) : null;
    attachHandlers();
    if (dom.resultModal) { dom.resultModal.hidden = true; dom.resultModal.style.display = 'none'; }
    if (dom.endActions) dom.endActions.hidden = true;
    ended = false;
    ignoreThresholdsUntilRounds = 0;
    disableInputs(false);
    if (dom.statusLabel) { dom.statusLabel.textContent = 'Status: Ongoing'; dom.statusLabel.style.color = ''; }

    pickPrompt();
    makePrediction();
    updateMeter();
  }

  init();

})();