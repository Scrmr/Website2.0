// game.js

const playerChoices = [];
const results = [];
let round = 0;
const maxRounds = 50;

const sequenceLength = 5; // Markov-5 chain
const sequenceCounts = {};

// Variable to store the accumulated story
let storySoFar = '';

// Add event listeners for buttons
document.getElementById('choice-yes').addEventListener('click', async () => await handlePlayerChoice('yes'));
document.getElementById('choice-no').addEventListener('click', async () => await handlePlayerChoice('no'));

// Add event listener for keyboard input
document.addEventListener('keydown', handleKeyPress);

// Add event listener for restart button
const restartButton = document.getElementById('restart-button');
restartButton.addEventListener('click', restartGame);

// Initialize the game by fetching the first story segment
initializeGame();

function handleKeyPress(event) {
    if (event.key.toLowerCase() === 'y') {
        handlePlayerChoice('yes');
    } else if (event.key.toLowerCase() === 'n') {
        handlePlayerChoice('no');
    }
}

async function initializeGame() {
    // Reset variables
    storySoFar = '';
    playerChoices.length = 0;
    results.length = 0;
    round = 0;
    Object.keys(sequenceCounts).forEach(key => delete sequenceCounts[key]);

    // Clear UI elements
    document.getElementById('story').innerText = ''; // Clear the story div
    document.getElementById('feedback').innerText = 'Make your choice to see the results...';
    document.getElementById('dark-self-response').innerText = 'Dark Self: ???';
    updateRoundCounter();

    // Enable choice buttons
    document.getElementById('choice-yes').disabled = false;
    document.getElementById('choice-no').disabled = false;
    restartButton.style.display = 'none';

    // Clear the decision graph
    const decisionGraph = document.getElementById('decision-graph');
    decisionGraph.innerHTML = '';

    // Fetch the initial story segment from the AI
    const storySegment = await fetchStorySegment('', '');
    if (storySegment) {
        storySoFar += storySegment; // Keep full story for AI context
        document.getElementById('story').innerText = storySegment; // Display only the current segment
    } else {
        document.getElementById('story').innerText = 'Failed to load the story. Please try restarting the game.';
    }
}

async function handlePlayerChoice(choice) {
    if (round >= maxRounds) return;

    // Get Dark Self's choice before adding the current player's choice
    const darkChoice = darkSelfChoice(playerChoices);

    // Determine if the guess was correct
    const isCorrectGuess = choice === darkChoice;

    // Display the results
    displayChoiceResults(choice, darkChoice);

    // Update the decision graph
    updateDecisionGraph(isCorrectGuess);

    // Now, push the player's choice to playerChoices
    playerChoices.push(choice);

    // Update sequence counts with the new data
    updateSequenceCounts(playerChoices);

    // Update results
    results.push(isCorrectGuess ? 'Correct Guess' : 'Incorrect Guess');

    // Increment round after processing the current round
    round++;

    // Update the round counter and success rate
    updateRoundCounter();

    // Truncate the story to manage prompt length
    const truncatedStory = truncateStory(storySoFar, 750); // Adjust max words as needed

    // Disable choice buttons while fetching
    document.getElementById('choice-yes').disabled = true;
    document.getElementById('choice-no').disabled = true;

    // Fetch and display the story segment
    const storySegment = await fetchStorySegment(truncatedStory, choice);
    if (storySegment) {
        storySoFar += '\n\n' + storySegment; // Update full story for AI context
        document.getElementById('story').innerText = storySegment; // Display only the current segment
    } else {
        document.getElementById('story').innerText = '[Failed to load the next part of the story.]';
    }

    // Re-enable choice buttons
    document.getElementById('choice-yes').disabled = false;
    document.getElementById('choice-no').disabled = false;

    // Check for game-ending conditions
    if ((round >= 7 && calculateSuccessRate() >= 0.7) || round >= maxRounds) {
        endGame();
        return;
    }

    // No need to update the question, as the AI provides it in the story segment
}

function displayChoiceResults(playerChoice, darkChoice) {
    document.getElementById('dark-self-response').innerText = `Dark Self: ${darkChoice}`;
    const feedback = playerChoice === darkChoice
        ? 'Dark Self guessed correctly!'
        : 'Dark Self guessed incorrectly.';
    document.getElementById('feedback').innerText = feedback;
}

