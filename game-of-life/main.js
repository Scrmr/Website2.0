import { GameSettings, Match }                               from './src/domain.js';
import {
  CompetitiveLifeRuleEngine,
  HexCompetitiveLifeRuleEngine,
  HalfBoardPlacementRegionPolicy,
  StandardPlacementValidator,
  StandardWinConditionEvaluator,
  BoardStatisticsService,
} from './src/services.js';
import { PlacementSubmissionService, MatchFlowCoordinator } from './src/application.js';
import { GameRenderer }                                     from './src/renderer.js';
import { HexGameRenderer }                                  from './src/hex-renderer.js';
import { LocalMatchController }                             from './src/controller.js';
import { OnlineMatchController }                            from './src/online-controller.js';

// ── Screens ───────────────────────────────────────────────────────────────────

const settingsScreen = document.getElementById('settings-screen');
const gameScreen     = document.getElementById('game-screen');
const settingsUI     = {
  modeHelp:         document.getElementById('mode-help'),
  modeFacts:        document.getElementById('mode-facts'),
  pacingHelp:       document.getElementById('pacing-help'),
  placementHelp:    document.getElementById('placement-help'),
  timerHelp:        document.getElementById('timer-help'),
  summaryBlurb:     document.getElementById('summary-blurb'),
  summaryMode:      document.getElementById('summary-mode'),
  summaryBoard:     document.getElementById('summary-board'),
  summarySetup:     document.getElementById('summary-setup'),
  summaryOpponent:  document.getElementById('summary-opponent'),
  summaryReinforce: document.getElementById('summary-reinforcement'),
  summaryPacing:    document.getElementById('summary-pacing'),
  summaryTimer:     document.getElementById('summary-timer'),
  summaryTip:       document.getElementById('summary-tip'),
  startBtn:         document.getElementById('start-btn'),
  setupInput:       document.getElementById('s-setup'),
  reinMinInput:     document.getElementById('s-rmin'),
  reinMaxInput:     document.getElementById('s-rmax'),
};

function showSettings() {
  gameScreen.style.display     = 'none';
  settingsScreen.style.display = 'block';
}

function showGame() {
  settingsScreen.style.display = 'none';
  gameScreen.style.display     = 'block';
}

// ── Settings reading ──────────────────────────────────────────────────────────

const MODE_PRESETS = {
  square: {
    label: 'Square grid',
    actionLabel: 'square match',
    help: 'Square uses the classic 8-neighbour board. A living cell survives with 2-3 same-colour neighbours and no more than 3 total living neighbours. Birth still happens at exactly 3 living neighbours.',
    facts: ['8-neighbour board', 'Tighter crowding rule', 'Best for familiar Life patterns'],
    blurb: 'A tighter, more tactical ruleset that rewards precise spacing and disciplined staging.',
    tip: 'Square tends to punish overgrowth quickly, so stable anchors and controlled reinforcements matter more.',
  },
  hex: {
    label: 'Hex grid',
    actionLabel: 'hex match',
    help: 'Hex uses a 6-neighbour offset grid. A living cell survives with 2-3 same-colour neighbours and no more than 4 total living neighbours. Birth happens at exactly 3 living neighbours.',
    facts: ['6-neighbour offset grid', 'Smoother front lines', 'Better for lateral pressure and flanks'],
    blurb: 'A wider-flowing board that produces softer edges and more sideways pressure between fronts.',
    tip: 'Hex gives clusters a little more breathing room, so spreading influence across lanes is often stronger than stacking tightly.',
  },
};

const GRID_PRESETS = {
  small:  { boardWidth: 30,  boardHeight: 18, summary: '30 x 18',   boardNote: 'Fast contact and earlier contested pressure.' },
  medium: { boardWidth: 40,  boardHeight: 24, summary: '40 x 24',   boardNote: 'Balanced spacing for most matches.' },
  large:  { boardWidth: 56,  boardHeight: 32, summary: '56 x 32',   boardNote: 'More expansion room before fronts collide.' },
  huge:   { boardWidth: 120, boardHeight: 72, summary: '120 x 72',  boardNote: 'Maximum territory — deep positioning and long-range strategies.' },
};

