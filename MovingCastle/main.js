// main.js

class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PreloadScene' });
    }

    preload() {
        // Load images
        this.load.image('background', 'assets/background.png');
        this.load.image('meter_bg', 'assets/meter_bg.png');
        this.load.image('meter_fill', 'assets/meter_fill.png');
        // Option images are no longer needed
        // this.load.image('option_left', 'assets/option_left.png');
        // this.load.image('option_right', 'assets/option_right.png');

        // Load sounds (optional)
        this.load.audio('bg_music', 'assets/bg_music.mp3');
        this.load.audio('swipe', 'assets/swipe_sound.mp3');

        // Load any additional assets
    }

    create() {
        // Start the Main Scene
        this.scene.start('MainScene');
    }
}

class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
        this.choices = [];
        this.alignmentValue = 0; // Starts at 0%
        this.threshold = 100; // Value to reach the mysterious event
        this.questions = [
            'You come across a dark corridor. Do you proceed?',
            'A mysterious figure offers guidance. Do you accept?',
            'You find an old book. Do you read it?',
            'A hidden door appears. Do you enter?',
            'You hear whispers calling your name. Do you follow?'
        ];
        this.currentQuestionIndex = 0;
    }

    create() {
        // Set up scaling
        this.scale.lockOrientation('portrait');

        // Play background music
        this.bgMusic = this.sound.add('bg_music', { loop: true, volume: 0.5 });
        this.bgMusic.play();

        // Add background image
        const { width, height } = this.cameras.main;
        this.add.image(width / 2, height / 2, 'background')
            .setDisplaySize(width, height);

        // Create Alignment Meter
        this.createAlignmentMeter();

        // Display the first question
        this.displayQuestion();

        // Initialize Drawing Input
        this.initDrawingInput();
    }

    createAlignmentMeter() {
        const { width } = this.cameras.main;

        // Meter Background
        this.meterBg = this.add.image(width / 2, 50, 'meter_bg');
        this.meterBg.setOrigin(0.5, 0);
        this.meterBg.setScale(0.8);

        // Meter Fill
        this.meterFill = this.add.image((width / 2) - (this.meterBg.displayWidth / 2), 50, 'meter_fill')
            .setOrigin(0, 0);
        this.meterFill.setScale(0.8);

        // Mask for the fill
        const maskShape = this.add.rectangle(
            (width / 2) - (this.meterBg.displayWidth / 2),
            50,
            0,
            this.meterBg.displayHeight,
            0xffffff
        ).setOrigin(0, 0);

        this.meterFill.mask = new Phaser.Display.Masks.GeometryMask(this, maskShape);

        // Store maskShape for later updates
        this.meterMaskShape = maskShape;
    }

    updateAlignmentMeter() {
        // Update the width of the mask based on alignmentValue
        const maxMaskWidth = this.meterBg.displayWidth;
        const newWidth = (this.alignmentValue / this.threshold) * maxMaskWidth;
        this.meterMaskShape.width = newWidth;
    }

    displayQuestion() {
        const { width } = this.cameras.main;

        // Remove existing question text if any
        if (this.questionText) {
            this.questionText.destroy();
        }

        // Display the current question
        const question = this.questions[this.currentQuestionIndex % this.questions.length];
        this.questionText = this.add.text(width / 2, 150, question, {
            fontSize: '24px',
            fill: '#ffffff',
            fontFamily: 'Georgia, "Goudy Bookletter 1911", Times, serif',
            align: 'center',
            wordWrap: { width: width - 40 }
        }).setOrigin(0.5);
    }

    initDrawingInput() {
        this.isDrawing = false;
        this.drawingGraphics = this.add.graphics({ lineStyle: { width: 4, color: 0xffffff } });
        this.drawingPath = [];

        this.input.on('pointerdown', this.startDrawing, this);
        this.input.on('pointermove', this.updateDrawing, this);
        this.input.on('pointerup', this.endDrawing, this);
    }

    startDrawing(pointer) {
        this.isDrawing = true;
        this.drawingPath = [];
        this.drawingGraphics.clear();
        this.drawingGraphics.lineStyle(4, 0xffffff);

        this.drawingGraphics.beginPath();
        this.drawingGraphics.moveTo(pointer.x, pointer.y);
        this.drawingPath.push({ x: pointer.x, y: pointer.y });
    }

    updateDrawing(pointer) {
        if (this.isDrawing) {
            this.drawingGraphics.lineTo(pointer.x, pointer.y);
            this.drawingGraphics.strokePath();
            this.drawingPath.push({ x: pointer.x, y: pointer.y });
        }
    }

    endDrawing(pointer) {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.drawingGraphics.closePath();
            // Analyze the drawing to make a choice
            this.analyzeDrawing();
        }
    }

    analyzeDrawing() {
        // Simple analysis: determine if the drawing is predominantly left or right
        if (this.drawingPath.length < 2) {
            // Not enough data
            return;
        }

        const firstPoint = this.drawingPath[0];
        const lastPoint = this.drawingPath[this.drawingPath.length - 1];
        const deltaX = lastPoint.x - firstPoint.x;
        const deltaY = lastPoint.y - firstPoint.y;

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // Horizontal drawing
            if (deltaX > 0) {
                // Rightward drawing
                this.makeChoice('right');
            } else {
                // Leftward drawing
                this.makeChoice('left');
            }
        } else {
            // Vertical drawing or other
            // For simplicity, we can interpret upward drawing as 'up' and downward as 'down'
            // But since our choices are 'left' and 'right', we can prompt the player to draw horizontally
            // For now, we'll ignore vertical drawings
            // You might want to give feedback to the player
            this.showMessage('Please draw from left to right or right to left');
        }

        // Clear the drawing
        this.drawingGraphics.clear();
    }

    showMessage(message) {
        const { width, height } = this.cameras.main;

        // Remove existing message if any
        if (this.messageText) {
            this.messageText.destroy();
        }

        this.messageText = this.add.text(width / 2, height - 100, message, {
            fontSize: '20px',
            fill: '#ff0000',
            fontFamily: 'Georgia, "Goudy Bookletter 1911", Times, serif',
            align: 'center',
            wordWrap: { width: width - 40 }
        }).setOrigin(0.5);

        // Fade out the message after a short delay
        this.time.delayedCall(2000, () => {
            if (this.messageText) {
                this.messageText.destroy();
            }
        });
    }

    makeChoice(direction) {
        // Play swipe sound
        this.sound.play('swipe', { volume: 0.7 });

        // Record the choice
        this.choices.push(direction);

        // Keep only the last five choices
        if (this.choices.length > 5) {
            this.choices.shift();
        }

        // Predict next move
        const prediction = this.predictNextMove();

        // Update Alignment Meter
        if (prediction === direction) {
            this.alignmentValue = Math.max(0, this.alignmentValue - 10); // Decrease meter
        } else {
            this.alignmentValue = Math.min(this.threshold, this.alignmentValue + 10); // Increase meter
        }

        // Update meter display
        this.updateAlignmentMeter();

        // Move to next question
        this.currentQuestionIndex++;

        // Check for game end condition
        if (this.alignmentValue >= this.threshold) {
            this.endGame();
        } else {
            // Continue the game
            this.displayQuestion();
            // No need to show choices since drawing is the input method
        }
    }

    predictNextMove() {
        if (this.choices.length < 5) {
            return null; // Not enough data to predict
        }

        const lastFive = this.choices.slice(-5).join('');

        // Build a simple frequency table
        const sequences = {};
        for (let i = 0; i <= this.choices.length - 6; i++) {
            const seq = this.choices.slice(i, i + 5).join('');
            const nextChoice = this.choices[i + 5];
            if (!sequences[seq]) sequences[seq] = { left: 0, right: 0 };
            sequences[seq][nextChoice]++;
        }

        const predictionData = sequences[lastFive];
        if (predictionData) {
            return predictionData.left > predictionData.right ? 'left' : 'right';
        } else {
            return null;
        }
    }

    endGame() {
        // Stop background music
        this.bgMusic.stop();

        // Fade out the main scene
        this.cameras.main.fadeOut(2000, 0, 0, 0);

        this.time.delayedCall(2000, () => {
            this.scene.start('EndScene');
        });
    }
}

class EndScene extends Phaser.Scene {
    constructor() {
        super({ key: 'EndScene' });
    }

    create() {
        const { width, height } = this.cameras.main;

        // Add a dark overlay
        this.add.rectangle(width / 2, height / 2, width, height, 0x000000);

        // Display mysterious message
        this.add.text(width / 2, height / 2, 'The Castle Reveals Its Secrets...', {
            fontSize: '32px',
            fill: '#ffffff',
            fontFamily: 'Georgia, "Goudy Bookletter 1911", Times, serif',
            align: 'center',
            wordWrap: { width: width - 40, useAdvancedWrap: true },
        }).setOrigin(0.5);

        // Optionally, add animations or further interactions
    }
}

// Game Configuration
const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    scene: [PreloadScene, MainScene, EndScene],
    physics: {
        default: 'arcade',
        arcade: { debug: false },
    },
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    backgroundColor: '#000000',
};

// Initialize the game
const game = new Phaser.Game(config);
