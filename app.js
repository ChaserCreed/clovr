import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
// Optional: OrbitControls for desktop debugging
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

console.log("app.js started");

// --- Configuration ---
const MOVEMENT_SPEED = 2.0; // units per second
const JUMP_VELOCITY = 5.0; // initial upward velocity
const GRAVITY = -9.8; // units per second squared

// --- Global Variables ---
let camera, scene, renderer;
let clock; // For delta time calculation
let player; // A THREE.Group representing the player's position/rig
let playerVelocity = new THREE.Vector3(); // For movement and gravity
let isJumping = false;
let onGround = false;

let controller1, controller2;
let controllerGrip1, controllerGrip2;
let controllerModelFactory; // For loading controller models
let handModelFactory; // For loading hand models

let gltfLoader; // For loading environment models
let environmentObjects = []; // To keep track of trees etc for potential interaction/collision
let floorMesh; // Reference to the ground

let infoElement; // To display messages

// --- Initialization ---
init();

async function init() {
    console.log("Inside init()");
    infoElement = document.getElementById('info');
    infoElement.style.display = 'block';
    infoElement.textContent = 'Setting up scene...';

    clock = new THREE.Clock();

    // Scene
    scene = new THREE.Scene();
    console.log("Scene created");

    // Camera (will be added to player group)
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 0); // Position relative to player group center
    console.log("Camera created");

    // Player Rig (Group) - Camera and controllers will be children of this
    player = new THREE.Group();
    player.position.set(0, 0, 5); // Initial starting position in the world
    player.add(camera); // Add camera to the player group
    scene.add(player);
    console.log("Player rig created");

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Softer ambient
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Stronger sun
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true; // Enable shadows
     // Shadow settings (can be tweaked for performance/quality)
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    scene.add(directionalLight);
    // const lightHelper = new THREE.DirectionalLightHelper(directionalLight); // Optional: Visualize light
    // scene.add(lightHelper);
    console.log("Lighting added");

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace; // Correct color space for textures/models
    renderer.shadowMap.enabled = true; // Enable shadows in the renderer
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
    console.log("Renderer created");

    if (document.body) {
        document.body.appendChild(renderer.domElement);
        console.log("Renderer DOM element appended");
    } else {
        console.error("document.body not found!");
        return; // Stop if body isn't ready
    }

    // Enable WebXR
    renderer.xr.enabled = true;
    // Crucially set the frame reference type for locomotion
    renderer.xr.setReferenceSpaceType('local-floor'); // Allows movement relative to floor level
    console.log("Renderer XR enabled");

    // VR Button
    const vrButtonContainer = document.getElementById('vr-button-container');
    if (vrButtonContainer) {
        const vrButton = VRButton.createButton(renderer);
        vrButtonContainer.appendChild(vrButton);
        console.log("VR Button created");
    } else {
        console.error("#vr-button-container not found!");
    }

    // Load Environment Assets (async)
    infoElement.textContent = 'Loading environment...';
    try {
        await loadEnvironment();
        console.log("Environment loaded successfully");
    } catch (error) {
        console.error("Failed to load environment:", error);
        infoElement.textContent = `Error loading environment: ${error.message}`;
        return; // Stop if environment fails
    }

    // Setup Controllers and Hand Tracking
    infoElement.textContent = 'Setting up controllers/hands...';
    setupControllers();
    console.log("Controllers/Hands setup initiated");

    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    console.log("Event listeners added");

    // Start the animation loop
    infoElement.textContent = 'Ready. Enter VR.';
    console.log("init() completed successfully");
    animate(); // Use the new animate function that calls setAnimationLoop
}