const PACING_PRESETS = {
  5:          { blockSize: 5,  continuous: false, summary: 'Every 5 gen',    help: 'Very frequent placement windows. Good for reactive micro-adjustments and fast corrections.' },
  10:         { blockSize: 10, continuous: false, summary: 'Every 10 gen',   help: 'Default rhythm. Each block gives patterns time to develop before you intervene.' },
  25:         { blockSize: 25, continuous: false, summary: 'Every 25 gen',   help: 'Longer arcs between pauses. You commit to bigger strategic bets each round.' },
  50:         { blockSize: 50, continuous: false, summary: 'Every 50 gen',   help: 'Very infrequent windows. Placement quality matters enormously — every cell counts.' },
  continuous: { blockSize: 25, continuous: true,  summary: 'Continuous',     help: 'No placement pauses. Both players receive cells in their bank every 25 generations and can spend them at any time by clicking or dragging during simulation.' },
};

const SPEED_PRESETS = {
  slow:   { stepMs: 280, label: 'Slow',   help: 'You get more time to read each simulation block.' },
  normal: { stepMs: 140, label: 'Normal', help: 'A balanced default that still lets patterns breathe.' },
  fast:   { stepMs: 60,  label: 'Fast',   help: 'Rounds resolve quickly and reward intuition.' },
  blitz:  { stepMs: 25,  label: 'Blitz',  help: 'Pure chaos pace for short, high-energy games.' },
};

const GENERATION_PRESETS = {
  endless: { label: 'Endless', summary: 'Endless game' },
  100: { label: '100 generations', summary: 'Short game' },
  250: { label: '250 generations', summary: 'Standard game' },
  500: { label: '500 generations', summary: 'Long game' },
};

const TIMER_PRESETS = {
  0:  { summary: 'No placement timer', help: 'Players can take as long as they want in setup and reinforcement rounds.' },
  20: { summary: '20 second timer',    help: 'Very little deliberation. Great for snappy, high-pressure rounds.' },
  30: { summary: '30 second timer',    help: 'Adds pressure without making placement feel rushed.' },
  45: { summary: '45 second timer',    help: 'Leaves room for careful pattern placement while still enforcing pace.' },
};

const OPPONENT_PRESETS = {
  normal:  { label: 'Normal bot',  summary: 'Normal bot',  help: 'Balanced bot that uses anchors, movers, traps, and measured pressure.' },
  hard:    { label: 'Hard bot',    summary: 'Hard bot',    help: 'Reads the front more aggressively and spends banks in sharper bursts.' },
  strange: { label: 'Strange bot', summary: 'Strange bot', help: 'Prefers odd oscillators, delayed chaos, and unstable ecological gambits.' },
  cruel:   { label: 'Cruel bot',   summary: 'Cruel bot',   help: 'Pushes toward weak regions and uses attacking formations more often.' },
  human:   { label: 'Human local', summary: 'Human local', help: 'Two people share the same screen: Red on the left, Blue on the right.' },
};

function readSettings() {
  const grid   = GRID_PRESETS[activeOptionValue('.opt-grid', 'huge')];
  const speed  = SPEED_PRESETS[activeOptionValue('.opt-speed', 'normal')];
  const gensVal = activeOptionValue('.opt-gens', 'endless');
  const gens   = gensVal === 'endless' ? 0 : parseInt(gensVal, 10);
  const timer  = parseInt(activeOptionValue('.opt-timer', '0'), 10);
  const pacing = PACING_PRESETS[activeOptionValue('.opt-pacing', 'continuous')];
  const { setupCells, reinMin, reinMax } = readPlacementInputs(true);

  return new GameSettings({
    boardWidth:                     grid.boardWidth,
    boardHeight:                    grid.boardHeight,
    initialPlacementCount:          setupCells,
    reinforcementMinPlacementCount: reinMin,
    reinforcementMaxPlacementCount: reinMax,
    simulationBlockSize:            pacing.blockSize,
    simulationStepMs:               speed.stepMs,
    maxGenerations:                 gens,
    placementTimerSeconds:          timer,
    continuousMode:                 pacing.continuous,
  });
}

