// server.js

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = 3000;

// ... [CORS and other setup code remains unchanged]

app.use(bodyParser.json());

// Helper function to approximate token count
function countTokens(text) {
    // Approximate: 1 token ~ 4 characters in English
    return Math.ceil(text.length / 4);
}

app.post('/api/generateStory', async (req, res) => {
    let { storySoFar, choice } = req.body;

    // Validate Request Body
    if (typeof storySoFar !== 'string' || typeof choice !== 'string') {
        console.error('Invalid request body:', req.body);
        return res.status(400).json({ error: 'Invalid request body. "storySoFar" and "choice" must be strings.' });
    }

    // Summarize storySoFar if it exceeds a certain length
    const maxStoryTokens = 1500; // Adjust as needed
    const storyTokens = countTokens(storySoFar);

    if (storyTokens > maxStoryTokens) {
        try {
            const summaryResponse = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a helpful assistant that summarizes stories.'
                        },
                        {
                            role: 'user',
                            content: `Please provide a concise summary of the following story and suggest what should happen next in less than 500 words:

${storySoFar}`
                        }
                    ],
                    max_tokens: 1000,
                    temperature: 0.7,
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    },
                }
            );

            if (
                summaryResponse.data &&
                summaryResponse.data.choices &&
                summaryResponse.data.choices.length > 0 &&
                summaryResponse.data.choices[0].message &&
                summaryResponse.data.choices[0].message.content
            ) {
                const summary = summaryResponse.data.choices[0].message.content.trim();
                storySoFar = summary;
            } else {
                console.error('Invalid response from OpenAI API during summarization:', summaryResponse.data);
                // If summarization fails, truncate the story
                storySoFar = storySoFar.slice(-6000); // Approximate character count
            }
        } catch (error) {
            console.error('Error during story summarization:', error);
            // If summarization fails, truncate the story
            storySoFar = storySoFar.slice(-6000); // Approximate character count
        }
    }

    // Construct the messages for chat completion
    let messages = [
        {
            role: 'system',
            content: 'You are an AI storytelling assistant for an interactive narrative game.'
        }
    ];

    if (!storySoFar.trim() && !choice.trim()) {
        // Beginning of the story
        messages.push({
            role: 'user',
            content: `
Start the story in the second-person narrative:

"You are traversing a barren desert. In the heat and exhaustion, you may have begun to hallucinate. A few steps away, you notice something shiny. As you approach, you realize it is a genie's lamp. Perhaps the stories are true... Do you rub the lamp?"

Continue the story in a psychologically engaging way, focusing on ambiguity and intrigue, while making sure the story progresses the plot.

End with a 'yes' or 'no' question for the player that doesn't have an obvious 'right' choice.

Ensure the response concludes naturally without cutting off.

Please make sure your response is at least 200 words and does not exceed 500 tokens.
            `
        });
    } else {
        // Continue the story based on the player's choice
        messages.push({
            role: 'user',
            content: `
Story so far:
${storySoFar}

The player chose '${choice}'.

Based on the story so far and the player's choice, continue the story in the second-person narrative. Focus on psychological engagement, ambiguity, and intrigue, while making sure the story progresses the plot.

End with a 'yes' or 'no' question for the player that doesn't have an obvious 'right' choice.

Do not repeat the "Story so far" or previous choices in your response.

Ensure the response concludes naturally without cutting off.

Please make sure your response is at least 200 words and does not exceed 500 tokens.
            `
        });
    }

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: messages,
                max_tokens: 750, // Adjusted to ensure the total tokens stay within 4096
                temperature: 0.7,
                n: 1,
                // Remove 'stop' parameter if present
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Ensure your OpenAI API key is set in .env file
                },
            }
        );

        // Validate OpenAI Response
        if (
            response.data &&
            response.data.choices &&
            response.data.choices.length > 0 &&
            response.data.choices[0].message &&
            response.data.choices[0].message.content
        ) {
            const storySegment = response.data.choices[0].message.content.trim();
            res.json({ storySegment });
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
