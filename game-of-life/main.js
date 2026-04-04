import { GameSettings, Match }                               from './src/domain.js';
import {
  CompetitiveLifeRuleEngine,
  HalfBoardPlacementRegionPolicy,
  StandardPlacementValidator,
  StandardWinConditionEvaluator,
  BoardStatisticsService,
} from './src/services.js';
import { PlacementSubmissionService, MatchFlowCoordinator } from './src/application.js';
import { GameRenderer }                                     from './src/renderer.js';
import { LocalMatchController }                             from './src/controller.js';

let activeController = null;

function startGame() {
  // Cleanly tear down any running game before starting a new one
  if (activeController) activeController.detach();

  const settings = new GameSettings();
  const match    = new Match(settings);

  // Domain services
  const engine       = new CompetitiveLifeRuleEngine();
  const region       = new HalfBoardPlacementRegionPolicy();
  const validator    = new StandardPlacementValidator();
  const winEval      = new StandardWinConditionEvaluator();
  const statsService = new BoardStatisticsService();

  // Application layer
  const subs  = new PlacementSubmissionService();
  const coord = new MatchFlowCoordinator(
    match, subs, validator, engine, winEval, statsService, region
  );

  // Presentation layer
  const canvas   = document.getElementById('game-canvas');
  const renderer = new GameRenderer(canvas, settings);
  const ctrl     = new LocalMatchController(coord, renderer, settings);

  ctrl.attach(canvas, {
    genCounter: document.getElementById('gen-counter'),
    phaseLabel: document.getElementById('phase-label'),
    redCells:   document.getElementById('red-cells'),
    redPlaced:  document.getElementById('red-placed'),
    redReady:   document.getElementById('red-ready'),
    redError:   document.getElementById('red-error'),
    blueCells:  document.getElementById('blue-cells'),
    bluePlaced: document.getElementById('blue-placed'),
    blueReady:  document.getElementById('blue-ready'),
    blueError:  document.getElementById('blue-error'),
    newGame:    document.getElementById('new-game'),
  });

  ctrl.onNewGame(startGame);
  activeController = ctrl;
}

startGame();
