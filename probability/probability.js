
// probability.js

let userInputHistory = [];
let guessHistory = []; // Initialize the guess history array
let correctPredictions = 0;
let nGramFrequencies = {};
let correctNGramPredictions = 0;
let correctMarkovPredictions = 0;

document.addEventListener('DOMContentLoaded', (event) => {
    console.log("Probability script loaded successfully!");

    function updateNGramFrequencies(history, n) {
        // Ensure we have at least n+1 characters to form an n-gram followed by a character
        if (history.length < n + 1) return;
    
        // Get the n-gram and the character that follows it
        let nGram = history.slice(-n - 1, -1).join('');
        let nextChar = history[history.length - 1];
    
        // If this n-gram hasn't been seen before, initialize it
        if (!nGramFrequencies[nGram]) {
            nGramFrequencies[nGram] = { 'a': 0, 'd': 0 };
        }
    
        // Update the frequency for the nextChar
        nGramFrequencies[nGram][nextChar]++;
    }
    
    // Predict the next character with the Markov model
    function predictWithMarkov(history, n) {
        // Ensure we have at least n characters for an n-gram
        if (history.length < n) {
            // Not enough data to make a prediction, return a random guess
            return Math.random() < 0.5 ? 'a' : 'd';
        }
    
        // Get the most recent n-gram
        let nGram = history.slice(-n).join('');
    
        // Check if this n-gram has been seen before
        if (nGramFrequencies[nGram]) {
            // Make a weighted random choice based on the frequencies
            let choices = nGramFrequencies[nGram];
            let total = choices['a'] + choices['d'];
            let randomIndex = Math.random() * total;
            return randomIndex < choices['a'] ? 'a' : 'd';
        } else {
            // If this n-gram hasn't been seen, return a random guess
            return Math.random() < 0.5 ? 'a' : 'd';
        }
    }    

    document.getElementById('resetButton').addEventListener('click', function() {
        // Reset the button press count to 0
        document.getElementById('buttonPressCount').textContent = '0';
        
        // Clear the guess history array
        guessHistory = [];
        
        // Reset correct predictions counters
        correctPredictions = 0;
        correctNGramPredictions = 0;
        correctMarkovPredictions = 0;

        // Reset the accuracy percentages in the display
        document.getElementById('nGramAccuracy').textContent = 'N-Gram Accuracy: 0%';
        document.getElementById('markovAccuracy').textContent = 'Markov Accuracy: 0%';

        // Clear the guess history display
        document.getElementById('nGramHistory').innerHTML = '';
        document.getElementById('markovHistory').innerHTML = '';

        // Reset the userInputHistory
        userInputHistory = [];
        
        // If you have other elements that show the current prediction, reset them too
        document.getElementById('nGramGuess').textContent = 'Prediction:';
        document.getElementById('markovGuess').textContent = 'Prediction:';
    });

// Function to update the display of guess history    
function updateGuessHistoryDisplay() {
    let nGramHistoryHtml = '';
    let markovHistoryHtml = '';
    let recentGuesses = guessHistory.slice(-25);

    // Loop through the recent guesses and create the history display HTML
    recentGuesses.forEach(prediction => {
        let nGramColor = prediction.nGramCorrect ? "white" : "red";
        let markovColor = prediction.markovCorrect ? "white" : "red";

        nGramHistoryHtml = `<span style="background-color:${nGramColor};">predicted: ${prediction.nGram}, observed: ${prediction.user}</span><br>` + nGramHistoryHtml;
        markovHistoryHtml = `<span style="background-color:${markovColor};">predicted: ${prediction.markov}, observed: ${prediction.user}</span><br>` + markovHistoryHtml;
    });

    // Update the innerHTML of the history elements
    document.getElementById('nGramHistory').innerHTML = nGramHistoryHtml;
    document.getElementById('markovHistory').innerHTML = markovHistoryHtml;
}

// Function to make an n-gram prediction
function predictWithNGram(history, n) {
    // Ensure we have enough history to make a prediction
    if (history.length < n) {
        // Not enough data to make a prediction, return a random guess
        return Math.random() < 0.5 ? 'a' : 'd';
    }

    // Get the most recent 'n' inputs as the current state
    let currentState = history.slice(-n).join('');

    // Count the occurrences of 'a' and 'd' after the current state
    let followingA = history.join('').match(new RegExp(currentState + "a", "g")) || [];
    let followingD = history.join('').match(new RegExp(currentState + "d", "g")) || [];

    // Make a prediction based on the most frequent occurrence
    // Calculate total occurrences for weighting
    let totalOccurrences = followingA.length + followingD.length;

    // If no occurrences, default to random
    if (totalOccurrences === 0) {
        return Math.random() < 0.5 ? 'a' : 'd';
    }

    // Generate a random number between 0 and the total occurrences
    let randomIndex = Math.random() * totalOccurrences;

    // If the randomIndex falls in the range of 'a' occurrences, return 'a', otherwise 'd'
    return randomIndex < followingA.length ? 'a' : 'd';

}
// Function to handle user input, whether it's from clicking buttons or pressing keys
function handleUserInput(input) {
    console.log("User input:", input);
    userInputHistory.push(input);
    
    if (input === 'a' || input === 'd') {
        let buttonPressCountElement = document.getElementById('buttonPressCount');
        let buttonPressCount = parseInt(buttonPressCountElement.textContent, 10);
        buttonPressCountElement.textContent = (buttonPressCount + 1).toString();
    }

    // Update n-gram frequencies for the Markov model before making predictions
    updateNGramFrequencies(userInputHistory, 5); // Assuming you are using 5-grams

    // Make predictions with both models
    let nGramPrediction = predictWithNGram(userInputHistory, 5); // Using 5-grams
    let markovPrediction = predictWithMarkov(userInputHistory, 10); // Using 9-grams for Markov model as well

    // Update the display with the predictions
    document.getElementById('nGramGuess').textContent = nGramPrediction;
    document.getElementById('markovGuess').textContent = markovPrediction; // Assuming you have this element in your HTML

    // Add the prediction to the history
    let prediction = {
        nGram: nGramPrediction,
        markov: markovPrediction, // Adding Markov prediction to the history object
        user: input,
        nGramCorrect: nGramPrediction === input,
        markovCorrect: markovPrediction === input
    };
    guessHistory.push(prediction);

    // Update the guess history display
    updateGuessHistoryDisplay();

    // Update the correctness for nGram and potentially for Markov separately
    if (prediction.nGramCorrect) {
        correctNGramPredictions++;
    }
    if (prediction.markovCorrect) {
        correctMarkovPredictions++;
    }
    // If you want to track Markov accuracy, you'll need another counter

    // Calculate and update the accuracy display
    let nGramAccuracyPercentage = Math.round((correctNGramPredictions / userInputHistory.length) * 100);
let markovAccuracyPercentage = Math.round((correctMarkovPredictions / userInputHistory.length) * 100);

document.getElementById('nGramAccuracy').textContent = nGramAccuracyPercentage + '%';
document.getElementById('markovAccuracy').textContent = markovAccuracyPercentage + '%';
}


    // Add click event listeners to the buttons
    document.getElementById('buttonA').addEventListener('click', function() {
        handleUserInput('a');
    });

    document.getElementById('buttonD').addEventListener('click', function() {
        handleUserInput('d');
    });

    // Add keypress event listener to the document
    document.addEventListener('keypress', function(event) {
        // Check if 'a' or 'd' was pressed
        if(event.key === 'a' || event.key === 'A') {
            handleUserInput('a');
        } else if(event.key === 'd' || event.key === 'D') {
            handleUserInput('d');
        }
    });
});
