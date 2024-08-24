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
    let cellColor = '#000000'; // Default color

    // Event listeners for mouse interactions and color selection
    const speedSlider = document.getElementById('speedSlider');
    const colorPicker = document.getElementById('colorPicker');
    
    speedSlider.addEventListener('input', (event) => {
        speed = event.target.value;
    });

    colorPicker.addEventListener('input', (event) => {
        cellColor = event.target.value;
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
        drawGrid(grid);
    });

    function createGrid(rows, cols) {
        return new Array(rows).fill(null).map(() => new Array(cols).fill(0));
    }

    function drawGrid(grid) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cell = grid[row][col];
                ctx.fillStyle = cell ? cellColor : '#fff';
                ctx.fillRect(col * resolution, row * resolution, resolution, resolution);
                ctx.strokeRect(col * resolution, row * resolution, resolution, resolution);
            }
        }
    }

    function updateGrid(grid) {
        const nextGrid = grid.map(arr => [...arr]);

        // Apply Game of Life rules
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
                // Live cells with 2 or 3 neighbors remain unchanged
            }
        }

        return nextGrid;
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
