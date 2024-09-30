const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 800 },
            debug: false,
        },
    },
    scene: {
        preload: preload,
        create: create,
        update: update,
    },
};

let player;
let platforms;
let cursors;
let doubleJump = false;
let dashAvailable = true;
let abyss;
let abyssSpeed = 0.5;

const game = new Phaser.Game(config);

function preload() {
    this.load.image('background', 'assets/space_background.png');
    this.load.image('planet', 'assets/planet.png');
    this.load.image('star', 'assets/star.png');
    this.load.spritesheet('player', 'assets/player_sprite.png', { frameWidth: 32, frameHeight: 48 });
    this.load.image('abyss', 'assets/abyss.png');
}

function create() {
    // Background
    this.add.tileSprite(400, 300, 800, 600, 'background');

    // Platforms Group
    platforms = this.physics.add.staticGroup();

    // Create Platforms
    for (let i = 0; i < 10; i++) {
        let x = Phaser.Math.Between(100, 700);
        let y = 600 - i * 150;
        platforms.create(x, y, 'planet').setScale(0.5).refreshBody();
    }

    // Player
    player = this.physics.add.sprite(400, 500, 'player');
    player.setBounce(0.2);
    player.setCollideWorldBounds(true);

    // Player Animations
    this.anims.create({
        key: 'left',
        frames: this.anims.generateFrameNumbers('player', { start: 0, end: 3 }),
        frameRate: 10,
        repeat: -1,
    });
    this.anims.create({
        key: 'turn',
        frames: [{ key: 'player', frame: 4 }],
        frameRate: 20,
    });
    this.anims.create({
        key: 'right',
        frames: this.anims.generateFrameNumbers('player', { start: 5, end: 8 }),
        frameRate: 10,
        repeat: -1,
    });

    // Abyss
    abyss = this.add.tileSprite(400, 600, 800, 50, 'abyss');
    this.physics.add.existing(abyss);
    abyss.body.setImmovable(true);
    abyss.body.allowGravity = false;

    // Collisions
    this.physics.add.collider(player, platforms, resetDoubleJump, null, this);
    this.physics.add.overlap(player, abyss, gameOver, null, this);

    // Input
    cursors = this.input.keyboard.createCursorKeys();
    dashKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
}

function update() {
    // Abyss rises
    abyss.y -= abyssSpeed;

    // Player Movement
    if (cursors.left.isDown) {
        player.setVelocityX(-160);
        player.anims.play('left', true);
    } else if (cursors.right.isDown) {
        player.setVelocityX(160);
        player.anims.play('right', true);
    } else {
        player.setVelocityX(0);
        player.anims.play('turn');
    }

    // Jumping
    if (Phaser.Input.Keyboard.JustDown(cursors.up)) {
        if (player.body.touching.down) {
            player.setVelocityY(-400);
            doubleJump = true;
        } else if (doubleJump) {
            player.setVelocityY(-400);
            doubleJump = false;
        }
    }

    // Dashing
    if (Phaser.Input.Keyboard.JustDown(dashKey) && dashAvailable) {
        dashAvailable = false;
        player.setVelocityY(-600);
        this.time.delayedCall(1000, () => {
            dashAvailable = true;
        });
    }

    // Recycle Platforms
    platforms.children.iterate(function (platform) {
        if (platform.y > 650) {
            platform.y = Phaser.Math.Between(-50, -10);
            platform.x = Phaser.Math.Between(100, 700);
            platform.refreshBody();
        }
    });

    // Game Over if Player falls below screen
    if (player.y > 600) {
        gameOver();
    }
}

function resetDoubleJump() {
    doubleJump = true;
}

function gameOver() {
    this.physics.pause();
    player.setTint(0xff0000);
    player.anims.play('turn');
    // Restart or display game over screen
}
