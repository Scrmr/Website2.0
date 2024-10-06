// server.js

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = 3000;

// Enable CORS and other middleware
app.use(cors());
app.use(bodyParser.json());

// Endpoint to generate cryptic phrases
app.post('/api/generatePhrases', async (req, res) => {
    let { poemSoFar, lineNumber } = req.body;

    // Validate Request Body
    if (typeof lineNumber !== 'number' || !Array.isArray(poemSoFar)) {
        console.error('Invalid request body:', req.body);
        return res.status(400).json({ error: 'Invalid request body. "lineNumber" must be a number and "poemSoFar" must be an array of strings.' });
    }

    // Construct the messages for the AI
    let userMessage;

    if (lineNumber === 1) {
        // First line: Generate any three cryptic phrases
        userMessage = `
Generate three unique fun phrases that could serve as the opening lines of a funny deadpan poem. The phrases should be rich in imagery and fun. They should seamlessly set the tone for the poem, inviting the reader to delve deeper. Do not include quotation marks around the phrases. Present them exactly as a numbered list without any additional text:

1.
2.
3.
        `;
    } else {
        // Subsequent lines: Generate three cryptic phrases based on the poem so far
        const poemText = poemSoFar.join('\n');
        userMessage = `
Given the poem so far:

${poemText}

Generate three unique phrases that continue this poem. Each new line should offer a subversion of the expectations set by the previous line, so that the user it surprised in a fun kind of way. The phrases should be thought-provoking and encourage the reader to interpret their deeper meanings. Do not include quotation marks around the phrases. Present them exactly as a numbered list without any additional text:

1.
2.
3.
        `;
    }

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o-mini', // Using your specified model
                messages: [{ role: 'user', content: userMessage }],
                max_tokens: 150,
                temperature: 0.8, // Increased temperature for more creativity
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
            }
        );

        // Validate OpenAI Response
        if (response.data && response.data.choices && response.data.choices.length > 0) {
            const text = response.data.choices[0].message.content.trim();

            console.log('AI Response:', text);

            // Extract the phrases from the response
            const phrases = text
                .split('\n')
                .map(line => line.trim())
                .filter(line => /^\d+\.\s*(.+)$/.test(line))
                .map(line => line.replace(/^\d+\.\s*/, '').trim())
                .map(phrase => phrase.replace(/^"(.*)"$/, '$1')); // Remove leading and trailing quotes

            console.log('Extracted Phrases:', phrases);

            if (phrases.length >= 3) {
                res.json({ phrases: phrases.slice(0, 3) });
            } else {
                console.error('Failed to extract phrases:', text);
                res.status(500).json({ error: 'Failed to extract phrases from AI response.' });
            }
        } else {
            console.error('Invalid response from OpenAI API:', response.data);
            res.status(500).json({ error: 'Invalid response from AI API.' });
        }
    } catch (error) {
        if (error.response) {
            // OpenAI API returned an error
            console.error('OpenAI API Error:', error.response.status, error.response.data);
            res.status(500).json({ error: 'Error communicating with AI API.', details: error.response.data });
        } else if (error.request) {
            // No response received from OpenAI API
            console.error('No response from OpenAI API:', error.request);
            res.status(500).json({ error: 'No response from AI API.' });
        } else {
            // Other errors
            console.error('Server Error:', error.message);
            res.status(500).json({ error: 'Server encountered an error.' });
        }
    }
});

// Global Error Handler (Optional)
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err.stack);
    res.status(500).json({ error: 'Internal Server Error.' });
});

app.listen(port, () => {
    console.log(`Backend server is running on http://localhost:${port}`);
});
