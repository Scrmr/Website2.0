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

    canvas.addEventListener('click', (event) => {
        const x = Math.floor(event.offsetX / resolution);
        const y = Math.floor(event.offsetY / resolution);
        grid[y][x] = grid[y][x] ? 0 : 1;
        drawGrid(grid);
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
        // Each cell direction will be represented as an array of [dy, dx]
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

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cell = grid[row][col];
                const [dy, dx] = directions[row][col];
                let numNeighbors = 0;

                // Count neighbors
                for (let i = -1; i < 2; i++) {
                    for (let j = -1; j < 2; j++) {
                        if (i === 0 && j === 0) {
                            continue;
                        }
                        const x = col + j;
                        const y = row + i;
                        if (x >= 0 && x < cols && y >= 0 && y < rows) {
                            numNeighbors += grid[y][x];
                        }
                    }
                }

                // Apply Game of Life rules
                if (cell === 1 && numNeighbors < 2) {
                    nextGrid[row][col] = 0;
                } else if (cell === 1 && numNeighbors > 3) {
                    nextGrid[row][col] = 0;
                } else if (cell === 0 && numNeighbors === 3) {
                    nextGrid[row][col] = 1;
                }

                // Bounce effect on edges
                if (cell === 1) {
                    if (row === 0 || row === rows - 1) {
                        nextDirections[row][col][0] *= -1; // Reverse vertical direction
                    }
                    if (col === 0 || col === cols - 1) {
                        nextDirections[row][col][1] *= -1; // Reverse horizontal direction
                    }

                    // Move the cell based on its direction
                    const newRow = row + nextDirections[row][col][0];
                    const newCol = col + nextDirections[row][col][1];

                    // If within bounds, move the cell
                    if (newRow >= 0 && newRow < rows && newCol >= 0 && newCol < cols) {
                        nextGrid[newRow][newCol] = 1;
                        nextGrid[row][col] = 0;
                    }
                }
            }
        }

        return [nextGrid, nextDirections];
    }

    function animate() {
        [grid, directions] = updateGrid(grid, directions);
        drawGrid(grid);
        if (running) {
            animationId = requestAnimationFrame(animate);
        }
    }

    drawGrid(grid);
});
