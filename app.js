import * as THREE from 'three'; // CORRECT
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { MapTiles } from '@googlemaps/three'; // Import the MapTiles class

// -----------------------------------------------------------------------------
// IMPORTANT: PASTE YOUR GOOGLE MAPS API KEY HERE!
// -----------------------------------------------------------------------------
// Obtain a key from https://developers.google.com/maps/documentation/javascript/get-api-key
// and ensure the "Map Tiles API" is enabled in your Google Cloud Project.
const MAPS_API_KEY = "AIzaSyA5FhS5LMbAbhI0tYHt3fZev_PS0YCiVFE"; // <--- PASTE YOUR KEY HERE (KEEP IT QUOTED)
// -----------------------------------------------------------------------------

// --- Configuration ---
const MOVEMENT_SPEED = 3.0; // meters per second
const JUMP_VELOCITY = 6.0; // initial upward velocity in m/s
const GRAVITY = -9.8; // meters per second squared
const CAMERA_FAR_PLANE = 5000; // Need a large view distance for maps

// --- Global Variables ---
let camera, scene, renderer;
let vrButton;
let controller1, controller2;
let controllerGrip1, controllerGrip2;
let controllerModelFactory; // To load controller models
let mapTiles; // Instance of the Google Map Tiles
let clock; // For delta time calculation

// Player movement variables
const playerVelocity = new THREE.Vector3();
let isJumping = false;
const playerHeight = 0.5; // Approximate height of player capsule/camera above ground collision point
const playerPositionHelper = new THREE.Object3D(); // Use a helper to easily move the XR rig

// Raycasting for ground detection
let groundRaycaster;
const downVector = new THREE.Vector3(0, -1, 0);

// Check for API Key and initialize
if (!MAPS_API_KEY) {
    console.error("API Key is missing. Please set MAPS_API_KEY in app.js");
    const promptElement = document.getElementById('api-key-prompt');
    if (promptElement) promptElement.style.display = 'block';
    // Optionally, throw an error or prevent further initialization
    // throw new Error("Google Maps API Key is required.");
} else {
    document.addEventListener('DOMContentLoaded', () => {
        console.log("DOM Content Loaded");
        try {
            init();
            console.log("init() completed successfully");
            animate(); // Start the animation loop
            console.log("animate() called, render loop should start");
        } catch (error) {
            console.error("Error during init() or animate():", error);
            displayError("Initialization Error: " + error.message + '\n' + error.stack);
        }
    });
}

