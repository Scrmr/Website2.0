// game.js

const playerChoices = [];
const results = [];
let round = 0;
const maxRounds = 8;

const sequenceLength = 3; // Adjusted for four choices (now including user's own input)
const sequenceCounts = {};

let poemLines = []; // Stores the selected phrases to form the poem

// Add event listener for restart button
const restartButton = document.getElementById('restart-button');
restartButton.addEventListener('click', restartGame);

// Music Control
const backgroundMusic = document.getElementById('background-music');
const musicControlButton = document.getElementById('music-control');

musicControlButton.addEventListener('click', function () {
    if (backgroundMusic.paused) {
        backgroundMusic.play();
        musicControlButton.innerText = 'Mute Music';
    } else {
        backgroundMusic.pause();
        musicControlButton.innerText = 'Play Music';
    }
});

// Set initial volume (optional)
backgroundMusic.volume = 0.5; // Adjust volume level between 0.0 and 1.0

// Initialize the game
initializeGame();

async function initializeGame() {
    // Reset variables
    poemLines = [];
    playerChoices.length = 0;
    results.length = 0;
    round = 0;
    Object.keys(sequenceCounts).forEach(key => delete sequenceCounts[key]);

    // Clear UI elements
    document.getElementById('poem').innerText = ''; // Clear the poem display
    document.getElementById('feedback').innerText = 'Select a phrase to begin your poem...';
    document.getElementById('dark-self-response').innerText = 'Dark Self: ???';
    updateRoundCounter();

    // Show user input container
    document.getElementById('user-input-container').style.display = 'block';

    // Fetch and display the first set of phrases
    await fetchAndDisplayPhrases([], 1); // Start with an empty poem
}

// Add event listener for user phrase submission
document.getElementById('submit-user-phrase').addEventListener('click', handleUserPhraseSubmission);

async function fetchAndDisplayPhrases(poemSoFar, lineNumber) {
    try {
        const response = await fetch('http://localhost:3000/api/generatePhrases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poemSoFar, lineNumber }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error(`Error fetching phrases: ${errorData.error}`, errorData.details);
            document.getElementById('feedback').innerText = 'Failed to load phrases. Please try again.';
            return;
        }

        const data = await response.json();
        displayPhraseOptions(data.phrases);
    } catch (error) {
        console.error('Error fetching phrases:', error);
        document.getElementById('feedback').innerText = 'An error occurred. Please try again.';
    }
}

function displayPhraseOptions(phrases) {
    const choicesContainer = document.getElementById('choices');
    choicesContainer.innerHTML = ''; // Clear previous choices

    if (!phrases || phrases.length < 3) {
        document.getElementById('feedback').innerText = 'Failed to load phrases. Please try again.';
        return;
    }

    // Get Dark Self's prediction before displaying options
    const darkChoiceIndex = darkSelfChoice(playerChoices);

    // Display phrases as buttons
    phrases.forEach((phrase, index) => {
        const button = document.createElement('button');
        button.innerText = phrase;
        button.classList.add('phrase-button');
        button.addEventListener('click', () => handlePlayerChoice(phrase, index, darkChoiceIndex));
        choicesContainer.appendChild(button);
    });

    // Show user input container
    document.getElementById('user-input-container').style.display = 'block';
}

function handleUserPhraseSubmission() {
    const userPhraseInput = document.getElementById('user-phrase-input');
    const userPhrase = userPhraseInput.value.trim();
    if (userPhrase === '') {
        alert('Please enter a phrase.');
        return;
    }

    // Hide user input container
    document.getElementById('user-input-container').style.display = 'none';

    // Handle the player's own phrase
    handlePlayerChoice(userPhrase, 3, darkSelfChoice(playerChoices)); // Index 3 represents user's own phrase

    // Clear the input field
    userPhraseInput.value = '';
}