function settingsToPlain(settings) {
  return {
    boardWidth:                     settings.boardWidth,
    boardHeight:                    settings.boardHeight,
    initialPlacementCount:          settings.initialPlacementCount,
    reinforcementMinPlacementCount: settings.reinforcementMinPlacementCount,
    reinforcementMaxPlacementCount: settings.reinforcementMaxPlacementCount,
    simulationBlockSize:            settings.simulationBlockSize,
    maxGenerations:                 settings.maxGenerations,
    simulationStepMs:               settings.simulationStepMs,
    contestedZoneWidth:             settings.contestedZoneWidth,
    contestedZoneUnlocksAtRound:    settings.contestedZoneUnlocksAtRound,
    placementTimerSeconds:          settings.placementTimerSeconds,
    continuousMode:                 settings.continuousMode,
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function activeOptionValue(selector, fallback) {
  return document.querySelector(`${selector}.active`)?.dataset.val ?? fallback;
}

function readPlacementInputs(commit = false) {
  const setupRaw = parseInt(settingsUI.setupInput.value, 10);
  const minRaw   = parseInt(settingsUI.reinMinInput.value, 10);
  const maxRaw   = parseInt(settingsUI.reinMaxInput.value, 10);

  const setupCells = clamp(Number.isNaN(setupRaw) ? 10 : setupRaw, 1, 30);
  const reinMin    = clamp(Number.isNaN(minRaw)   ? 5  : minRaw,   1, 20);
  const reinMax    = clamp(Number.isNaN(maxRaw)   ? 10 : maxRaw,   reinMin, 40);

  if (commit) {
    settingsUI.setupInput.value   = String(setupCells);
    settingsUI.reinMinInput.value = String(reinMin);
    settingsUI.reinMaxInput.value = String(reinMax);
  }

  return { setupCells, reinMin, reinMax };
}

function syncToggleAccessibility(selector) {
  document.querySelectorAll(selector).forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.classList.contains('active')));
  });
}

function renderModeFacts(facts) {
  settingsUI.modeFacts.replaceChildren(...facts.map(fact => {
    const chip = document.createElement('span');
    chip.className   = 'setting-chip';
    chip.textContent = fact;
    return chip;
  }));
}

function syncSettingsUI() {
  const mode        = MODE_PRESETS[activeOptionValue('.opt-mode', 'square')];
  const grid        = GRID_PRESETS[activeOptionValue('.opt-grid', 'huge')];
  const speed       = SPEED_PRESETS[activeOptionValue('.opt-speed', 'normal')];
  const generations = GENERATION_PRESETS[activeOptionValue('.opt-gens', 'endless')];
  const timer       = TIMER_PRESETS[activeOptionValue('.opt-timer', '0')];
  const pacing      = PACING_PRESETS[activeOptionValue('.opt-pacing', 'continuous')];
  const opponent    = OPPONENT_PRESETS[activeOptionValue('.opt-opponent', 'normal')];
  const { setupCells, reinMin, reinMax } = readPlacementInputs();
  const totalCells  = grid.boardWidth * grid.boardHeight;

  settingsUI.modeHelp.textContent = mode.help;
  renderModeFacts(mode.facts);

  settingsUI.pacingHelp.textContent =
    `${grid.summary} gives you ${totalCells} total cells to cultivate and contest. ${grid.boardNote} ${speed.help} ${generations.label === 'Endless' ? 'The match keeps living until a player is eliminated or gives up.' : `If neither player is eliminated by ${generations.label}, the higher live-cell count wins.`} ${pacing.help}`;

  settingsUI.placementHelp.textContent = pacing.continuous
    ? `Setup requires exactly ${setupCells} cells per player. After that, both players receive ${reinMin} cells in their bank every ${pacing.blockSize} generations. Spend them by clicking or dragging during simulation — no Ready button, no pauses.`
    : `Setup requires exactly ${setupCells} cells per player. Reinforcement rounds allow ${reinMin}-${reinMax} cells, and any unused budget banks with a 1-cell storage tax.`;

  settingsUI.timerHelp.textContent =
    `${timer.help} When the timer expires, both players are force-readied with whatever they have staged.`;

  settingsUI.summaryBlurb.textContent      = `${mode.blurb} ${grid.boardNote}`;
  settingsUI.summaryMode.textContent       = mode.label;
  settingsUI.summaryBoard.textContent      = `${grid.summary} (${totalCells} cells)`;
  settingsUI.summarySetup.textContent      = `${setupCells} cells each`;
  settingsUI.summaryOpponent.textContent   = opponent.summary;
  settingsUI.summaryReinforce.textContent  = pacing.continuous ? `${reinMin} cells/drop (auto)` : `${reinMin}-${reinMax} cells`;
  settingsUI.summaryPacing.textContent     = `${speed.label}, ${generations.summary}, ${pacing.summary}`;
  settingsUI.summaryTimer.textContent      = pacing.continuous ? 'N/A (continuous)' : timer.summary;
  settingsUI.summaryTip.textContent        = `${mode.tip} ${opponent.help}`;
  settingsUI.startBtn.textContent          = `Start ${mode.actionLabel}`;
}

// ── Toggle-button groups ──────────────────────────────────────────────────────

