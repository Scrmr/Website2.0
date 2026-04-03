require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();

app.use(cors({
  origin: ['https://ignasz.uk', 'https://poemgenerator-492211.appspot.com', 'http://localhost:8080', 'http://127.0.0.1:5500', null],
}));
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Mirrors the tokenisation used in the frontend so indices line up correctly.
function tokenise(poem) {
  return poem.match(/[\w'']+|[.,!?;"]/g) || [];
}

function pickEncryptedIndices(tokens) {
  const candidates = [];
  tokens.forEach((token, i) => {
    if (/^[\w'']+$/.test(token) && token.length > 3) {
      candidates.push(i);
    }
  });

  // Shuffle candidates and take roughly 25%, minimum 3, maximum 10.
  const shuffled = candidates.sort(() => Math.random() - 0.5);
  const count = Math.min(Math.max(Math.floor(candidates.length * 0.25), 3), 10);
  return shuffled.slice(0, count).sort((a, b) => a - b);
}

app.get('/', (req, res) => {
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

    const poem = completion.choices[0].message.content.trim();
    const tokens = tokenise(poem);
    const encryptedWordIndices = pickEncryptedIndices(tokens);

    res.json({ poem, encryptedWordIndices });
  } catch (err) {
    console.error('OpenAI error:', err.message);
    res.status(500).json({ error: 'Failed to generate poem.' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
