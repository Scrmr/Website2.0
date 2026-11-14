import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { io } from 'socket.io-client';

// The real SDK sends requests to a local fake upstream: no API key, cost or
// production traffic. Do not replace this URL with a live OpenAI endpoint.
const poem = 'Silver rivers carry dreams,\nGolden mornings gather light.';
let upstream;
let child;
let baseURL;
let logs = '';
let requests = [];
let reply = { status: 200, content: poem };
let automaticReply = false;

before(async () => {
  upstream = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    requests.push({ path: req.url, body: payload });
    const response = automaticReply ? { status: 200, content: payload.response_format
      ? JSON.stringify({ phrases: ['A quiet river wakes', 'The morning finds its voice', 'Beyond the stars we wander'] })
      : poem } : reply;
    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response.status === 200
      ? { choices: [{ message: { content: response.content } }] }
      : { error: { message: 'Mock upstream rejected request', type: 'invalid_request_error' } }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  // Use a deliberately minimal environment: never inherit local API credentials
  // or Node preload options. A nonexistent dotenv path prevents reading .env.
  child = spawn(process.execPath, ['--trace-deprecation', 'server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      PORT: '0',
      DOTENV_CONFIG_PATH: '/__node24_tests_no_env__',
      OPENAI_API_KEY: 'test-key-not-real',
      OPENAI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', chunk => { logs += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Startup timeout: ${logs}`)), 10000);
    child.once('error', err => { clearTimeout(timer); reject(err); });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${logs}`));
    });
    child.stdout.on('data', chunk => {
      logs += chunk;
      const match = logs.match(/Server listening on port (\d+)/);
      if (match) {
        baseURL = `http://127.0.0.1:${match[1]}`;
        clearTimeout(timer);
        resolve();
      }
    });
  });
});

after(async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const stopped = once(child, 'exit');
    child.kill();
    await stopped;
  }
  if (upstream) await new Promise(resolve => upstream.close(resolve));
  if (/DeprecationWarning/.test(logs)) console.error(logs);
});

