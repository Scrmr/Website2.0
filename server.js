import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import OpenAI from 'openai';
import { createRoomManager } from './game-of-life/server-rooms.js';

const app        = express();
const httpServer = createServer(app);

const ALLOWED_ORIGINS = [
  'https://ignasz.uk',
  'https://poemgenerator-492211.appspot.com',
  'http://localhost:8080',
  'http://127.0.0.1:5500',
];

const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Poem tokeniser (mirrors frontend so indices line up) ──────────────────────

function tokenise(poem) {
  return poem.match(/[\w'']+|[.,!?;"]/g) || [];
}

function pickEncryptedIndices(tokens) {
  const candidates = [];
  tokens.forEach((token, i) => {
    if (/^[\w'']+$/.test(token) && token.length > 3) candidates.push(i);
  });
  const shuffled = candidates.sort(() => Math.random() - 0.5);
  const count    = Math.min(Math.max(Math.floor(candidates.length * 0.25), 3), 10);
  return shuffled.slice(0, count).sort((a, b) => a - b);
}

// ── HTTP routes ───────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'cypherpoem server is running' });
});

app.post('/generate-poem', async (req, res) => {
  const { input } = req.body;
  if (!input || typeof input !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid input.' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a poet. Write a short poem (4–8 lines) based on the theme given by the user. ' +
            'Return only the poem text — no title, no quotation marks, no extra commentary.',
        },
        { role: 'user', content: input },
      ],
      temperature: 0.9,
    });

    const poem                = completion.choices[0].message.content.trim();
    const tokens              = tokenise(poem);
    const encryptedWordIndices = pickEncryptedIndices(tokens);

    res.json({ poem, encryptedWordIndices });
  } catch (err) {
    console.error('OpenAI error:', err.message);
    res.status(500).json({ error: 'Failed to generate poem.' });
  }
});

app.post('/api/generatePhrases', async (req, res) => {
  const { poemSoFar, lineNumber } = req.body;

  const context = poemSoFar && poemSoFar.length > 0
    ? `The poem so far:\n${poemSoFar.join('\n')}\n\nNow generate options for line ${lineNumber}.`
    : 'Generate options for the opening line of a poem.';

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a poet. Given a poem in progress, generate exactly 3 distinct short lines (5–10 words each) ' +
            'that could naturally continue it. Each line should have a different tone or direction. ' +
            'Return ONLY a JSON object in this exact format: { "phrases": ["line one", "line two", "line three"] }',
        },
        { role: 'user', content: context },
      ],
      temperature: 0.9,
      response_format: { type: 'json_object' },
    });

    const parsed  = JSON.parse(completion.choices[0].message.content);
    const phrases = parsed.phrases;

    if (!Array.isArray(phrases) || phrases.length < 3) {
      return res.status(500).json({ error: 'Unexpected response format from AI.' });
    }

    res.json({ phrases: phrases.slice(0, 3) });
  } catch (err) {
    console.error('OpenAI error:', err.message);
    res.status(500).json({ error: 'Failed to generate phrases.' });
  }
});

// ── Socket.io — Game of Life rooms ────────────────────────────────────────────

const rooms = createRoomManager();

io.on('connection', (socket) => {

  socket.on('createRoom', ({ settings, mode }) => {
    const { code, color } = rooms.createRoom(socket.id, settings, mode);
    socket.join(code);
    socket.emit('roomCreated', { code, color });
  });

  socket.on('joinRoom', ({ code }) => {
    const result = rooms.joinRoom(socket.id, code);
    if (result.error) { socket.emit('joinError', result.error); return; }

    socket.join(result.code);
    const room = rooms.getRoom(result.code);

    // Wire the coordinator's update hook to broadcast state to both players.
    room.coord.onUpdate(() => {
      io.to(result.code).emit('stateUpdate', rooms.getState(room));
    });

    // Tell each player their assigned colour and the authoritative settings.
    const payload = { settings: { ...room.coord.match.settings }, mode: room.mode };
    io.to(room.players.red).emit('gameStart', { ...payload, color: 'red' });
    socket.emit('gameStart', { ...payload, color: 'blue' });

    // Send the initial board state.
    io.to(result.code).emit('stateUpdate', rooms.getState(room));
  });

  socket.on('updateDraft', (positions) => {
    // onUpdate fires inside updateDraft, broadcasting stateUpdate automatically.
    rooms.updateDraft(socket.id, positions);
  });

  socket.on('setReady', ({ force } = {}) => {
    const result = rooms.setReady(socket.id, force ?? false);
    if (!result) return;
    if (!result.result.success) {
      socket.emit('validationError', result.result.errors.join('\n'));
    }
    // stateUpdate emitted via onUpdate inside coord.setReady.
  });

  socket.on('cancelReady', () => {
    // onUpdate fires inside cancelReady.
    rooms.cancelReady(socket.id);
  });

  socket.on('disconnect', () => {
    const result = rooms.disconnect(socket.id);
    if (!result) return;
    const otherColor    = result.disconnectedColor === 'red' ? 'blue' : 'red';
    const otherSocketId = result.room.players[otherColor];
    if (otherSocketId) io.to(otherSocketId).emit('opponentLeft');
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
