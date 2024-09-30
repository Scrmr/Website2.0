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
let abyssSpeed = 0.2;

const game = new Phaser.Game(config);

function preload() {
    this.load.image('background', 'assets/space_background.png');
    this.load.image('planet', 'assets/planet.png');
    this.load.image('abyss', 'assets/abyss.png');
    this.load.spritesheet('player', 'assets/player_sprite.png', {
        frameWidth: 32,
        frameHeight: 48,
    });
}

function create() {
    // Background
    this.add.image(400, 300, 'background');

    // Platforms Group
    platforms = this.physics.add.staticGroup();

    // Create Platforms with Random Positions
    const initialPlatformCount = 15;
    const minYSpacing = 100;
    const maxYSpacing = 200;
    const planetScale = 0.05; // Adjust as needed
    let previousY = 600;

    for (let i = 0; i < initialPlatformCount; i++) {
        let x = Phaser.Math.Between(50, 750);
        let y = previousY - Phaser.Math.Between(minYSpacing, maxYSpacing);
        platforms.create(x, y, 'planet').setScale(planetScale).refreshBody();
        previousY = y;
    }

    // Player
    player = this.physics.add.sprite(400, 500, 'player');
    player.setBounce(0.2);
    player.setCollideWorldBounds(true);

    // Adjust player size and offset if necessary
    // player.setSize(player.width * 0.8, player.height * 0.9);
    // player.setOffset(player.width * 0.1, player.height * 0.1);

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
    abyss.body.setSize(800, 50);

    // Collisions
    this.physics.add.collider(player, platforms, this.resetDoubleJump, null, this);
    this.physics.add.overlap(player, abyss, this.gameOver, null, this);

    // Input
    cursors = this.input.keyboard.createCursorKeys();
    dashKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    // Define functions within the scene's context
    this.resetDoubleJump = () => {
        doubleJump = true;
    };

    this.gameOver = () => {
        this.physics.pause();
        player.setTint(0xff0000);
        player.anims.play('turn');
        // Display Game Over message
        this.add
            .text(400, 300, 'Game Over', { fontSize: '64px', fill: '#fff' })
            .setOrigin(0.5);
    };
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
    platforms.children.iterate((platform) => {
        if (platform.y > 650) {
            // Reposition the platform above the highest existing platform
            let highestPlatformY = platforms.getChildren().reduce((minY, p) => (p.y < minY ? p.y : minY), platform.y);
            let x = Phaser.Math.Between(50, 750);
            let y = highestPlatformY - Phaser.Math.Between(minYSpacing, maxYSpacing);

            platform.x = x;
            platform.y = y;
            platform.refreshBody();
        }
    });

    // Game Over if Player falls below screen
    if (player.y > 600) {
        this.gameOver();
    }
}
