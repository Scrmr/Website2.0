document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const rows = 50;
    const cols = 50;
    const resolution = 10;
    let grid = createGrid(rows, cols);
    let running = false;
    let animationId;
    let isMouseDown = false;
    let speed = 200; // Default speed in milliseconds

    // Player colors
    const playerColors = [
        document.getElementById('player1Color').value, // Player 1 color
        document.getElementById('player2Color').value  // Player 2 color
        // Add more player colors if needed
    ];

    // Event listeners for mouse interactions and color selection
    const speedSlider = document.getElementById('speedSlider');
    const colorPicker1 = document.getElementById('player1Color');
    const colorPicker2 = document.getElementById('player2Color');
    
    speedSlider.addEventListener('input', (event) => {
        speed = event.target.value;
    });

    colorPicker1.addEventListener('input', (event) => {
        playerColors[0] = event.target.value;
    });

    colorPicker2.addEventListener('input', (event) => {
        playerColors[1] = event.target.value;
    });

    canvas.addEventListener('mousedown', () => {
        isMouseDown = true;
    });

    canvas.addEventListener('mouseup', () => {
        isMouseDown = false;
    });

    canvas.addEventListener('mousemove', (event) => {
        if (isMouseDown) {
            const x = Math.floor(event.offsetX / resolution);
            const y = Math.floor(event.offsetY / resolution);
            if (x >= 0 && x < cols && y >= 0 && y < rows) {
                grid[y][x] = playerColors[0];  // Set the cell to Player 1's color
                drawGrid(grid);
            }
        }
    });

    document.getElementById('startButton').addEventListener('click', () => {
        if (!running) {
            running = true;
            animate();
        }
    });

    document.getElementById('stopButton').addEventListener('click', () => {
        running = false;
        cancelAnimationFrame(animationId);
    });

    document.getElementById('resetButton').addEventListener('click', () => {
        grid = createGrid(rows, cols);
        drawGrid(grid);
    });

    function createGrid(rows, cols) {
        // Initialize the grid with null values representing empty cells
        return new Array(rows).fill(null).map(() => new Array(cols).fill(null));
    }

    function drawGrid(grid) {
        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw the grid based on the cell colors
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cellColor = grid[row][col];
                ctx.fillStyle = cellColor ? cellColor : '#fff'; // Use white for empty cells
                ctx.fillRect(col * resolution, row * resolution, resolution, resolution);
                ctx.strokeRect(col * resolution, row * resolution, resolution, resolution);
            }
        }
    }

    function updateGrid(grid) {
        const nextGrid = createGrid(rows, cols);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cellColor = grid[row][col];
                if (cellColor) {
                    let sameColorNeighbors = 0;
                    let differentColorNeighbors = {};

                    // Count neighbors
                    for (let i = -1; i < 2; i++) {
                        for (let j = -1; j < 2; j++) {
                            if (i === 0 && j === 0) continue;
                            const x = col + j;
                            const y = row + i;
                            if (x >= 0 && x < cols && y >= 0 && y < rows) {
                                const neighborColor = grid[y][x];
                                if (neighborColor) {
                                    if (neighborColor === cellColor) {
                                        sameColorNeighbors++;
                                    } else {
                                        if (!differentColorNeighbors[neighborColor]) {
                                            differentColorNeighbors[neighborColor] = 0;
                                        }
                                        differentColorNeighbors[neighborColor]++;
                                    }
                                }
                            }
                        }
                    }

                    // Apply standard Game of Life rules for the same color
                    if (sameColorNeighbors < 2 || sameColorNeighbors > 3) {
                        nextGrid[row][col] = null; // Underpopulation or Overpopulation
                    } else if (sameColorNeighbors === 2 || sameColorNeighbors === 3) {
                        nextGrid[row][col] = cellColor; // Survival
                    }

                    // Apply special rule for 3 neighbors of 2 different colors
                    const uniqueColors = Object.keys(differentColorNeighbors);
                    if (sameColorNeighbors === 0 && uniqueColors.length === 2) {
                        const selectedColor = uniqueColors[Math.floor(Math.random() * uniqueColors.length)];
                        applyRandomPattern(nextGrid, row, col, selectedColor);
                    }
                } else {
                    // Reproduction: Handle empty cells
                    let potentialColors = {};
                    for (let i = -1; i < 2; i++) {
                        for (let j = -1; j < 2; j++) {
                            if (i === 0 && j === 0) continue;
                            const x = col + j;
                            const y = row + i;
                            if (x >= 0 && x < cols && y >= 0 && y < rows) {
                                const neighborColor = grid[y][x];
                                if (neighborColor) {
                                    if (!potentialColors[neighborColor]) {
                                        potentialColors[neighborColor] = 0;
                                    }
                                    potentialColors[neighborColor]++;
                                }
                            }
                        }
                    }

                    // Check if any color has exactly 3 neighbors
                    const reproductionColors = Object.keys(potentialColors).filter(color => potentialColors[color] === 3);
                    if (reproductionColors.length === 1) {
                        nextGrid[row][col] = reproductionColors[0]; // Reproduction with one color
                    } else if (reproductionColors.length === 2) {
                        const selectedColor = reproductionColors[Math.floor(Math.random() * reproductionColors.length)];
                        applyRandomPattern(nextGrid, row, col, selectedColor);
                    }
                }
            }
        }

        return nextGrid;
    }

    function applyRandomPattern(grid, row, col, color) {
        const patternSize = 9;
        const startRow = Math.max(0, row - Math.floor(patternSize / 2));
        const startCol = Math.max(0, col - Math.floor(patternSize / 2));
        for (let i = 0; i < patternSize; i++) {
            for (let j = 0; j < patternSize; j++) {
                const targetRow = startRow + i;
                const targetCol = startCol + j;
                if (targetRow < rows && targetCol < cols && Math.random() < 0.5) {
                    grid[targetRow][targetCol] = color;
                }
            }
        }
    }

    function animate() {
        if (running) {
            grid = updateGrid(grid);
            drawGrid(grid);

            // Introduce a delay based on the slider value before the next animation frame
            setTimeout(() => {
                requestAnimationFrame(animate);
            }, speed);
        }
    }

    // Initial draw of the grid
    drawGrid(grid);
});