function setupToggleGroup(selector) {
  syncToggleAccessibility(selector);
  document.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(selector).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      syncToggleAccessibility(selector);
      syncSettingsUI();
    });
  });
}

setupToggleGroup('.opt-mode');
setupToggleGroup('.opt-grid');
setupToggleGroup('.opt-speed');
setupToggleGroup('.opt-gens');
setupToggleGroup('.opt-timer');
setupToggleGroup('.opt-pacing');
setupToggleGroup('.opt-opponent');

[settingsUI.setupInput, settingsUI.reinMinInput, settingsUI.reinMaxInput].forEach(input => {
  input.addEventListener('input', syncSettingsUI);
  input.addEventListener('blur', () => {
    readPlacementInputs(true);
    syncSettingsUI();
  });
});

syncSettingsUI();

// ── Local / Online tab toggle ─────────────────────────────────────────────────

const localAside  = document.getElementById('local-aside');
const onlineAside = document.getElementById('online-aside');

document.getElementById('tab-local').addEventListener('click', () => {
  document.getElementById('tab-local').classList.add('active');
  document.getElementById('tab-online').classList.remove('active');
  localAside.style.display  = '';
  onlineAside.style.display = 'none';
});

document.getElementById('tab-online').addEventListener('click', () => {
  document.getElementById('tab-online').classList.add('active');
  document.getElementById('tab-local').classList.remove('active');
  localAside.style.display  = 'none';
  onlineAside.style.display = '';
});

// ── Online lobby sub-tabs (Create / Join) ─────────────────────────────────────

const createPanel = document.getElementById('create-panel');
const joinPanel   = document.getElementById('join-panel');

document.getElementById('lobby-create-tab').addEventListener('click', () => {
  document.getElementById('lobby-create-tab').classList.add('active');
  document.getElementById('lobby-join-tab').classList.remove('active');
  createPanel.style.display = '';
  joinPanel.style.display   = 'none';
});

document.getElementById('lobby-join-tab').addEventListener('click', () => {
  document.getElementById('lobby-join-tab').classList.add('active');
  document.getElementById('lobby-create-tab').classList.remove('active');
  joinPanel.style.display   = '';
  createPanel.style.display = 'none';
});

// ── Shared game UI map ────────────────────────────────────────────────────────

function buildGameUI() {
  return {
    genCounter:   document.getElementById('gen-counter'),
    phaseLabel:   document.getElementById('phase-label'),
    timer:        document.getElementById('timer'),
    domRed:       document.getElementById('dom-red'),
    domBlue:      document.getElementById('dom-blue'),
    domRedPct:    document.getElementById('dom-red-pct'),
    domBluePct:   document.getElementById('dom-blue-pct'),
    ecoStability: document.getElementById('eco-stability'),
    ecoDiversity: document.getElementById('eco-diversity'),
    ecoAge:       document.getElementById('eco-age'),
    ecoVolatility: document.getElementById('eco-volatility'),
    ecoTerritory: document.getElementById('eco-territory'),
    ecoStabilityBar: document.getElementById('eco-stability-bar'),
    ecoDiversityBar: document.getElementById('eco-diversity-bar'),
    ecoAgeBar:       document.getElementById('eco-age-bar'),
    ecoVolatilityBar: document.getElementById('eco-volatility-bar'),
    ecoTerritoryBar: document.getElementById('eco-territory-bar'),
    redCells:     document.getElementById('red-cells'),
    redPlaced:    document.getElementById('red-placed'),
    redBank:      document.getElementById('red-bank'),
    redCatchup:   document.getElementById('red-catchup'),
    redReady:     document.getElementById('red-ready'),
    redError:     document.getElementById('red-error'),
    redPatterns:  document.getElementById('red-patterns'),
    redSpark:     document.getElementById('red-spark'),
    blueCells:    document.getElementById('blue-cells'),
    bluePlaced:   document.getElementById('blue-placed'),
    blueBank:     document.getElementById('blue-bank'),
    blueCatchup:  document.getElementById('blue-catchup'),
    blueReady:    document.getElementById('blue-ready'),
    blueError:    document.getElementById('blue-error'),
    bluePatterns: document.getElementById('blue-patterns'),
    blueSpark:    document.getElementById('blue-spark'),
    newGame:      document.getElementById('new-game'),
  };
}

// ── Game lifecycle ────────────────────────────────────────────────────────────

let activeController = null;

