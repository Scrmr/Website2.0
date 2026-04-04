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

// ── Screens ───────────────────────────────────────────────────────────────────

const settingsScreen = document.getElementById('settings-screen');
const gameScreen     = document.getElementById('game-screen');

function showSettings() {
  gameScreen.style.display     = 'none';
  settingsScreen.style.display = 'block';
}

function showGame() {
  settingsScreen.style.display = 'none';
  gameScreen.style.display     = 'block';
}

// ── Settings reading ──────────────────────────────────────────────────────────

const GRID_PRESETS = {
  small:  { boardWidth: 30, boardHeight: 18 },
  medium: { boardWidth: 40, boardHeight: 24 },
  large:  { boardWidth: 56, boardHeight: 32 },
};

const SPEED_PRESETS = {
  slow:   280,
  normal: 140,
  fast:   60,
  blitz:  25,
};

function readSettings() {
  const grid  = GRID_PRESETS[document.querySelector('.opt-grid.active')?.dataset.val  ?? 'medium'];
  const speed = SPEED_PRESETS[document.querySelector('.opt-speed.active')?.dataset.val ?? 'normal'];
  const gens  = parseInt(document.querySelector('.opt-gens.active')?.dataset.val ?? '250', 10);
  const timer = parseInt(document.querySelector('.opt-timer.active')?.dataset.val ?? '0',  10);

  const setupCells = clamp(parseInt(document.getElementById('s-setup').value,  10), 1, 30);
  const reinMin    = clamp(parseInt(document.getElementById('s-rmin').value,   10), 1, 20);
  const reinMax    = clamp(parseInt(document.getElementById('s-rmax').value,   10), reinMin, 40);

  return new GameSettings({
    ...grid,
    initialPlacementCount:           setupCells,
    reinforcementMinPlacementCount:  reinMin,
    reinforcementMaxPlacementCount:  reinMax,
    simulationStepMs:                speed,
    maxGenerations:                  gens,
    placementTimerSeconds:           timer,
  });
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ── Toggle-button groups ──────────────────────────────────────────────────────

function setupToggleGroup(selector) {
  document.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(selector).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

setupToggleGroup('.opt-mode');
setupToggleGroup('.opt-grid');
setupToggleGroup('.opt-speed');
setupToggleGroup('.opt-gens');
setupToggleGroup('.opt-timer');

// ── Game lifecycle ────────────────────────────────────────────────────────────

let activeController = null;

function startGame(settings, mode = 'square') {
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
  const ctrl     = new LocalMatchController(coord, renderer, settings);

  ctrl.attach(canvas, {
    genCounter:  document.getElementById('gen-counter'),
    phaseLabel:  document.getElementById('phase-label'),
    timer:       document.getElementById('timer'),
    domRed:      document.getElementById('dom-red'),
    domBlue:     document.getElementById('dom-blue'),
    domRedPct:   document.getElementById('dom-red-pct'),
    domBluePct:  document.getElementById('dom-blue-pct'),
    redCells:    document.getElementById('red-cells'),
    redPlaced:   document.getElementById('red-placed'),
    redBank:     document.getElementById('red-bank'),
    redCatchup:  document.getElementById('red-catchup'),
    redReady:    document.getElementById('red-ready'),
    redError:    document.getElementById('red-error'),
    redPatterns: document.getElementById('red-patterns'),
    redSpark:    document.getElementById('red-spark'),
    blueCells:   document.getElementById('blue-cells'),
    bluePlaced:  document.getElementById('blue-placed'),
    blueBank:    document.getElementById('blue-bank'),
    blueCatchup: document.getElementById('blue-catchup'),
    blueReady:   document.getElementById('blue-ready'),
    blueError:   document.getElementById('blue-error'),
    bluePatterns:document.getElementById('blue-patterns'),
    blueSpark:   document.getElementById('blue-spark'),
    newGame:     document.getElementById('new-game'),
  });

  ctrl.onNewGame(() => {
    if (activeController) activeController.detach();
    showSettings();
  });

  activeController = ctrl;
}

// ── Start button ──────────────────────────────────────────────────────────────

document.getElementById('start-btn').addEventListener('click', () => {
  const mode = document.querySelector('.opt-mode.active')?.dataset.val ?? 'square';
  showGame();
  startGame(readSettings(), mode);
});
