let grid;
let cols = 30;
let rows = 30;
let cellSize;

function setup() {
    let canvasWidth = 500; // Adjust as needed
    let canvasHeight = 180; // Adjust as needed
    let canvas = createCanvas(canvasWidth, canvasHeight);
    canvas.parent('canvas-container'); // Parent the canvas to the new div
    cellSize = canvasWidth / cols; // Calculate cell size based on canvas width
    initializeGrid();
}



function initializeGrid() {
    grid = new Array(rows);
    for (let i = 0; i < rows; i++) {
        grid[i] = new Array(cols);
        for (let j = 0; j < cols; j++) {
            grid[i][j] = { filled: false }; // Each cell is an object
        }
    }
}



function draw() {
    background(255); // White background
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            let x = j * cellSize;
            let y = i * cellSize;
            stroke(0); // Black border for cells
            fill(grid[i][j].filled ? 'red' : 'darkgrey'); // Red if filled, dark grey if empty
            rect(x, y, cellSize, cellSize);
        }
    }
}


function windowResized() {
    let canvasWidth = min(windowWidth, 800);
    let canvasHeight = min(windowHeight, 600);
    cellSize = canvasWidth / cols;
    resizeCanvas(canvasWidth, canvasHeight);
    // Optionally re-initialize or adjust the grid if necessary
}