function startGame(settings, mode = 'square', options = {}) {
  if (activeController) activeController.detach();

  const match        = new Match(settings);
  const engine       = mode === 'hex' ? new HexCompetitiveLifeRuleEngine()
                                      : new CompetitiveLifeRuleEngine();
  const region       = new HalfBoardPlacementRegionPolicy();
  const validator    = new StandardPlacementValidator();
  const winEval      = new StandardWinConditionEvaluator();
  const statsService = new BoardStatisticsService();
  const subs         = new PlacementSubmissionService();

  const coord = new MatchFlowCoordinator(
    match, subs, validator, engine, winEval, statsService, region
  );

  const canvas   = document.getElementById('game-canvas');
  const renderer = mode === 'hex' ? new HexGameRenderer(canvas, settings)
                                  : new GameRenderer(canvas, settings);
  const ctrl     = new LocalMatchController(coord, renderer, settings, options);

  ctrl.attach(canvas, buildGameUI());
  ctrl.onNewGame(() => {
    if (activeController) activeController.detach();
    showSettings();
  });

  activeController = ctrl;
}

// Start button (local)
settingsUI.startBtn.addEventListener('click', () => {
  const mode = activeOptionValue('.opt-mode', 'square');
  const opponent = activeOptionValue('.opt-opponent', 'normal');
  showGame();
  startGame(readSettings(), mode, {
    botDifficulty: opponent === 'human' ? null : opponent,
  });
});

// ── Online ────────────────────────────────────────────────────────────────────

let socket = null;

function getSocket() {
  if (!socket) {
    const serverUrl = (window.location.hostname === 'localhost' ||
                       window.location.hostname === '127.0.0.1')
      ? 'http://localhost:8080'
      : 'https://poemgenerator-492211.appspot.com';
    socket = io(serverUrl);
  }
  return socket;
}

function startOnlineGame(sock, color, settingsData, mode) {
  if (activeController) activeController.detach();

  const settings = new GameSettings(settingsData);
  const canvas   = document.getElementById('game-canvas');
  const renderer = mode === 'hex' ? new HexGameRenderer(canvas, settings)
                                  : new GameRenderer(canvas, settings);
  const ctrl     = new OnlineMatchController(sock, color, renderer, settings);

  // Show the game screen before attach() so clientWidth is correct when
  // the renderer sizes the canvas inside _onResize().
  activeController = ctrl;
  showGame();

  ctrl.attach(canvas, buildGameUI());
  ctrl.onNewGame(() => {
    if (activeController) activeController.detach();
    if (socket) { socket.disconnect(); socket = null; }
    // Reset lobby UI
    document.getElementById('room-code-box').style.display = 'none';
    document.getElementById('room-code-box').textContent   = '——';
    document.getElementById('create-status').textContent   = '';
    document.getElementById('join-status').textContent     = '';
    document.getElementById('join-code-input').value       = '';
    document.getElementById('create-confirm-btn').disabled = false;
    document.getElementById('join-confirm-btn').disabled   = false;
    showSettings();
  });
}

// Create room
document.getElementById('create-confirm-btn').addEventListener('click', () => {
  const btn  = document.getElementById('create-confirm-btn');
  const sock = getSocket();
  const mode = activeOptionValue('.opt-mode', 'square');

  btn.disabled = true;
  document.getElementById('create-status').textContent = 'Creating room…';

  // Register handlers before emitting.
  sock.once('roomCreated', ({ code }) => {
    const box = document.getElementById('room-code-box');
    box.textContent   = code;
    box.style.display = 'block';
    document.getElementById('create-status').textContent = 'Waiting for opponent to join…';
  });

  sock.once('gameStart', ({ color, settings: serverSettings, mode: serverMode }) => {
    startOnlineGame(sock, color, serverSettings, serverMode);
  });

  sock.emit('createRoom', { settings: settingsToPlain(readSettings()), mode });
});

// Join room
document.getElementById('join-confirm-btn').addEventListener('click', () => {
  const btn    = document.getElementById('join-confirm-btn');
  const input  = document.getElementById('join-code-input');
  const status = document.getElementById('join-status');
  const code   = input.value.trim().toUpperCase();

  if (code.length !== 6) {
    status.textContent = 'Please enter the full 6-character code.';
    return;
  }

  const sock = getSocket();
  btn.disabled = true;
  status.textContent = 'Joining…';

  sock.once('joinError', (msg) => {
    status.textContent = msg;
    btn.disabled = false;
  });

  sock.once('gameStart', ({ color, settings: serverSettings, mode: serverMode }) => {
    startOnlineGame(sock, color, serverSettings, serverMode);
  });

  sock.emit('joinRoom', { code });
});