// --- Initialization ---
function init() {
    console.log("Inside init()");

    clock = new THREE.Clock(); // Initialize clock

    // Scene
    scene = new THREE.Scene();
    // Use a light sky blue background, or potentially a skybox later
    scene.background = new THREE.Color(0x87CEEB);
    console.log("Scene created");

    // Camera (will be managed by WebXR session, but set up initial properties)
    // Increased far plane for viewing distance
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, CAMERA_FAR_PLANE);
    // Initial position - we'll move the playerPositionHelper later
    camera.position.set(0, playerHeight, 0); // Start slightly above origin
    console.log("Camera created");

    // Move the camera rig (XROrigin) using the helper
    playerPositionHelper.add(camera); // Add camera to the helper
    playerPositionHelper.position.set(0, 100, 0); // Start high up initially, will be set by map load
    scene.add(playerPositionHelper); // Add the helper (containing camera) to the scene

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // More ambient light
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7); // Slightly less intense directional
    directionalLight.position.set(50, 100, 50); // Position light higher up
    // Optional: Add shadows if needed, but can impact performance with tiles
    // directionalLight.castShadow = true;
    scene.add(directionalLight);
    console.log("Lighting added");

    // Remove the old cube and floor
    // scene.remove(...) // If they were added previously

    // --- Google Maps 3D Tiles ---
    if (MAPS_API_KEY) {
        mapTiles = new MapTiles(MAPS_API_KEY);
        mapTiles.mesh.name = "MapTilesMesh"; // Name for raycasting checks

        // Set coordinates to somewhere in France (Eiffel Tower, Paris)
        // Latitude, Longitude - IMPORTANT: API expects these
        const LATITUDE = 48.8584;
        const LONGITUDE = 2.2945;

        mapTiles.setCoordinates(LATITUDE, LONGITUDE);
        console.log(`Map Tiles centered at Lat: ${LATITUDE}, Lon: ${LONGITUDE}`);

        // Adjust player position based on the map's center - Y value needs testing/adjustment
        // The `mesh.position` of mapTiles is usually centered at the world origin (0,0,0) after setCoordinates.
        // We want the player to start near the coordinates we set.
        // Since the map is at (0,0,0), we start the player slightly above (0,0,0) relative to the map center.
        playerPositionHelper.position.set(0, playerHeight, 5); // Start slightly above ground, a few meters back

        scene.add(mapTiles.mesh); // Add the map tiles mesh group to the scene
        console.log("Map Tiles added to scene");
    }

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    // Required for Photorealistic Tiles color space
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    console.log("Renderer created");

    // Append Renderer Canvas to Body
    if (document.body) {
        document.body.appendChild(renderer.domElement);
        console.log("Renderer DOM element appended to body");
    } else {
        console.error("document.body not found when trying to append renderer!");
        throw new Error("Document body not available for renderer.");
    }

    // Enable WebXR
    renderer.xr.enabled = true;
    // Set the reference space for player movement relative to the floor
    // renderer.xr.setReferenceSpaceType('local-floor'); // Recommended for locomotion
    console.log("Renderer XR enabled");

    // VR Button
    const vrButtonContainer = document.getElementById('vr-button-container');
    if (vrButtonContainer) {
        vrButton = VRButton.createButton(renderer);
        vrButtonContainer.appendChild(vrButton);
        console.log("VR Button created and appended");
    } else {
        console.error("#vr-button-container not found!");
    }

    // --- Controllers & Models ---
    controllerModelFactory = new XRControllerModelFactory();

    // Controller 1 (Left)
    controller1 = renderer.xr.getController(0);
    controller1.name = "ControllerLeft";
    // controller1.addEventListener('selectstart', onSelectStart); // Keep if needed
    // controller1.addEventListener('selectend', onSelectEnd);
    // Use connected event to add model when controller is detected
    controller1.addEventListener('connected', (event) => {
        console.log("Controller 1 connected:", event.data);
        addControllerModel(controller1, event.data.handedness || 'left'); // Pass handedness if available
    });
    controller1.addEventListener('disconnected', () => {
        console.log("Controller 1 disconnected");
        removeControllerModel(controller1);
    });
    playerPositionHelper.add(controller1); // Add controller to player helper so it moves with player

    // Controller Grip 1 (Left) - For attaching the model
    controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.name = "ControllerGripLeft";
    // We add the model via the factory, not BoxLineGeometry anymore
    // controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1)); // Old way, factory handles this now
    playerPositionHelper.add(controllerGrip1); // Add grip to player helper

    // Controller 2 (Right)
    controller2 = renderer.xr.getController(1);
    controller2.name = "ControllerRight";
    // controller2.addEventListener('selectstart', onSelectStart); // Keep if needed
    // controller2.addEventListener('selectend', onSelectEnd);
    controller2.addEventListener('connected', (event) => {
        console.log("Controller 2 connected:", event.data);
        addControllerModel(controller2, event.data.handedness || 'right'); // Pass handedness
    });
    controller2.addEventListener('disconnected', () => {
        console.log("Controller 2 disconnected");
        removeControllerModel(controller2);
    });
    playerPositionHelper.add(controller2); // Add controller to player helper

    // Controller Grip 2 (Right) - For attaching the model
    controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.name = "ControllerGripRight";
    // controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2)); // Old way
    playerPositionHelper.add(controllerGrip2); // Add grip to player helper

    console.log("Controllers setup, waiting for connection...");


    // Ground detection Raycaster
    groundRaycaster = new THREE.Raycaster();
    groundRaycaster.far = playerHeight + 0.1; // Only check slightly below the player feet position


    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    console.log("Event listeners added");
}

