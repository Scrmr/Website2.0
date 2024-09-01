document.addEventListener('DOMContentLoaded', () => {
    const leftFootBtn = document.getElementById('leftFootBtn');
    const rightFootBtn = document.getElementById('rightFootBtn');
    const statusDiv = document.getElementById('status');
    const penguin = document.querySelector('.penguin');
    const icebergHeight = document.querySelector('.iceberg').offsetHeight;

    let steps = [];
    let stepSequences = {};
    let penguinPosition = 0;
    const stepSize = icebergHeight / 100;
    let orcaCorrectGuesses = 0;
    let totalMoves = 0;
    let animationIntervalId = null;

    // Function to switch penguin image based on direction
    const setPenguinImage = (direction) => {
        if (direction === 'left') {
            penguin.style.backgroundImage = "url('images/penguinleft.png')";
        } else if (direction === 'right') {
            penguin.style.backgroundImage = "url('images/penguinright.png')";
        }
    };

    // Function to animate the penguin movement smoothly
    const animatePenguin = (start, end, duration) => {
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            penguin.style.bottom = `${start + (end - start) * progress}px`;

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    };

    // Function to move the penguin on the iceberg
    const movePenguin = () => {
        const start = parseFloat(penguin.style.bottom) || 0;
        const end = penguinPosition * stepSize;
        animatePenguin(start, end, 300);
    };

    const stopAnimation = () => {
        clearInterval(animationIntervalId);
        animationIntervalId = null;
    };

    // Function to record each move and update the stepSequences object
    const recordMove = (foot) => {
        steps.push(foot);
        if (steps.length > 5) {
            steps.shift();
        }

        if (steps.length === 5) {
            const last5Moves = steps.join('');

            if (!stepSequences[last5Moves]) {
                stepSequences[last5Moves] = { 'left': 0, 'right': 0 };
            }
            stepSequences[last5Moves][foot] += 1;

            console.log(`Recording move: ${foot}, Updated step sequence: ${last5Moves}`);
            console.log(`Left count: ${stepSequences[last5Moves].left}, Right count: ${stepSequences[last5Moves].right}`);
        }
    };

    // Function to make the orca guess the next move
    const orcaPredict = () => {
        if (steps.length < 5) return Math.random() < 0.5 ? 'left' : 'right';

        const last5Moves = steps.join('');
        const sequenceData = stepSequences[last5Moves];

        if (!sequenceData) {
            console.log(`Orca guessing randomly because ${last5Moves} hasn't been seen.`);
            return Math.random() < 0.5 ? 'left' : 'right';
        }

        const prediction = sequenceData.left < sequenceData.right ? 'left' : 'right';
        console.log(`Orca predicting: ${prediction} based on sequence: ${last5Moves}`);
        return prediction;
    };

    // Function to handle user's move
    const makeMove = (foot) => {
        if (penguinPosition >= 100) {
            statusDiv.textContent = "The penguin has reached the golden egg! You win!";
            stopAnimation();
            return;
        }

        const orcaGuess = orcaPredict();
        recordMove(foot);
        totalMoves += 1;

        // Set the penguin image based on foot pressed
        setPenguinImage(foot);

        penguinPosition += 1; 
        movePenguin();

        if (orcaGuess === foot) {
            orcaCorrectGuesses += 1;
        }

        statusDiv.textContent = `Orca guessed ${orcaGuess === foot ? 'correctly' : 'wrongly'}! Score: ${((orcaCorrectGuesses / totalMoves) * 100).toFixed(2)}%`;

        if (penguinPosition > 25 && (orcaCorrectGuesses / totalMoves) > 0.7) {
            statusDiv.textContent = "The orca guessed correctly too many times! The penguin falls off!";
            penguinPosition = 0;
            steps = [];
            orcaCorrectGuesses = 0;
            totalMoves = 0;
            movePenguin();
        } else if (penguinPosition <= 25) {
            statusDiv.textContent += ` You are safe for the first 25 steps. Step ${penguinPosition} of 100.`;
        }

        if (penguinPosition === 100) {
            statusDiv.textContent = "The penguin has reached the golden egg! You win!";
            stopAnimation();
        }
    };

    // Event listeners for buttons
    leftFootBtn.addEventListener('click', () => makeMove('left'));
rightFootBtn.addEventListener('click', () => makeMove('right'));

leftFootBtn.addEventListener('touchstart', () => makeMove('left'));
rightFootBtn.addEventListener('touchstart', () => makeMove('right'));




    // Adding keyboard controls
    document.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
            makeMove('left');
        } else if (event.key === 'ArrowRight') {
            makeMove('right');
        }
    });
});