// --- Environment Loading ---
async function loadEnvironment() {
    gltfLoader = new GLTFLoader();

    // Skybox Loader
    const cubeTextureLoader = new THREE.CubeTextureLoader();
    const skyboxTexture = await cubeTextureLoader.setPath('skybox/').loadAsync([
        'px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'
    ]);
    scene.background = skyboxTexture;
    console.log("Skybox loaded");

    // Floor
    const textureLoader = new THREE.TextureLoader();
    const grassTexture = await textureLoader.loadAsync('grass.jpg');
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(20, 20); // Tile the texture
    const floorGeometry = new THREE.PlaneGeometry(50, 50); // Large floor
    const floorMaterial = new THREE.MeshStandardMaterial({
        map: grassTexture,
        side: THREE.DoubleSide // Render both sides (optional)
    });
    floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2; // Rotate flat
    floorMesh.position.y = 0; // Set at ground level
    floorMesh.receiveShadow = true; // Allow floor to receive shadows
    scene.add(floorMesh);
    console.log("Floor loaded");

    // Load Tree Model
    const treeData = await gltfLoader.loadAsync('tree.glb');
    const treeModel = treeData.scene;
    treeModel.scale.set(0.8, 0.8, 0.8); // Adjust scale if needed
    treeModel.traverse((node) => { // Ensure all parts of the tree cast shadows
        if (node.isMesh) {
            node.castShadow = true;
        }
    });
    console.log("Tree model loaded");

    // Scatter Trees
    const numberOfTrees = 30;
    const forestArea = 40; // Spread trees over this area dimension
    for (let i = 0; i < numberOfTrees; i++) {
        const treeInstance = treeModel.clone(); // Clone the loaded model
        const x = (Math.random() - 0.5) * forestArea;
        const z = (Math.random() - 0.5) * forestArea;
        treeInstance.position.set(x, 0, z); // Place on the ground (y=0)
        treeInstance.rotation.y = Math.random() * Math.PI * 2; // Random rotation
        scene.add(treeInstance);
        environmentObjects.push(treeInstance); // Add to list
    }
    console.log(`${numberOfTrees} trees scattered`);
}


// --- Controller and Hand Setup ---
function setupControllers() {
    controllerModelFactory = new XRControllerModelFactory();
    handModelFactory = new XRHandModelFactory();

    // --- Controller 1 ---
    controller1 = renderer.xr.getController(0);
    player.add(controller1); // Add controller to the player rig

    controller1.addEventListener('connected', (event) => {
        console.log("Controller 1 Connected:", event.data);
        addInputSourceModel(event.data, controller1);
        controller1.gamepad = event.data.gamepad; // Store gamepad reference
    });
    controller1.addEventListener('disconnected', (event) => {
        console.log("Controller 1 Disconnected");
        clearInputSourceModel(controller1);
        controller1.gamepad = null;
    });
    // Add listeners for buttons and joystick
    controller1.addEventListener('selectstart', onSelectStart); // Trigger
    controller1.addEventListener('selectend', onSelectEnd);
    controller1.addEventListener('squeezestart', onSqueezeStart); // Grip
    controller1.addEventListener('squeezeend', onSqueezeEnd);
    controller1.addEventListener('axeschanged', (event) => handleAxes(event, 0));

    // Grip Space 1 (for attaching controller model)
    controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
    player.add(controllerGrip1); // Add grip to the player rig

    // Hand Model 1
    const hand1 = renderer.xr.getHand(0);
    // hand1.add(handModelFactory.createHandModel(hand1, "mesh")); // Load "mesh" style hands
    const handModel1 = handModelFactory.createHandModel(hand1, "mesh");
    hand1.add(handModel1); // Make the model a child of the hand tracking space
    player.add(hand1); // Add hand tracking space to the player rig


    // --- Controller 2 ---
    controller2 = renderer.xr.getController(1);
    player.add(controller2);

    controller2.addEventListener('connected', (event) => {
        console.log("Controller 2 Connected:", event.data);
        addInputSourceModel(event.data, controller2);
        controller2.gamepad = event.data.gamepad;
    });
    controller2.addEventListener('disconnected', (event) => {
        console.log("Controller 2 Disconnected");
        clearInputSourceModel(controller2);
        controller2.gamepad = null;
    });
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('selectend', onSelectEnd);
    controller2.addEventListener('squeezestart', onSqueezeStart);
    controller2.addEventListener('squeezeend', onSqueezeEnd);
    controller2.addEventListener('axeschanged', (event) => handleAxes(event, 1));

    // Grip Space 2
    controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
    player.add(controllerGrip2);

    // Hand Model 2
    const hand2 = renderer.xr.getHand(1);
    // hand2.add(handModelFactory.createHandModel(hand2, "mesh"));
    const handModel2 = handModelFactory.createHandModel(hand2, "mesh");
    hand2.add(handModel2);
    player.add(hand2);
}