// --- Controller Model Handling ---
function addControllerModel(controller, handedness) {
    // Find the corresponding grip
    const grip = (controller === controller1) ? controllerGrip1 : controllerGrip2;
    if (grip) {
        console.log(`Adding model to ${handedness} grip:`, grip);
        removeControllerModel(grip); // Remove existing model first if any
        const model = controllerModelFactory.createControllerModel(grip);
        model.name = `ControllerModel_${handedness}`;
        grip.add(model); // Add the loaded model to the grip space
    } else {
         console.warn("Could not find grip for controller to add model.");
    }
}

function removeControllerModel(controllerOrGrip) {
    let modelFound = false;
    for (let i = controllerOrGrip.children.length - 1; i >= 0; i--) {
        const child = controllerOrGrip.children[i];
        // Identify models created by the factory (they often have specific names or structures)
        // Or simply remove any child that isn't the pointer line etc. A simple name check works here.
        if (child.name.startsWith('ControllerModel_')) {
            console.log("Removing existing model:", child.name);
            controllerOrGrip.remove(child);
            modelFound = true;
        }
    }
    if(modelFound) console.log("Model removed from:", controllerOrGrip.name);
}


// --- Window Resize ---
function onWindowResize() {
    console.log("Window resized");
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// --- Input Handling ---
function handleControllerInput(controller, delta, xrFrame) {
    if (!controller || !controller.gamepad) return; // Check if controller and gamepad exist

    const gamepad = controller.gamepad;
    const handedness = controller.name === "ControllerLeft" ? 'left' : 'right'; // Simple check

    // --- Locomotion (using Left Stick typically) ---
    if (handedness === 'left' && gamepad.axes.length >= 2) {
        const stickX = gamepad.axes[2]; // Index 2 is usually horizontal axis for thumbstick
        const stickY = gamepad.axes[3]; // Index 3 is usually vertical axis for thumbstick

        // Get camera direction (ignore vertical component)
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection); // Gets direction camera is facing
        cameraDirection.y = 0; // Project onto XZ plane
        cameraDirection.normalize();

        // Calculate forward and right vectors relative to camera
        const forward = cameraDirection;
        const right = new THREE.Vector3().crossVectors(camera.up, forward).normalize(); // Calculate right vector

        // Calculate movement direction based on stick input and camera orientation
        const moveDirection = new THREE.Vector3();
        moveDirection.addScaledVector(forward, -stickY); // Forward/Backward based on Y stick
        moveDirection.addScaledVector(right, stickX);    // Left/Right based on X stick
        moveDirection.normalize(); // Ensure consistent speed regardless of direction

        // Apply movement to player's horizontal velocity
        if (moveDirection.lengthSq() > 0.01) { // Add deadzone check
             playerVelocity.x = moveDirection.x * MOVEMENT_SPEED;
             playerVelocity.z = moveDirection.z * MOVEMENT_SPEED;
        } else {
             playerVelocity.x = 0;
             playerVelocity.z = 0;
        }
    }

    // --- Jumping (using Right 'A' Button typically) ---
    // Button mapping: Index 4 is often 'A' or 'X' button on Quest controllers
    const JUMP_BUTTON_INDEX = 4;
    if (handedness === 'right' && gamepad.buttons.length > JUMP_BUTTON_INDEX) {
        const jumpButton = gamepad.buttons[JUMP_BUTTON_INDEX];
        if (jumpButton.pressed && !isJumping) {
            playerVelocity.y = JUMP_VELOCITY; // Apply upward velocity
            isJumping = true; // Set jumping flag
            console.log("Jump!");
        }
    }
}

