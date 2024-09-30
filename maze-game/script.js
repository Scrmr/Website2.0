// Constants
const CELL_SIZE = 25; // Size of each maze cell
const PLAYER_SIZE = 20;
const GHOST_SIZE = 20;

// Game Variables
let player, ghost;
let maze;
let rows, cols;
let gameOver = false;

// p5.js Setup Function
function setup() {
  // Calculate number of rows and columns based on cell size
  rows = 20;
  cols = 20;

  // Create Canvas and Attach to Game Container
  createCanvas(cols * CELL_SIZE, rows * CELL_SIZE).parent('game-container');

  // Generate Maze
  maze = generateMaze(rows, cols);

  // Initialize Player and Ghost Positions AFTER Maze Generation
  // Find the starting and ending points
  let startX = 1;
  let startY = 1;
  let endX = cols - 2;
  let endY = rows - 2;

  // Ensure starting and ending cells are paths
  maze[startY][startX] = 0;
  maze[endY][endX] = 0;

  // Place Player at the Starting Cell
  player = createVector(startX * CELL_SIZE + CELL_SIZE / 2, startY * CELL_SIZE + CELL_SIZE / 2);

  // Place Ghost at the Ending Cell
  ghost = createVector(endX * CELL_SIZE + CELL_SIZE / 2, endY * CELL_SIZE + CELL_SIZE / 2);
}

// p5.js Draw Function
function draw() {
  background(0); // Black background

  // Draw Maze
  drawMaze();

  // Handle Player Movement
  handlePlayerMovement();

  // Draw Player and Ghost
  drawPlayer();
  drawGhost();

  // Move Ghost Towards Player
  moveGhost();

  // Check for Game Over Condition
  checkGameOver();
}

// Function to Generate a Solvable Maze using Depth-First Search (DFS)
function generateMaze(rows, cols) {
  // Initialize Maze Grid: 1 = Wall, 0 = Path
  let maze = Array(rows)
    .fill()
    .map(() => Array(cols).fill(1));

  // Directions: [dx, dy]
  const directions = [
    [0, -2], // Up
    [2, 0],  // Right
    [0, 2],  // Down
    [-2, 0]  // Left
  ];

  // Helper Function to Check if Position is Within Bounds
  function isInBounds(x, y) {
    return x >= 0 && x < cols && y >= 0 && y < rows;
  }

  // Recursive DFS Function
  function dfs(x, y) {
    maze[y][x] = 0; // Mark current cell as path

    // Shuffle Directions to ensure random maze
    shuffle(directions, true);

    for (let [dx, dy] of directions) {
      let nx = x + dx;
      let ny = y + dy;

      if (isInBounds(nx, ny) && maze[ny][nx] === 1) {
        // Remove wall between current and next cell
        maze[y + dy / 2][x + dx / 2] = 0;
        dfs(nx, ny);
      }
    }
  }

  // Start DFS from (1,1) to ensure starting within bounds
  let startX = 1;
  let startY = 1;
  dfs(startX, startY);

  // Ensure the ending point is open
  let endX = cols - 2;
  let endY = rows - 2;
  maze[endY][endX] = 0;

  return maze;
}

// Function to Draw the Maze
function drawMaze() {
  noStroke();
  fill(255); // White walls

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (maze[y][x] === 1) {
        rect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
  }
}

// Function to Draw the Player
function drawPlayer() {
  fill(0, 255, 0); // Green color
  noStroke();
  ellipse(player.x, player.y, PLAYER_SIZE);
}

// Function to Draw the Ghost
function drawGhost() {
  // Blinking Effect
  let alpha = (frameCount % 60 < 30) ? 255 : 128; // Blink every 30 frames
  fill(255, 0, 0, alpha); // Red color with variable opacity
  noStroke();
  ellipse(ghost.x, ghost.y, GHOST_SIZE);
}

// Function to Handle Player Movement Using keyIsDown for Smooth Movement
function handlePlayerMovement() {
  if (gameOver) return; // Disable movement if game is over

  let newX = player.x;
  let newY = player.y;

  if (keyIsDown(UP_ARROW)) {
    newY -= 2;
  }
  if (keyIsDown(DOWN_ARROW)) {
    newY += 2;
  }
  if (keyIsDown(LEFT_ARROW)) {
    newX -= 2;
  }
  if (keyIsDown(RIGHT_ARROW)) {
    newX += 2;
  }

  // Check Collision Before Moving
  if (canMove(newX, newY)) {
    player.x = newX;
    player.y = newY;
  }
}

// Function to Move Ghost Towards Player (Simple AI)
function moveGhost() {
  if (gameOver) return; // Disable movement if game is over

  let stepSize = 1.5; // Ghost speed

  // Calculate Direction Vector from Ghost to Player
  let direction = p5.Vector.sub(player, ghost);
  direction.setMag(stepSize);

  // Predict Next Position
  let nextPos = p5.Vector.add(ghost, direction);

  // Check Collision Before Moving
  if (canMove(nextPos.x, nextPos.y)) {
    ghost.add(direction);
  } else {
    // If direct path is blocked, try moving horizontally and vertically separately
    let horiz = p5.Vector.add(ghost, createVector(direction.x, 0));
    let vert = p5.Vector.add(ghost, createVector(0, direction.y));

    if (canMove(horiz.x, horiz.y)) {
      ghost.x += direction.x;
    }
    if (canMove(vert.x, vert.y)) {
      ghost.y += direction.y;
    }
    // Else, ghost stays in place
  }
}

// Function to Check if Movement is Possible (Collision Detection)
function canMove(x, y) {
  // Ensure the entity stays within canvas bounds
  if (x - PLAYER_SIZE / 2 < 0 || x + PLAYER_SIZE / 2 > width ||
      y - PLAYER_SIZE / 2 < 0 || y + PLAYER_SIZE / 2 > height) {
    return false;
  }

  // Determine the grid cell the position is in
  let col = floor(x / CELL_SIZE);
  let row = floor(y / CELL_SIZE);

  // Check surrounding cells based on entity size to prevent overlapping walls
  // Check four corners
  let corners = [
    { x: x - PLAYER_SIZE / 2, y: y - PLAYER_SIZE / 2 },
    { x: x + PLAYER_SIZE / 2, y: y - PLAYER_SIZE / 2 },
    { x: x - PLAYER_SIZE / 2, y: y + PLAYER_SIZE / 2 },
    { x: x + PLAYER_SIZE / 2, y: y + PLAYER_SIZE / 2 }
  ];

  for (let corner of corners) {
    let cCol = floor(corner.x / CELL_SIZE);
    let cRow = floor(corner.y / CELL_SIZE);
    if (cRow < 0 || cRow >= rows || cCol < 0 || cCol >= cols) {
      return false; // Out of bounds
    }
    if (maze[cRow][cCol] === 1) {
      return false; // Collision with wall
    }
  }

  return true; // No collision detected
}

// Function to Check for Game Over Condition
function checkGameOver() {
  let distance = dist(player.x, player.y, ghost.x, ghost.y);
  if (distance < (PLAYER_SIZE + GHOST_SIZE) / 2) {
    gameOver = true;
    noLoop(); // Stop the draw loop

    // Display Game Over Message
    displayGameOver();
  }
}

// Function to Display Game Over Message
function displayGameOver() {
  // Create Game Over Text Element
  let gameOverText = createDiv('Game Over!');
  gameOverText.id('game-over');
  gameOverText.parent('game-container');
  gameOverText.style('display', 'block');
}
