document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const rows = 50;
    const cols = 50;
    const resolution = 10;
    let grid = createGrid(rows, cols);
    let directions = createDirectionGrid(rows, cols);
    let running = false;
    let animationId;
    let isMouseDown = false;
    let speed = 200; // Default speed in milliseconds

    // Event listeners for mouse interactions
    const speedSlider = document.getElementById('speedSlider');
    speedSlider.addEventListener('input', (event) => {
        speed = event.target.value;
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
                grid[y][x] = 1;  // Set the cell to "alive"
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
        directions = createDirectionGrid(rows, cols);
        drawGrid(grid);
    });

    function createGrid(rows, cols) {
        return new Array(rows).fill(null).map(() => new Array(cols).fill(0));
    }

    function createDirectionGrid(rows, cols) {
        return new Array(rows).fill(null).map(() =>
            new Array(cols).fill(null).map(() => [1, 1])
        );
    }

    function drawGrid(grid) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cell = grid[row][col];
                ctx.fillStyle = cell ? '#000' : '#fff';
                ctx.fillRect(col * resolution, row * resolution, resolution, resolution);
                ctx.strokeRect(col * resolution, row * resolution, resolution, resolution);
            }
        }
    }

    function updateGrid(grid, directions) {
        const nextGrid = grid.map(arr => [...arr]);
        const nextDirections = directions.map(arr => arr.map(dir => [...dir]));

        // Apply Game of Life rules first
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cell = grid[row][col];
                let numNeighbors = 0;

                // Count neighbors
                for (let i = -1; i < 2; i++) {
                    for (let j = -1; j < 2; j++) {
                        if (i === 0 && j === 0) continue;
                        const x = col + j;
                        const y = row + i;
                        if (x >= 0 && x < cols && y >= 0 && y < rows) {
                            numNeighbors += grid[y][x];
                        }
                    }
                }

                // Apply Game of Life rules
                if (cell === 1 && (numNeighbors < 2 || numNeighbors > 3)) {
                    nextGrid[row][col] = 0; // Underpopulation or Overpopulation
                } else if (cell === 0 && numNeighbors === 3) {
                    nextGrid[row][col] = 1; // Reproduction
                }
                // Cells with exactly 2 or 3 neighbors and alive remain unchanged
            }
        }

        // Apply bounce effect after applying Game of Life rules
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (nextGrid[row][col] === 1) { // Only consider live cells for bouncing
                    if (row === 0 || row === rows - 1) {
                        nextDirections[row][col][0] *= -1; // Reverse vertical direction
                    }
                    if (col === 0 || col === cols - 1) {
                        nextDirections[row][col][1] *= -1; // Reverse horizontal direction
                    }

                    const newRow = row + nextDirections[row][col][0];
                    const newCol = col + nextDirections[row][col][1];

                    // If the cell can move, move it; otherwise, leave it where it is
                    if (newRow >= 0 && newRow < rows && newCol >= 0 && newCol < cols) {
                        nextGrid[newRow][newCol] = 1;
                        if (newRow !== row || newCol !== col) {
                            nextGrid[row][col] = 0;
                        }
                    }
                }
            }
        }

        return [nextGrid, nextDirections];
    }

    function animate() {
        if (running) {
            [grid, directions] = updateGrid(grid, directions);
            drawGrid(grid);

            // Introduce a delay based on the slider value before the next animation frame
            setTimeout(() => {
                requestAnimationFrame(animate);
            }, speed);
        }
    }

    drawGrid(grid);
});
