import Phaser from 'phaser';
import GameScene from './scenes/GameScene';

const config = {
  type: Phaser.AUTO,
  width: 800, // Width of the game canvas
  height: 600, // Height of the game canvas
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 }, // No gravity needed for top-down view
      debug: false,
    },
  },
  scene: [GameScene],
};

const game = new Phaser.Game(config);
