require('dotenv').config();

const axios = require('axios');
const express = require('express');
const cors = require('cors');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const client = new SecretManagerServiceClient();
const app = express();

// CORS configuration
const corsOptions = {
  origin: 'https://ignasz.uk', // Replace with '*' to allow any domain or a specific domain to allow
  optionsSuccessStatus: 200
};

let openaiApiKey; // Variable to store the OpenAI API key

app.use(express.static(__dirname));
app.use(express.json());
app.use(cors());

// Caesar cipher function
function caesarCipher(str, shift) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  return str.split('').map(char => {
    let index = alphabet.indexOf(char);
    if(index === -1) {
      // Character not in the alphabet, leave it as is
      return char;
    }
    let newIndex = (alphabet.length / 2 + index + shift) % (alphabet.length / 2);
    return alphabet[index < alphabet.length / 2 ? newIndex : newIndex + alphabet.length / 2];
  }).join('');
}

// Function to apply Caesar cipher to every 10th word and track encrypted words
function applyCaesarCipherToPoem(poem, shift) {
  let words = poem.match(/[\w'’]+|[.,!?;"]/g) || [];
  let encryptedWordIndices = []; // This will hold the indices of encrypted words
  for (let i = 9; i < words.length; i += 10) {
    words[i] = caesarCipher(words[i], shift);
    encryptedWordIndices.push(i); // Store the index of the encrypted word
  }
  return { cipheredPoem: words.join(' '), encryptedWordIndices };
}

// Function to generate a poem with the AI
async function generatePoemWithAI(input) {
  const structuredPrompt = `Write a poem in four stanzas, each stanza consisting of four lines, it should be about ${input}. Thank you.`;
  try {
    const response = await axios.post('https://api.openai.com/v1/engines/gpt-3.5-turbo/completions', {
      prompt: structuredPrompt,
      max_tokens: 1000,
      temperature: 0.7,
    }, {
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`, // Use the API key from the Secret Manager
        'Content-Type': 'application/json',
      }
    });
    return response.data.choices[0].text;
  } catch (error) {
    console.error('Error calling OpenAI API:', error.response ? error.response.data : error.message);
    return null;
  }
}

// Endpoint to generate a poem
app.post('/generate-poem', async (req, res) => {
  const userInput = req.body.input;
  const rawPoem = await generatePoemWithAI(userInput);
  if (rawPoem) {
    const { cipheredPoem, encryptedWordIndices } = applyCaesarCipherToPoem(rawPoem, 3); // Apply the cipher to the poem
    res.json({ poem: cipheredPoem, encryptedWordIndices });
  } else {
    res.status(500).json({ error: 'Could not generate poem' });
  }
});

// Function to get the secret from the Secret Manager
async function getSecret(name) {
  const [version] = await client.accessSecretVersion({
    name: `projects/cypherpoem/secrets/${name}/versions/latest`,
  });
  return version.payload.data.toString('utf8');
}

// Function to start the server
async function startServer() {
  openaiApiKey = await getSecret('openai-api-key'); // Fetch the API key from the Secret Manager

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Start the server and handle any errors
startServer().catch(err => {
  console.error('Error starting the server:', err);
  process.exit(1);
});