// --- Helper functions to manage models based on input source ---
// (These are simplified - real-world might need more checks)

function addInputSourceModel(inputSource, controllerObject) {
    // Clear any existing model first
    clearInputSourceModel(controllerObject);

    if (inputSource && inputSource.targetRayMode === 'tracked-pointer') {
         // Likely a controller, find the corresponding grip space and add model
         const gripSpace = (controllerObject === controller1) ? controllerGrip1 : controllerGrip2;
         if (gripSpace) {
             console.log(`Attaching controller model to ${controllerObject === controller1 ? 'Grip 1' : 'Grip 2'}`);
             const model = controllerModelFactory.createControllerModel(gripSpace);
             gripSpace.add(model); // Add model to the grip space object
             gripSpace.visible = true;
             // Hide the corresponding hand model if the controller is active
             const handSpace = (controllerObject === controller1) ? renderer.xr.getHand(0) : renderer.xr.getHand(1);
             if (handSpace) handSpace.visible = false;
         }
    } else if (inputSource && inputSource.hand) {
        // Likely hand tracking
        console.log(`Activating hand model for ${controllerObject === controller1 ? 'Hand 1' : 'Hand 2'}`);
        const handSpace = (controllerObject === controller1) ? renderer.xr.getHand(0) : renderer.xr.getHand(1);
        if (handSpace) {
            handSpace.visible = true;
             // Ensure corresponding controller model is hidden
            const gripSpace = (controllerObject === controller1) ? controllerGrip1 : controllerGrip2;
             if (gripSpace) gripSpace.visible = false;
        }
    } else {
         console.log("Input source connected, but type unclear (neither controller nor hand?)");
         // Hide both by default if unsure
         const gripSpace = (controllerObject === controller1) ? controllerGrip1 : controllerGrip2;
         const handSpace = (controllerObject === controller1) ? renderer.xr.getHand(0) : renderer.xr.getHand(1);
         if (gripSpace) gripSpace.visible = false;
         if (handSpace) handSpace.visible = false;
    }
}

function clearInputSourceModel(controllerObject) {
    console.log(`Clearing models for ${controllerObject === controller1 ? 'Controller/Hand 1' : 'Controller/Hand 2'}`);
    // Find associated grip and hand spaces
    const gripSpace = (controllerObject === controller1) ? controllerGrip1 : controllerGrip2;
    const handSpace = (controllerObject === controller1) ? renderer.xr.getHand(0) : renderer.xr.getHand(1);

    // Clear controller model children from grip space
    if (gripSpace) {
        while (gripSpace.children.length > 0) {
            gripSpace.remove(gripSpace.children[0]);
        }
         gripSpace.visible = false; // Hide grip space as well
    }
    // Just hide the hand space (model is managed internally by factory/XRHand)
    if (handSpace) {
        handSpace.visible = false;
    }
}

// --- Event Handlers ---
function onWindowResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        console.log("Window resized");
    }
}

function onSelectStart(event) {
    // Trigger: Use for Jumping
    console.log("Select Start (Trigger)");
    if (onGround) {
        console.log("Attempting Jump");
        playerVelocity.y = JUMP_VELOCITY;
        isJumping = true;
        onGround = false;
    }
}

function onSelectEnd(event) {
    console.log("Select End (Trigger)");
    // Optional: Do something on trigger release
}

function onSqueezeStart(event) {
    console.log("Squeeze Start (Grip)");
    // Optional: Use grip for interactions (grabbing, etc.)
    // Example: Briefly change ambient light color
    scene.children.forEach(child => {
        if (child.isAmbientLight) {
            child.originalColor = child.color.getHex();
            child.color.setHex(0xffaa00); // Orange pulse
        }
    });
}