function updateDecisionGraph(isCorrectGuess) {
    const decisionGraph = document.getElementById('decision-graph');
    const node = document.createElement('div');
    node.classList.add('decision-node');
    node.classList.add(isCorrectGuess ? 'correct-guess' : 'incorrect-guess');
    decisionGraph.appendChild(node);
}

function updateRoundCounter() {
    const successRate = calculateSuccessRate();
    const successRatePercentage = (successRate * 100).toFixed(2);
    document.getElementById('round-counter').innerText =
        `Round: ${round} / ${maxRounds} | Dark Self Success Rate: ${successRatePercentage}%`;

    // Update the dynamic image based on the success rate percentage
    updateImage(successRate);

    // Calculate hue based on success rate
    // 0% success -> green (120deg), 70% success -> red (0deg)
    let rate = successRate * 100; // Convert to percentage
    if (rate > 70) rate = 70; // Cap at 70%
    if (rate < 0) rate = 0; // Minimum at 0%
    const hue = 120 * (1 - rate / 70); // Map 0-70% to 120-0 degrees

    // Set the background color of the body using HSL
    document.body.style.backgroundColor = `hsl(${hue}, 100%, 22%)`;
}

function calculateSuccessRate() {
    if (round === 0) return 0;
    const correctGuesses = results.filter(result => result === 'Correct Guess').length;
    return correctGuesses / round;
}

function endGame() {
    const successRate = calculateSuccessRate();
    const successRatePercentage = (successRate * 100).toFixed(2);
    const feedback = successRate >= 0.7
        ? `Game Over! The Dark Self guessed correctly more than 70% of the time!\nFinal success rate: ${successRatePercentage}%`
        : `Game Over! You survived ${round} rounds without being fully predicted!\nFinal success rate: ${successRatePercentage}%`;
    document.getElementById('feedback').innerText = feedback;
    document.getElementById('choice-yes').disabled = true;
    document.getElementById('choice-no').disabled = true;
    restartButton.style.display = 'inline-block';
}

function restartGame() {
    initializeGame();
}

function darkSelfChoice(playerChoices) {
    if (playerChoices.length < sequenceLength) {
        // Not enough data, make a random guess
        return Math.random() < 0.5 ? 'yes' : 'no';
    }

    const lastSequence = playerChoices.slice(-sequenceLength).join('');

    if (sequenceCounts[lastSequence]) {
        // Predict the most frequent next choice after this sequence
        const counts = sequenceCounts[lastSequence];
        return counts.yes >= counts.no ? 'yes' : 'no';
    } else {
        // If sequence not seen before, make a random guess
        return Math.random() < 0.5 ? 'yes' : 'no';
    }
}

function updateSequenceCounts(playerChoices) {
    if (playerChoices.length <= sequenceLength) return;

    const sequence = playerChoices.slice(-sequenceLength - 1, -1).join('');
    const nextChoice = playerChoices[playerChoices.length - 1];

    if (!sequenceCounts[sequence]) {
        sequenceCounts[sequence] = { yes: 0, no: 0 };
    }
    sequenceCounts[sequence][nextChoice]++;
}

async function fetchStorySegment(storySoFar, choice) {
    try {
        const response = await fetch('http://localhost:3000/api/generateStory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storySoFar, choice }),
        });

        if (!response.ok) {
            console.error(`Error fetching story segment: ${response.statusText}`);
            return '';
        }

        const data = await response.json();
        return data.storySegment || '';
    } catch (error) {
        console.error('Error fetching story segment:', error);
        return '';
    }
}

function truncateStory(story, maxWords) {
    const words = story.split(' ');
    if (words.length > maxWords) {
        return words.slice(words.length - maxWords).join(' ');
    }
    return story;
}

function updateImage(percentage) {
    const image = document.getElementById('dynamic-image');

    const successRatePercentage = percentage * 100;

    if (successRatePercentage >= 60 && successRatePercentage <= 70) {
        image.src = 'images/demon.png'; // Image path for the demon
        image.alt = 'demon';
    } else if (successRatePercentage >= 0 && successRatePercentage <= 40) {
        image.src = 'images/angel.png'; // Image path for the angel
        image.alt = 'angel';
    } else if (successRatePercentage >= 41 && successRatePercentage <= 59) {
        image.src = 'images/neutral.png'; // Image path for neutral
        image.alt = 'neutral';
    } else {
        image.src = 'images/neutral.png'; // Default to neutral if out of range
        image.alt = 'neutral';
    }
}