// --- Physics and Update Logic ---
function update(delta, xrFrame) {
    // Handle Input from both controllers
    handleControllerInput(controller1, delta, xrFrame);
    handleControllerInput(controller2, delta, xrFrame);

    // Apply Gravity
    playerVelocity.y += GRAVITY * delta;

    // Update Player Position based on velocity
    // Use camera's quaternion to ensure movement is relative to world orientation
    const deltaPosition = playerVelocity.clone().multiplyScalar(delta);
    playerPositionHelper.position.add(deltaPosition);


    // --- Ground Collision ---
    let groundDetected = false;
    if (mapTiles && mapTiles.mesh) { // Make sure map tiles exist
         // Set raycaster origin slightly above the player's base position
        const rayOrigin = playerPositionHelper.position.clone();
        // rayOrigin.y += playerHeight; // Start ray from head - maybe not ideal, start lower?
        // Or just use playerPositionHelper.position, assuming it's the base

        groundRaycaster.set(rayOrigin, downVector);

        // Check for intersections ONLY with the map tiles mesh
        const intersects = groundRaycaster.intersectObject(mapTiles.mesh, true); // Check recursively

        if (intersects.length > 0) {
            const groundY = intersects[0].point.y; // Y coordinate of the ground hit point
            const targetY = groundY + playerHeight; // Target Y for the player helper base

            // Snap to ground if falling onto it or very close
            if (playerPositionHelper.position.y <= targetY + 0.1) { // Add small tolerance
                 playerPositionHelper.position.y = targetY;
                 playerVelocity.y = 0; // Stop falling
                 isJumping = false; // Landed
                 groundDetected = true;
                // console.log("Ground detected at Y:", groundY, "Player snapped to:", targetY);
            }
        }
    }

     // Prevent falling infinitely if no ground detected immediately below
    const MIN_Y_LEVEL = -200; // Define a minimum world Y level
    if (!groundDetected && playerPositionHelper.position.y < MIN_Y_LEVEL) {
         playerPositionHelper.position.y = MIN_Y_LEVEL;
         playerVelocity.y = 0;
         isJumping = false; // Consider landing if hitting the safety floor
         console.log("Hit minimum Y level safety floor.");
    }


    // Update Map Tiles (LOD streaming) - CRITICAL
    if (mapTiles) {
        // Use the actual camera world position for tile updates
        const cameraWorldPosition = new THREE.Vector3();
        camera.getWorldPosition(cameraWorldPosition);
        mapTiles.update(cameraWorldPosition); // Update tiles based on camera position
    }

     // Log player position periodically for debugging
    if (clock.elapsedTime % 5 < delta) { // Log approx every 5 seconds
        console.log(`Player Pos: X=${playerPositionHelper.position.x.toFixed(2)}, Y=${playerPositionHelper.position.y.toFixed(2)}, Z=${playerPositionHelper.position.z.toFixed(2)}`);
    }
}


// --- Animation Loop ---
function animate() {
    renderer.setAnimationLoop(render); // Use XR compatible loop
}

function render(timestamp, frame) { // Receives timestamp and XRFrame
    const delta = clock.getDelta(); // Get time difference since last frame

    // Update game state (physics, input, map tiles)
    if (renderer.xr.isPresenting && frame) { // Only update physics/input when in VR and frame is available
         update(delta, frame);
    } else if (!renderer.xr.isPresenting) {
        // Optional: Add basic keyboard/mouse controls for desktop testing here
        // update(delta, null); // Or disable updates outside VR?
    }


    // Render the scene
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    } else {
        console.warn("Skipping render - renderer, scene, or camera not ready.");
    }
}

// --- Utility Functions ---
function displayError(message) {
    let errorDiv = document.getElementById('runtime-error');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'runtime-error';
        errorDiv.style.position = 'absolute';
        errorDiv.style.bottom = '10px'; // Position at bottom
        errorDiv.style.left = '10px';
        errorDiv.style.color = 'red';
        errorDiv.style.backgroundColor = 'white';
        errorDiv.style.padding = '10px';
        errorDiv.style.zIndex = '1000';
        errorDiv.style.fontFamily = 'monospace';
        errorDiv.style.maxHeight = '150px';
        errorDiv.style.overflowY = 'scroll';
        errorDiv.style.whiteSpace = 'pre-wrap'; // Preserve line breaks
        document.body.appendChild(errorDiv);
    }
    errorDiv.textContent = message;
    errorDiv.style.display = 'block'; // Make sure it's visible
}

console.log("app.js finished initial execution");
