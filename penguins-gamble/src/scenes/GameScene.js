import Phaser from 'phaser';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    // Load assets here (we'll use simple shapes for this demo)
  }

  create() {

    this.enemy = this.physics.add.sprite(600, 300, null);
    this.enemy.displayWidth = 50;
    this.enemy.displayHeight = 50;

    // Add a simple graphic to represent the enemy
    this.enemyGraphics = this.add.graphics();
    this.enemyGraphics.fillStyle(0xff0000, 1);
    this.enemyGraphics.fillCircle(0, 0, 25);
    this.enemy.add(this.enemyGraphics);

    // Player attack input
    this.attackKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Enemy health
    this.enemyHealth = 100;

    // Combat text
    this.combatText = this.add.text(400, 550, '', { fontSize: '16px', fill: '#fff' }).setOrigin(0.5);
  
    // Create the player
    this.player = this.physics.add.sprite(400, 300, null);
    this.player.displayWidth = 50;
    this.player.displayHeight = 50;
    this.player.setCollideWorldBounds(true);

    // Add a simple graphic to represent the penguin
    this.playerGraphics = this.add.graphics();
    this.playerGraphics.fillStyle(0x0000ff, 1);
    this.playerGraphics.fillCircle(0, 0, 25);
    this.player.add(this.playerGraphics);

    // Input keys
    this.cursors = this.input.keyboard.createCursorKeys();

    // Slipperiness factor
    this.slipperiness = 1; // Adjust this value to change slipperiness
  }




  
  update() {


    if (Phaser.Input.Keyboard.JustDown(this.attackKey)) {
        this.playerAttack();
      }
    }
  
    playerAttack() {
      // Base success rate
      const successRate = 0.5; // 50% chance
      const random = Math.random();
  
      if (random < successRate) {
        // Attack successful
        const damage = 20;
        this.enemyHealth -= damage;
        this.combatText.setText('Attack Successful! Enemy Health: ' + this.enemyHealth);
  
        if (this.enemyHealth <= 0) {
          this.enemy.destroy();
          this.combatText.setText('Enemy Defeated!');
        }
      } else {
        // Attack missed
        this.combatText.setText('Attack Missed!');
      }
    

    // Handle player movement with unpredictability
    this.handlePlayerMovement();
  }

  handlePlayerMovement() {
    const speed = 200; // Base speed
    let velocityX = 0;
    let velocityY = 0;

    if (this.cursors.left.isDown) {
      velocityX = -speed;
    } else if (this.cursors.right.isDown) {
      velocityX = speed;
    }

    if (this.cursors.up.isDown) {
      velocityY = -speed;
    } else if (this.cursors.down.isDown) {
      velocityY = speed;
    }

    // Apply slipperiness randomness
    const randomFactor = Phaser.Math.FloatBetween(1 - this.slipperiness, 1 + this.slipperiness);
    velocityX *= randomFactor;
    velocityY *= randomFactor;

    this.player.setVelocity(velocityX, velocityY);
  }
}
