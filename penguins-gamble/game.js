// Main Scene
class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
    }

    preload() {
        // Load assets
        this.load.image('penguin', 'assets/penguin.png');
        this.load.image('iceberg', 'assets/iceberg.png');
        this.load.image('fish', 'assets/fish.png');
        this.load.image('seal', 'assets/seal.png');
    }

    create() {
        // Initialize variables
        this.playerHealth = 100;
        this.enemyHealth = 100;
        this.fishCollected = 0;
        this.combat = false;
        this.slipperyFactor = 1;

        // Add iceberg background and scale it
        this.add.image(400, 300, 'iceberg').setScale(0.5);

        // Add player and scale it
        this.player = this.physics.add.sprite(100, 300, 'penguin').setScale(0.2);
        this.player.setCollideWorldBounds(true);

        // Create fish group and scale each fish
        this.fishGroup = this.physics.add.group({
            key: 'fish',
            repeat: 10,
            setXY: { x: 150, y: 100, stepX: 60, stepY: 40 }
        });
        this.fishGroup.children.iterate((fish) => {
            fish.setScale(0.1);
        });

        // Create enemy and scale it
        this.enemy = this.physics.add.sprite(700, 300, 'seal').setScale(0.3);
        this.enemy.setImmovable(true);

        // Overlap with fish
        this.physics.add.overlap(this.player, this.fishGroup, this.collectFish, null, this);

        // Collider with enemy
        this.physics.add.collider(this.player, this.enemy, this.startCombat, null, this);

        // Input events
        this.cursors = this.input.keyboard.createCursorKeys();

        // Fish collected text
        this.fishText = this.add.text(16, 16, 'Fish Collected: 0', { fontSize: '20px', fill: '#000' });

        // Random weather effect
        this.randomWeather();

        // Action text
        this.actionText = this.add.text(400, 550, '', { fontSize: '18px', fill: '#000' }).setOrigin(0.5);

        // Combat menu (hidden initially)
        this.combatMenu = this.add.text(400, 300, '', { fontSize: '20px', fill: '#fff', backgroundColor: '#000' }).setOrigin(0.5);
        this.combatMenu.visible = false;
    }

    update() {
        if (!this.combat) {
            this.handleMovement();
        }
    }

    handleMovement() {
        // Random slipperiness factor
        let slipperiness = Phaser.Math.FloatBetween(0.8, 1.2) * this.slipperyFactor;

        this.player.setVelocity(0);

        if (this.cursors.left.isDown) {
            this.player.setVelocityX(-160 * slipperiness);
        }
        else if (this.cursors.right.isDown) {
            this.player.setVelocityX(160 * slipperiness);
        }

        if (this.cursors.up.isDown) {
            this.player.setVelocityY(-160 * slipperiness);
        }
        else if (this.cursors.down.isDown) {
            this.player.setVelocityY(160 * slipperiness);
        }
    }

    collectFish(player, fish) {
        fish.disableBody(true, true);
        this.fishCollected += 1;
        this.fishText.setText('Fish Collected: ' + this.fishCollected);
    }

    startCombat(player, enemy) {
        this.combat = true;
        this.player.setVelocity(0);
        this.enemy.setVelocity(0);
        this.actionText.setText('A wild seal appears!');
        this.time.delayedCall(2000, this.showCombatMenu, [], this);
    }

    showCombatMenu() {
        this.actionText.setText('');
        this.combatMenu.setText('Choose an action:\n1. Attack\n2. Dodge\n3. Use Item');
        this.combatMenu.visible = true;

        // Input for combat
        this.input.keyboard.once('keydown_ONE', () => {
            this.playerAttack();
        });
        this.input.keyboard.once('keydown_TWO', () => {
            this.playerDodge();
        });
        this.input.keyboard.once('keydown_THREE', () => {
            this.useItem();
        });
    }

    playerAttack() {
        this.combatMenu.visible = false;
        let success = Phaser.Math.Between(1, 100) <= 70; // 70% chance
        if (success) {
            this.enemyHealth -= 30;
            this.actionText.setText('Attack successful! Enemy health: ' + this.enemyHealth);
        } else {
            this.actionText.setText('Attack missed!');
        }
        this.checkCombatOutcome();
    }

    playerDodge() {
        this.combatMenu.visible = false;
        let success = Phaser.Math.Between(1, 100) <= 50; // 50% chance
        if (success) {
            this.actionText.setText('Dodge successful! You avoided the attack.');
        } else {
            this.playerHealth -= 20;
            this.actionText.setText('Dodge failed! Your health: ' + this.playerHealth);
        }
        this.checkCombatOutcome();
    }

    useItem() {
        if (this.fishCollected >= 1) {
            this.fishCollected -= 1;
            this.fishText.setText('Fish Collected: ' + this.fishCollected);
            this.enemyHealth -= 50;
            this.actionText.setText('Used a fish! Enemy health: ' + this.enemyHealth);
        } else {
            this.actionText.setText('No fish to use!');
        }
        this.combatMenu.visible = false;
        this.checkCombatOutcome();
    }

    checkCombatOutcome() {
        if (this.enemyHealth <= 0) {
            this.actionText.setText('You defeated the enemy!');
            this.enemy.disableBody(true, true);
            this.combat = false;
        } else if (this.playerHealth <= 0) {
            this.actionText.setText('You have been defeated!');
            this.player.disableBody(true, true);
            this.combat = false;
        } else {
            this.time.delayedCall(2000, this.enemyTurn, [], this);
        }
    }

    enemyTurn() {
        let success = Phaser.Math.Between(1, 100) <= 60; // 60% chance
        if (success) {
            this.playerHealth -= 25;
            this.actionText.setText('Enemy attacked! Your health: ' + this.playerHealth);
        } else {
            this.actionText.setText('Enemy missed!');
        }
        if (this.playerHealth <= 0) {
            this.actionText.setText('You have been defeated!');
            this.player.disableBody(true, true);
            this.combat = false;
        } else {
            this.time.delayedCall(2000, this.showCombatMenu, [], this);
        }
    }

    randomWeather() {
        let weather = Phaser.Math.Between(1, 3);
        if (weather === 1) {
            // Strong winds increase slipperiness
            this.slipperyFactor = 1.5;
            this.add.text(400, 50, 'Strong winds! Movement is more unpredictable.', { fontSize: '18px', fill: '#000' }).setOrigin(0.5);
        } else if (weather === 2) {
            // Blizzards obscure vision (not implemented in demo)
            this.add.text(400, 50, 'Blizzard! Visibility is low.', { fontSize: '18px', fill: '#000' }).setOrigin(0.5);
        } else {
            // Calm weather
            this.add.text(400, 50, 'Calm weather.', { fontSize: '18px', fill: '#000' }).setOrigin(0.5);
        }
    }
}

// Game configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#87CEEB', // Sky blue background
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: [MainScene]
};

// Initialize the game
const game = new Phaser.Game(config);