function handlePlayerChoice(selectedPhrase, playerChoiceIndex, darkChoiceIndex) {
    if (round >= maxRounds) return;

    // Hide choices and user input
    document.getElementById('choices').innerHTML = '';
    document.getElementById('user-input-container').style.display = 'none';

    // Add the selected phrase to the poem
    poemLines.push(selectedPhrase);
    updatePoemDisplay();

    // Determine if the guess was correct
    const isCorrectGuess = playerChoiceIndex === darkChoiceIndex;

    // Display the results
    displayChoiceResults(isCorrectGuess);

    // Update the decision graph
    updateDecisionGraph(isCorrectGuess);

    // Push the player's choice index to playerChoices
    playerChoices.push(playerChoiceIndex);

    // Update sequence counts with the new data
    updateSequenceCounts(playerChoices);

    // Update results
    results.push(isCorrectGuess ? 'Correct Guess' : 'Incorrect Guess');

    // Increment round
    round++;

    // Update the round counter and success rate
    updateRoundCounter();

    // Check for game-ending condition
    if (round >= maxRounds) {
        endGame();
        return;
    }

    // Fetch and display the next set of phrases
    fetchAndDisplayPhrases(poemLines, round + 1);
}

function updatePoemDisplay() {
    const poemElement = document.getElementById('poem');
    poemElement.innerText = poemLines.join('\n');
}

function displayChoiceResults(isCorrectGuess) {
    document.getElementById('dark-self-response').innerText = `Dark Self ${isCorrectGuess ? 'guessed your selection correctly!' : 'failed to predict your choice.'}`;
    const feedback = isCorrectGuess
        ? 'Dark Self predicted your choice.'
        : 'Dark Self failed to predict your choice.';
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
        `Line: ${round} / ${maxRounds} | Dark Self Success Rate: ${successRatePercentage}%`;

    // Update the dynamic image based on the success rate percentage
    updateImage(successRate);

    // Update background color based on success rate
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
    const feedback = `Your poem is complete!\nFinal Dark Self success rate: ${successRatePercentage}%`;
    document.getElementById('feedback').innerText = feedback;
    document.getElementById('choices').innerHTML = ''; // Remove choice buttons
    restartButton.style.display = 'inline-block';
}

function restartGame() {
    restartButton.style.display = 'none';
    initializeGame();
}

function darkSelfChoice(playerChoices) {
    const optionsCount = 4; // Three phrases plus the user's own input
    if (playerChoices.length < sequenceLength) {
        // Not enough data, make a random guess
        return Math.floor(Math.random() * optionsCount); // Random index between 0 and 3
    }

    const lastSequence = playerChoices.slice(-sequenceLength).join('');

    if (sequenceCounts[lastSequence]) {
        // Predict the most frequent next choice after this sequence
        const counts = sequenceCounts[lastSequence];
        let maxCount = -1;
        let predictedIndex = 0;
        for (let i = 0; i < optionsCount; i++) {
            if (counts[i] > maxCount) {
                maxCount = counts[i];
                predictedIndex = i;
            }
        }
        return predictedIndex;
    } else {
        // If sequence not seen before, make a random guess
        return Math.floor(Math.random() * optionsCount);
    }
}

function updateSequenceCounts(playerChoices) {
    const optionsCount = 4; // Updated to reflect the new option
    if (playerChoices.length <= sequenceLength) return;

    const sequence = playerChoices.slice(-sequenceLength - 1, -1).join('');
    const nextChoiceIndex = playerChoices[playerChoices.length - 1];

    if (!sequenceCounts[sequence]) {
        sequenceCounts[sequence] = {};
        for (let i = 0; i < optionsCount; i++) {
            sequenceCounts[sequence][i] = 0;
        }
    }
    sequenceCounts[sequence][nextChoiceIndex]++;
}

function updateImage(percentage) {
    const image = document.getElementById('dynamic-image');

    const successRatePercentage = percentage * 100;

    if (successRatePercentage >= 60 && successRatePercentage <= 70) {
        image.src = 'images/demon.png'; // Image path for the demon
        image.alt = 'demon';
        image.style.display = 'block';
    } else if (successRatePercentage >= 0 && successRatePercentage <= 40) {
        image.src = 'images/angel.png'; // Image path for the angel
        image.alt = 'angel';
        image.style.display = 'block';
    } else if (successRatePercentage >= 41 && successRatePercentage <= 59) {
        image.src = 'images/neutral.png'; // Image path for neutral
        image.alt = 'neutral';
        image.style.display = 'block';
    } else {
        image.style.display = 'none';
    }
}
