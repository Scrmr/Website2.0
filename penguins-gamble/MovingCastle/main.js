// main.js

// Preload Scene: Loads all the assets
class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PreloadScene' });
    }

    preload() {
        // Load images
        this.load.image('background', 'assets/background.png');
        this.load.image('meter_bg', 'assets/meter_bg.png');
        this.load.image('meter_fill', 'assets/meter_fill.png');
        this.load.image('option_left', 'assets/option_left.png');
        this.load.image('option_right', 'assets/option_right.png');

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

// Main Scene: Game logic and user interaction
class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
        this.choices = [];
        this.alignmentValue = 0; // Starts at 0%
        this.threshold = 100; // Value to reach the mysterious event
    }

    create() {
        // Play background music
        this.bgMusic = this.sound.add('bg_music', { loop: true, volume: 0.5 });
        this.bgMusic.play();

        // Add background image
        this.add.image(this.cameras.main.width / 2, this.cameras.main.height / 2, 'background')
            .setScale(1.5);

        // Create Alignment Meter
        this.createAlignmentMeter();

        // Display Choices
        this.showChoices();

        // Initialize Swipe Input
        this.initSwipeInput();
    }

    createAlignmentMeter() {
        // Meter Background
        this.meterBg = this.add.image(400, 50, 'meter_bg').setScale(0.5);

        // Meter Fill
        this.meterFill = this.add.image(400 - this.meterBg.width / 4, 50, 'meter_fill')
            .setScale(0.5)
            .setOrigin(0, 0.5);

        // Mask for the fill
        const maskShape = this.add.rectangle(400 - this.meterBg.width / 4, 50, 0, this.meterBg.height, 0xffffff)
            .setOrigin(0, 0.5);

        this.meterFill.mask = new Phaser.Display.Masks.GeometryMask(this, maskShape);

        // Store maskShape for later updates
        this.meterMaskShape = maskShape;
    }

    updateAlignmentMeter() {
        // Update the width of the mask based on alignmentValue
        const maxMaskWidth = this.meterBg.width / 2;
        const newWidth = (this.alignmentValue / this.threshold) * maxMaskWidth;
        this.meterMaskShape.width = newWidth;
    }

    showChoices() {
        // Remove existing options if any
        if (this.optionLeft) this.optionLeft.destroy();
        if (this.optionRight) this.optionRight.destroy();

        // Display left option
        this.optionLeft = this.add.image(200, 300, 'option_left').setScale(0.5).setInteractive();
        this.optionLeft.on('pointerup', () => this.makeChoice('left'));

        // Display right option
        this.optionRight = this.add.image(600, 300, 'option_right').setScale(0.5).setInteractive();
        this.optionRight.on('pointerup', () => this.makeChoice('right'));
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

        // Check for game end condition
        if (this.alignmentValue >= this.threshold) {
            this.endGame();
        } else {
            // Continue the game
            this.showChoices();
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

    initSwipeInput() {
        this.input.on('pointerdown', (pointer) => {
            this.startX = pointer.x;
        });

        this.input.on('pointerup', (pointer) => {
            const endX = pointer.x;
            const deltaX = endX - this.startX;
            if (deltaX > 50) {
                this.makeChoice('right');
            } else if (deltaX < -50) {
                this.makeChoice('left');
            }
        });
    }

    endGame() {
        // Stop background music
        this.bgMusic.stop();

        // Display the mysterious event
        this.cameras.main.fadeOut(2000, 0, 0, 0);

        this.time.delayedCall(2000, () => {
            this.scene.start('EndScene');
        });
    }
}

// End Scene: Displays the mysterious event
class EndScene extends Phaser.Scene {
    constructor() {
        super({ key: 'EndScene' });
    }

    create() {
        // Add a dark overlay
        this.add.rectangle(400, 300, 800, 600, 0x000000);

        // Display mysterious message
        const text = this.add.text(400, 300, 'The Castle Reveals Its Secrets...', {
            fontSize: '36px',
            fill: '#ffffff',
            fontFamily: 'Georgia, "Goudy Bookletter 1911", Times, serif',
            align: 'center',
            wordWrap: { width: 700, useAdvancedWrap: true },
        }).setOrigin(0.5);

        // Optionally, add animations or further interactions
    }
}

// Game Configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    scene: [PreloadScene, MainScene, EndScene],
    physics: {
        default: 'arcade',
        arcade: { debug: false },
    },
    backgroundColor: '#000000',
};

// Initialize the game
const game = new Phaser.Game(config);
