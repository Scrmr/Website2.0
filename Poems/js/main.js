// Create the scene
const scene = new THREE.Scene();

// Create a camera (FOV, Aspect Ratio, Near Clipping, Far Clipping)
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// Create a WebGL renderer
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);

// Add the renderer to the document body
document.body.appendChild(renderer.domElement);

// Create a box geometry (width, height, depth)
const geometry = new THREE.BoxGeometry(1, 1, 1);

// Create a cube with better material
const material = new THREE.MeshStandardMaterial({ 
    color: 0x00ff00, 
    roughness: 0.4,
    metalness: 0.6
});

// Add ambient light (soft general lighting)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// Add point light (more focused light)
const pointLight = new THREE.PointLight(0xffffff, 1);
pointLight.position.set(5, 5, 5);
scene.add(pointLight);

// Create a mesh by combining geometry and material
const cube = new THREE.Mesh(geometry, material);

// Add the cube to the scene
scene.add(cube);

// Set camera position
camera.position.z = 5;

// Animation function
function animate() {
    requestAnimationFrame(animate);

    // Rotate the cube (change these values to adjust rotation speed)
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;

    // Render the scene from the camera's perspective
    renderer.render(scene, camera);
}

// Start the animation loop
animate();

// Update camera aspect ratio and renderer size on window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Add orbit controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);

// GSAP Animation for Poem Lines
function animatePoem() {
    const lines = document.querySelectorAll('.line');
    gsap.fromTo(lines, {opacity: 0, y: 50}, {
        opacity: 1, 
        y: 0, 
        stagger: 0.3, 
        duration: 1.5, 
        ease: "power3.out"
    });
}

// Function to handle cube click and display a random poem
function displayRandomPoem() {
    const poems = [
        [
            '"The woods are lovely, dark and deep,"',
            '"But I have promises to keep,"',
            '"And miles to go before I sleep,"',
            '"And miles to go before I sleep."'
        ],
        [
            '"Do not go gentle into that good night,"',
            '"Old age should burn and rave at close of day;"',
            '"Rage, rage against the dying of the light."'
        ],
        [
            '"Hope is the thing with feathers,"',
            '"That perches in the soul,"',
            '"And sings the tune without the words,"',
            '"And never stops at all,"'
        ]
    ];

    const randomPoem = poems[Math.floor(Math.random() * poems.length)];
    const poemContainer = document.getElementById('poem-lines');
    poemContainer.innerHTML = randomPoem.map(line => `<div class="line">${line}</div>`).join('');
    animatePoem();
}

// Add click event listener to the cube
renderer.domElement.addEventListener('click', (event) => {
    // Calculate mouse position in normalized device coordinates (-1 to +1) for both components.
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

    // Raycasting to determine if the cube is clicked
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(cube);
    if (intersects.length > 0) {
        displayRandomPoem();
    }
});