function onSqueezeEnd(event) {
    console.log("Squeeze End (Grip)");
    // Optional: Revert grip action
    scene.children.forEach(child => {
        if (child.isAmbientLight && child.originalColor !== undefined) {
            child.color.setHex(child.originalColor);
        }
    });
}

const deadZone = 0.15; // Ignore small joystick movements
let moveForward = 0;
let moveRight = 0;

function handleAxes(event, controllerIndex) {
    // Typically axes 2 and 3 are the thumbstick X and Y
    if (event.axes.length >= 4) {
        const stickX = event.axes[2];
        const stickY = event.axes[3]; // Usually negative is forward

        // Apply deadzone
        const effectiveX = Math.abs(stickX) > deadZone ? stickX : 0;
        const effectiveY = Math.abs(stickY) > deadZone ? stickY : 0;

        // If this is the primary movement controller (e.g., left controller, index 0)
        if (controllerIndex === 0) {
            moveForward = -effectiveY; // Forward/Backward
            moveRight = effectiveX;    // Strafe Left/Right
        }

        // Could use the other controller's stick (index 1) for turning if desired
        // if (controllerIndex === 1) { ... handle turning ... }

    } else {
        // Reset movement if axes aren't what we expect
        if (controllerIndex === 0) {
             moveForward = 0;
             moveRight = 0;
        }
    }
}

// --- Game Loop ---
function animate() {
    renderer.setAnimationLoop(render); // Use the renderer's loop for WebXR compatibility
}

function render(timestamp, frame) { // timestamp and frame are provided by WebXR
    const delta = clock.getDelta(); // Time since last frame in seconds

    // Handle Player Movement based on joystick input
    handleMovement(delta);

    // Apply basic physics (gravity, ground collision)
    updatePhysics(delta);

    // Update hand models (if hand tracking is active, done automatically by THREE?)
    // You might need manual updates depending on the Three.js version and how hands are set up
    // if (handModelFactory) { ... } // Check if needed

    // Render the scene
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    } else {
        console.warn("Skipping render - renderer, scene, or camera not ready.");
    }
}

// --- Movement and Physics ---
const tempVector = new THREE.Vector3();
const forwardDirection = new THREE.Vector3();
const rightDirection = new THREE.Vector3();

function handleMovement(delta) {
    if (!renderer.xr.isPresenting || (moveForward === 0 && moveRight === 0)) {
        return; // Only move when in VR and joystick is moved
    }

    // Get player's horizontal forward direction
    player.getWorldDirection(forwardDirection);
    forwardDirection.y = 0; // Keep movement horizontal
    forwardDirection.normalize();

    // Calculate right direction (cross product of forward and up)
    rightDirection.crossVectors(player.up, forwardDirection).normalize(); // Use player's up

    // Calculate movement vector based on joystick input and directions
    tempVector.set(0,0,0); // Reset temporary vector
    tempVector.addScaledVector(forwardDirection, moveForward * MOVEMENT_SPEED * delta);
    tempVector.addScaledVector(rightDirection, moveRight * MOVEMENT_SPEED * delta);

    // Apply movement to the player group
    player.position.add(tempVector);
}

function updatePhysics(delta) {
    // Apply gravity if not on the ground
    if (!onGround) {
        playerVelocity.y += GRAVITY * delta;
    }

    // Update player position based on velocity
    player.position.y += playerVelocity.y * delta;

    // Simple ground collision detection
    const groundLevel = 0.5; // Player 'feet' level relative to player group origin (adjust as needed)
    if (player.position.y < groundLevel) {
        player.position.y = groundLevel; // Place player exactly on ground
        playerVelocity.y = 0; // Stop vertical movement
        onGround = true;
        isJumping = false;
        // console.log("Landed"); // Optional debug
    } else {
        onGround = false; // Player is in the air if above ground level
    }
}

console.log("app.js finished initial execution");
