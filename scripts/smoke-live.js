import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { setTimeout as delay } from 'node:timers/promises';

const base = new URL(process.env.BASE_URL);
assert.ok(['https:', 'http:'].includes(base.protocol));
const expectedVersion = process.env.EXPECTED_VERSION;
const origin = 'https://ignasz.uk';
async function request(path, body) {
  return fetch(new URL(path, base), {
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60000),
  });
}
let healthy = false;
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    const response = await request('/');
    const health = await response.json();
    assert.equal(response.status, 200);
    assert.equal(health.status, 'ok');
    assert.match(health.node, /^v24\./);
    if (expectedVersion) assert.equal(health.version, expectedVersion);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    console.log(`Health OK: ${health.node}, version ${health.version}`);
    healthy = true;
    break;
  } catch (error) {
    if (attempt === 11) throw error;
    await delay(5000);
  }
}
assert.ok(healthy);
const preflight = await fetch(new URL('/generate-poem', base), {
  method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type' }, signal: AbortSignal.timeout(30000),
});
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
const invalid = await request('/api/generatePhrases', { poemSoFar: 'not-an-array', lineNumber: 1 });
assert.equal(invalid.status, 400);
assert.equal((await request('/')).status, 200);
console.log('CORS and malformed-input regression OK');

if (process.env.RUN_AI === '1') {
  const response = await request('/generate-poem', { input: 'A quiet sunrise over Scottish hills' });
  assert.equal(response.status, 200, 'Live poem request failed');
  const { poem, encryptedWordIndices } = await response.json();
  assert.ok(typeof poem === 'string' && poem.trim().length > 0);
  const tokens = poem.match(/[\w'']+|[.,!?;"]/g) || [];
  assert.ok(Array.isArray(encryptedWordIndices));
  for (const index of encryptedWordIndices) {
    assert.ok(Number.isInteger(index) && index >= 0 && index < tokens.length);
  }
  const phrasesResponse = await request('/api/generatePhrases', { poemSoFar: ['The morning gathers over hills'], lineNumber: 2 });
  assert.equal(phrasesResponse.status, 200, 'Live phrase request failed');
  const { phrases } = await phrasesResponse.json();
  assert.equal(phrases.length, 3);
  assert.ok(phrases.every(line => typeof line === 'string' && line.trim()));
  console.log('Both live AI features OK');
}

function waitFor(socket, name, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Socket timeout: ${name}`)); }, 30000);
    function cleanup() { clearTimeout(timer); socket.off(name, listener); socket.off('connect_error', failed); }
    function listener(data) { if (predicate(data)) { cleanup(); resolve(data); } }
    function failed(error) { cleanup(); reject(error); }
    socket.on(name, listener);
    socket.on('connect_error', failed);
  });
}

async function multiplayer(mode) {
  const clients = [];
  try {
    for (let i = 0; i < 2; i++) {
      const socket = io(base.origin, { transports: ['polling'], upgrade: false,
        forceNew: true, reconnection: false, autoConnect: false,
        timeout: 30000, extraHeaders: { Origin: origin } });
      clients.push(socket);
      const connected = waitFor(socket, 'connect');
      socket.connect();
      await connected;
    }
    const [red, blue] = clients;
    let pending = waitFor(red, 'roomCreated');
    red.emit('createRoom', { mode, settings: { boardWidth: 12, boardHeight: 8,
      initialPlacementCount: 4, simulationBlockSize: 2, simulationStepMs: 200 } });
    const { code } = await pending;
    const redStart = waitFor(red, 'gameStart');
    const blueStart = waitFor(blue, 'gameStart');
    blue.emit('joinRoom', { code });
    const [r, b] = await Promise.all([redStart, blueStart]);
    assert.equal(r.color, 'red'); assert.equal(b.color, 'blue');
    const redDraft = [{row: 2, col: 1}, {row: 2, col: 2}, {row: 3, col: 1}, {row: 3, col: 2}];
    pending = waitFor(blue, 'stateUpdate', state => state.players.red.draft.length === 4);
    red.emit('updateDraft', redDraft); await pending;
    pending = waitFor(red, 'stateUpdate', state => state.players.blue.draft.length === 4);
    blue.emit('updateDraft', redDraft.map(p => ({ row: p.row, col: p.col + 7 }))); await pending;
    const redTick = waitFor(red, 'stateUpdate', state => state.totalGenerations === 1);
    const blueTick = waitFor(blue, 'stateUpdate', state => state.totalGenerations === 1);
    red.emit('setReady'); blue.emit('setReady');
    const [redState, blueState] = await Promise.all([redTick, blueTick]);
    assert.deepEqual(redState, blueState);
    pending = waitFor(blue, 'opponentLeft'); red.disconnect(); await pending;
    console.log(`Multiplayer ${mode} over polling OK`);
  } finally { for (const socket of clients) socket.disconnect(); }
}
await multiplayer('square');
await multiplayer('hex');
console.log('Live smoke checks passed');