async function post(path, body) {
  const response = await fetch(`${baseURL}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
}

test('deployment smoke script validates the server against a local AI upstream', async () => {
  automaticReply = true;
  try {
    const { stdout } = await promisify(execFile)(process.execPath, ['scripts/smoke-live.js'], {
      env: { BASE_URL: baseURL, EXPECTED_VERSION: 'local', RUN_AI: '1' }, timeout: 20000,
    });
    assert.match(stdout, /Both live AI features OK/);
    assert.match(stdout, /Multiplayer hex over polling OK/);
    assert.match(stdout, /Live smoke checks passed/);
  } finally { automaticReply = false; }
});

function event(socket, name, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error(`Timed out waiting for ${name}`));
    }, 5000);
    function listener(data) {
      if (!predicate(data)) return;
      clearTimeout(timer);
      socket.off(name, listener);
      resolve(data);
    }
    socket.on(name, listener);
  });
}

async function connect(t, transport) {
  const socket = io(baseURL, {
    transports: [transport], reconnection: false, forceNew: true, autoConnect: false,
    extraHeaders: { Origin: 'https://ignasz.uk' },
  });
  t.after(() => socket.disconnect());
  const connected = event(socket, 'connect');
  socket.connect();
  await connected;
  return socket;
}

test('backend health and allowed-origin CORS preflight', async () => {
  const health = await fetch(baseURL);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  const preflight = await fetch(`${baseURL}/generate-poem`, {
    method: 'OPTIONS', headers: {
      Origin: 'https://ignasz.uk',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://ignasz.uk');
  const blocked = await fetch(baseURL, { headers: { Origin: 'https://untrusted.invalid' } });
  assert.equal(blocked.headers.get('access-control-allow-origin'), null);
});

test('invalid poem input returns 400 without calling the SDK', async () => {
  const previous = requests.length;
  for (const input of [undefined, '', 42]) {
    assert.equal((await post('/generate-poem', { input })).status, 400);
  }
  assert.equal(requests.length, previous);
});

test('poem generation uses the real SDK and returns valid encrypted indices', async () => {
  reply = { status: 200, content: poem };
  const response = await post('/generate-poem', { input: 'Morning' });
  assert.equal(response.status, 200);
  assert.equal(response.body.poem, poem);
  const tokens = poem.match(/[\w'']+|[.,!?;"]/g) || [];
  const indices = response.body.encryptedWordIndices;
  assert.ok(indices.length >= 3 && indices.length <= 10);
  assert.equal(new Set(indices).size, indices.length);
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
  for (const index of indices) assert.ok(Number.isInteger(index) && tokens[index]?.length > 3);
  assert.equal(requests.at(-1).path, '/v1/chat/completions');
  assert.equal(requests.at(-1).body.model, 'gpt-4o-mini');
});

test('phrase generation covers opening and continuation requests', async () => {
  const phrases = ['A quiet river wakes', 'The morning finds its voice', 'Beyond the stars we wander'];
  reply = { status: 200, content: JSON.stringify({ phrases }) };
  for (const poemSoFar of [[], ['An earlier line']]) {
    const response = await post('/api/generatePhrases', { poemSoFar, lineNumber: 2 });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.phrases, phrases);
    assert.deepEqual(requests.at(-1).body.response_format, { type: 'json_object' });
  }
  assert.match(requests.at(-1).body.messages[1].content, /An earlier line/);
});

test('malformed phrase requests return 400 and leave the server running', async () => {
  const previous = requests.length;
  for (const body of [
    { poemSoFar: 'text-not-array', lineNumber: 1 },
    { poemSoFar: null, lineNumber: 1 },
    { poemSoFar: [null], lineNumber: 1 },
    { poemSoFar: ['x'.repeat(4001)], lineNumber: 1 },
    { poemSoFar: Array(65).fill('line'), lineNumber: 1 },
    { poemSoFar: [], lineNumber: 0 },
    { poemSoFar: [], lineNumber: '1' },
  ]) assert.equal((await post('/api/generatePhrases', body)).status, 400);
  assert.equal(requests.length, previous);
  assert.equal((await fetch(baseURL)).status, 200);
});

test('malformed AI JSON and too few phrases return controlled errors', async () => {
  for (const content of ['not JSON', '{"phrases":["Only one"]}',
    '{"phrases":["one",null,"three"]}', '{"phrases":["one"," ","three"]}']) {
    reply = { status: 200, content };
    const response = await post('/api/generatePhrases', { poemSoFar: [], lineNumber: 1 });
    assert.equal(response.status, 500);
    assert.equal(typeof response.body.error, 'string');
  }
});

test('upstream authentication failure is handled by both AI routes', async () => {
  reply = { status: 401 };
  for (const [path, body] of [
    ['/generate-poem', { input: 'Test' }],
    ['/api/generatePhrases', { poemSoFar: [], lineNumber: 1 }],
  ]) {
    const response = await post(path, body);
    assert.equal(response.status, 500);
    assert.equal(typeof response.body.error, 'string');
  }
  assert.equal((await fetch(baseURL)).status, 200);
});

for (const transport of ['polling', 'websocket']) {
  for (const mode of ['square', 'hex']) {
    test(`multiplayer ${mode} over ${transport}: join, drafts, readiness, simulation, disconnect`, async t => {
      const red = await connect(t, transport);
      const blue = await connect(t, transport);
      const outsider = await connect(t, transport);
      let pending = event(red, 'roomCreated');
      red.emit('createRoom', { mode, settings: {
        boardWidth: 12, boardHeight: 8, initialPlacementCount: 4,
        simulationBlockSize: 2, simulationStepMs: 40,
      } });
      const created = await pending;
      assert.equal(created.color, 'red');
      assert.match(created.code, /^[A-Z0-9]+$/);
      const redStart = event(red, 'gameStart');
      const blueStart = event(blue, 'gameStart');
      const initial = event(blue, 'stateUpdate');
      blue.emit('joinRoom', { code: created.code });
      assert.equal((await redStart).color, 'red');
      assert.equal((await blueStart).color, 'blue');
      assert.equal((await initial).phase, 'SetupPlacement');
      pending = event(outsider, 'joinError');
      outsider.emit('joinRoom', { code: created.code });
      assert.equal(await pending, 'Room is full.');
      pending = event(outsider, 'joinError');
      outsider.emit('joinRoom', { code: 'MISSING' });
      assert.equal(await pending, 'Room not found.');
      pending = event(red, 'validationError');
      red.emit('setReady');
      assert.match(await pending, /Place exactly/);
      const redDraft = [{row: 2, col: 1}, {row: 2, col: 2}, {row: 3, col: 1}, {row: 3, col: 2}];
      const blueDraft = redDraft.map(p => ({ row: p.row, col: p.col + 7 }));
      pending = event(blue, 'stateUpdate', s => s.players.red.draft.length === 4);
      red.emit('updateDraft', redDraft);
      assert.deepEqual((await pending).players.red.draft, redDraft);
      pending = event(red, 'stateUpdate', s => s.players.red.isReady);
      red.emit('setReady');
      await pending;
      pending = event(blue, 'stateUpdate', s => !s.players.red.isReady);
      red.emit('cancelReady');
      await pending;
      pending = event(red, 'stateUpdate', s => s.players.blue.draft.length === 4);
      blue.emit('updateDraft', blueDraft);
      await pending;
      const redTick = event(red, 'stateUpdate', s => s.totalGenerations === 1);
      const blueTick = event(blue, 'stateUpdate', s => s.totalGenerations === 1);
      red.emit('setReady');
      blue.emit('setReady');
      assert.deepEqual(await redTick, await blueTick);
      pending = event(blue, 'opponentLeft');
      red.disconnect();
      await pending;
      pending = event(outsider, 'joinError');
      outsider.emit('joinRoom', { code: created.code });
      assert.equal(await pending, 'Room not found.');
    });
  }
}
