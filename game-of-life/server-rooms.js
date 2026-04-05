import { GameSettings, Match, Position }          from './src/domain.js';
import {
  CompetitiveLifeRuleEngine,
  HexCompetitiveLifeRuleEngine,
  HalfBoardPlacementRegionPolicy,
  StandardPlacementValidator,
  StandardWinConditionEvaluator,
  BoardStatisticsService,
} from './src/services.js';
import { PlacementSubmissionService, MatchFlowCoordinator } from './src/application.js';

function generateCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function createRoomManager() {
  const rooms       = new Map(); // code → room
  const socketToRoom = new Map(); // socketId → { code, color }

  // ── Room creation ───────────────────────────────────────────────────────────

  function createRoom(socketId, settingsData, mode) {
    let code;
    do { code = generateCode(); } while (rooms.has(code));

    const settings    = new GameSettings(settingsData);
    const match       = new Match(settings);
    const engine      = mode === 'hex'
      ? new HexCompetitiveLifeRuleEngine()
      : new CompetitiveLifeRuleEngine();
    const region      = new HalfBoardPlacementRegionPolicy();
    const validator   = new StandardPlacementValidator();
    const winEval     = new StandardWinConditionEvaluator();
    const stats       = new BoardStatisticsService();
    const subs        = new PlacementSubmissionService();
    const coord       = new MatchFlowCoordinator(
      match, subs, validator, engine, winEval, stats, region
    );

    rooms.set(code, { code, mode, coord, players: { red: socketId, blue: null } });
    socketToRoom.set(socketId, { code, color: 'red' });
    return { code, color: 'red' };
  }

  function joinRoom(socketId, code) {
    const room = rooms.get(code);
    if (!room)             return { error: 'Room not found.' };
    if (room.players.blue) return { error: 'Room is full.' };
    room.players.blue = socketId;
    socketToRoom.set(socketId, { code, color: 'blue' });
    return { code, color: 'blue' };
  }

  function getRoom(code) { return rooms.get(code); }

  // ── Per-socket helpers ──────────────────────────────────────────────────────

  function _entry(socketId) {
    const e = socketToRoom.get(socketId);
    if (!e) return null;
    const room = rooms.get(e.code);
    if (!room) return null;
    return { room, color: e.color };
  }

  // ── Game actions ────────────────────────────────────────────────────────────

  function updateDraft(socketId, positions) {
    const e = _entry(socketId);
    if (!e) return null;
    const posObjs = positions.map(p => new Position(p.row, p.col));
    e.room.coord.updateDraft(e.color, posObjs);
    return e;
  }

  function setReady(socketId, force = false) {
    const e = _entry(socketId);
    if (!e) return null;
    const result = e.room.coord.setReady(e.color, force);
    return { ...e, result };
  }

  function cancelReady(socketId) {
    const e = _entry(socketId);
    if (!e) return null;
    e.room.coord.cancelReady(e.color);
    return e;
  }

  function placeLiveCell(socketId, row, col) {
    const e = _entry(socketId);
    if (!e) return false;
    return e.room.coord.placeLiveCell(e.color, new Position(row, col));
  }

  function disconnect(socketId) {
    const e = socketToRoom.get(socketId);
    if (!e) return null;
    socketToRoom.delete(socketId);
    const room = rooms.get(e.code);
    if (!room) return null;
    // Stop the simulation loop and clean up the other player's mapping.
    room.coord.dispose();
    const otherColor = e.color === 'red' ? 'blue' : 'red';
    const otherId    = room.players[otherColor];
    if (otherId) socketToRoom.delete(otherId);
    rooms.delete(e.code);
    return { room, disconnectedColor: e.color };
  }

  // ── State serialisation ─────────────────────────────────────────────────────

  function getState(room) {
    const { coord } = room;
    const match     = coord.match;
    const board     = match.board;

    return {
      phase:            match.phase,
      totalGenerations: match.totalGenerations,
      roundNumber:      match.roundNumber,
      result:           match.result,
      settings:         { ...match.settings },
      board: {
        width:  board.width,
        height: board.height,
        cells:  board._cells,
        ages:   board._ages,
      },
      players: {
        red: {
          isReady:      coord.isReady('red'),
          draft:        coord.getDraft('red').map(p => ({ row: p.row, col: p.col })),
          bank:         coord.getBank('red'),
          catchupBonus: coord.getCatchupBonus('red'),
          history:      coord.getHistory('red'),
        },
        blue: {
          isReady:      coord.isReady('blue'),
          draft:        coord.getDraft('blue').map(p => ({ row: p.row, col: p.col })),
          bank:         coord.getBank('blue'),
          catchupBonus: coord.getCatchupBonus('blue'),
          history:      coord.getHistory('blue'),
        },
      },
    };
  }

  return { createRoom, joinRoom, getRoom, updateDraft, setReady, cancelReady, placeLiveCell, disconnect, getState };
}
