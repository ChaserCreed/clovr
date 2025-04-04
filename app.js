// Ensure this line is correct
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
// Ensure this import matches the key in the importmap
import { MapTiles } from '@googlemaps/three';

// -----------------------------------------------------------------------------
// IMPORTANT: PASTE YOUR GOOGLE MAPS API KEY HERE!
// ***DOUBLE CHECK THIS KEY IS CORRECT AND HAS Map Tiles API ENABLED***
// -----------------------------------------------------------------------------
const MAPS_API_KEY = "AIzaSyA5FhS5LMbAbhI0tYHt3fZev_PS0YCiVFE"; // <--- PASTE YOUR KEY HERE
// -----------------------------------------------------------------------------

// --- Configuration ---
const MOVEMENT_SPEED = 3.0;
const JUMP_VELOCITY = 6.0;
const GRAVITY = -9.8;
const CAMERA_FAR_PLANE = 5000;

// --- Global Variables ---
let camera, scene, renderer;
let vrButton;
let controller1, controller2;
let controllerGrip1, controllerGrip2;
let controllerModelFactory;
let mapTiles;
let clock;

const playerVelocity = new THREE.Vector3();
let isJumping = false;
const playerHeight = 0.5;
const playerPositionHelper = new THREE.Object3D(); // Player rig base

let groundRaycaster;
const downVector = new THREE.Vector3(0, -1, 0);

// Check for API Key and initialize
if (!MAPS_API_KEY) {
    console.error("API Key is missing. Please set MAPS_API_KEY in app.js");
    const promptElement = document.getElementById('api-key-prompt');
    if (promptElement) promptElement.style.display = 'block';
    // Stop execution if key is missing
    // throw new Error("Google Maps API Key is required.");
} else {
    document.addEventListener('DOMContentLoaded', () => {
        console.log("DOM Content Loaded");
        // Hide API prompt if key is present
        const promptElement = document.getElementById('api-key-prompt');
        if (promptElement) promptElement.style.display = 'none';

        try {
            init();
            console.log("init() completed successfully");
            animate();
            console.log("animate() called, render loop should start");
        } catch (error) {
            console.error("Error during init() or animate():", error);
            displayError("Initialization Error: " + error.message + '\n' + error.stack);
        }
    });
}

function init() {
    console.log("Inside init()");
    clock = new THREE.Clock();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    // Set scene UP direction (important for some calculations)
    scene.up.set(0, 1, 0);
    console.log("Scene created");

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, CAMERA_FAR_PLANE);
    camera.position.set(0, playerHeight, 0); // Position camera relative to the player helper base
    console.log("Camera created");

    // Player rig setup
    playerPositionHelper.add(camera); // Attach camera to the moving helper
    // Initial position will be set relative to map center later if map loads
    playerPositionHelper.position.set(0, 100, 5); // Start higher up, slightly back
    scene.add(playerPositionHelper);
    console.log("Player helper added to scene");


    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
    directionalLight.position.set(50, 100, 50);
    scene.add(directionalLight);
    console.log("Lighting added");

    // --- Google Maps 3D Tiles ---
    // This section only runs if API key is provided
    mapTiles = new MapTiles(MAPS_API_KEY);
    mapTiles.mesh.name = "MapTilesMesh";

    const LATITUDE = 48.8584; // Eiffel Tower
    const LONGITUDE = 2.2945;
    mapTiles.setCoordinates(LATITUDE, LONGITUDE);
    console.log(`Map Tiles centering at Lat: ${LATITUDE}, Lon: ${LONGITUDE}`);

    // Set player start position relative to map center (which is at world 0,0,0)
    playerPositionHelper.position.set(0, playerHeight + 20, 15); // Start ~20m above ground, 15m back

    scene.add(mapTiles.mesh);
    console.log("Map Tiles added to scene");


    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    console.log("Renderer created");

    if (document.body) {
        document.body.appendChild(renderer.domElement);
        console.log("Renderer DOM element appended");
    } else {
        throw new Error("Document body not available for renderer.");
    }

    renderer.xr.enabled = true;
    console.log("Renderer XR enabled");

    const vrButtonContainer = document.getElementById('vr-button-container');
    if (vrButtonContainer) {
        vrButton = VRButton.createButton(renderer);
        vrButtonContainer.appendChild(vrButton);
        console.log("VR Button created");
    } else {
        console.warn("#vr-button-container not found!");
    }

    // --- Controllers & Models ---
    controllerModelFactory = new XRControllerModelFactory();

    // Controller 1 (Left)
    controller1 = renderer.xr.getController(0);
    controller1.name = "ControllerLeft";
    controller1.addEventListener('connected', (event) => handleControllerConnection(controller1, event));
    controller1.addEventListener('disconnected', () => handleControllerDisconnection(controller1));
    playerPositionHelper.add(controller1); // Add to player rig

    controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.name = "ControllerGripLeft";
    playerPositionHelper.add(controllerGrip1); // Add to player rig

    // Controller 2 (Right)
    controller2 = renderer.xr.getController(1);
    controller2.name = "ControllerRight";
    controller2.addEventListener('connected', (event) => handleControllerConnection(controller2, event));
    controller2.addEventListener('disconnected', () => handleControllerDisconnection(controller2));
    playerPositionHelper.add(controller2); // Add to player rig

    controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.name = "ControllerGripRight";
    playerPositionHelper.add(controllerGrip2); // Add to player rig

    console.log("Controllers setup, waiting for connection...");

    // Ground detection Raycaster
    groundRaycaster = new THREE.Raycaster();
    // Raycaster setup moved to update loop for clarity, using player base position

    window.addEventListener('resize', onWindowResize);
    console.log("Event listeners added");
}

// --- Controller Connection Handling ---
function handleControllerConnection(controller, event) {
    console.log(`Controller ${controller.name} connected:`, event.data);
    const handedness = event.data.handedness || (controller === controller1 ? 'left' : 'right');
    const grip = (controller === controller1) ? controllerGrip1 : controllerGrip2;

    if (grip) {
        console.log(`Attaching model to ${handedness} grip`);
        removeControllerModel(grip); // Clean up previous model if any
        const model = controllerModelFactory.createControllerModel(grip);
        model.name = `ControllerModel_${handedness}`;
        grip.add(model);
    } else {
        console.warn(`Grip not found for ${controller.name}`);
    }
}

function handleControllerDisconnection(controller) {
     console.log(`Controller ${controller.name} disconnected`);
     const grip = (controller === controller1) ? controllerGrip1 : controllerGrip2;
     if (grip) {
        removeControllerModel(grip);
     }
}

function removeControllerModel(grip) {
    if (!grip) return;
    for (let i = grip.children.length - 1; i >= 0; i--) {
        const child = grip.children[i];
        if (child.name.startsWith('ControllerModel_')) {
            console.log("Removing model:", child.name);
            grip.remove(child);
        }
    }
}

function onWindowResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        console.log("Resized window");
    }
}

// --- Input Handling ---
function handleControllerInput(controller, delta) {
    if (!controller || !controller.gamepad) return;

    const gamepad = controller.gamepad;
    const handedness = (controller === controller1) ? 'left' : 'right';

    // Locomotion (Left Stick)
    if (handedness === 'left' && gamepad.axes.length >= 4) {
        const stickX = gamepad.axes[2];
        const stickY = gamepad.axes[3];
        const deadzone = 0.1;

        // Get camera's horizontal rotation
        const cameraQuaternion = new THREE.Quaternion();
        camera.getWorldQuaternion(cameraQuaternion); // Get world rotation of camera

        // Create movement vector based on stick input (forward/backward, left/right)
        // Note: Stick Y is often inverted (up is negative)
        const move = new THREE.Vector3(stickX, 0, stickY); // Z is forward/back

        // Apply deadzone
        if (move.lengthSq() < deadzone * deadzone) {
            move.set(0, 0, 0);
        }

        // Rotate movement vector by camera's horizontal rotation only
        const cameraEuler = new THREE.Euler().setFromQuaternion(cameraQuaternion, 'YXZ'); // Use YXZ order
        cameraEuler.x = 0; // Ignore pitch
        cameraEuler.z = 0; // Ignore roll
        move.applyEuler(cameraEuler); // Rotate the move vector

        // Apply movement speed to player velocity
        playerVelocity.x = move.x * MOVEMENT_SPEED;
        playerVelocity.z = move.z * MOVEMENT_SPEED;

    } else if (handedness === 'left') {
        // No stick input or controller doesn't have enough axes, stop horizontal movement
        playerVelocity.x = 0;
        playerVelocity.z = 0;
    }

    // Jumping (Right 'A' Button - Index 4)
    const JUMP_BUTTON_INDEX = 4;
    if (handedness === 'right' && gamepad.buttons.length > JUMP_BUTTON_INDEX) {
        const jumpButton = gamepad.buttons[JUMP_BUTTON_INDEX];
        if (jumpButton.pressed && !isJumping) {
            playerVelocity.y = JUMP_VELOCITY;
            isJumping = true;
            console.log("Jump!");
        }
    }
}


// --- Physics and Update Logic ---
function update(delta, xrFrame) {
    // Handle Input
    handleControllerInput(controller1, delta);
    handleControllerInput(controller2, delta);

    // Apply Gravity
    if (isJumping) { // Only apply gravity if in the air
        playerVelocity.y += GRAVITY * delta;
    }

    // --- Ground Collision ---
    let groundDetected = false;
    if (mapTiles && mapTiles.mesh && mapTiles.mesh.children.length > 0) { // Ensure map mesh has loaded children
        const rayOrigin = playerPositionHelper.position; // Ray starts from player base
        groundRaycaster.set(rayOrigin, downVector);
        groundRaycaster.far = playerHeight + Math.abs(playerVelocity.y * delta) + 0.1; // Check distance needed + buffer

        const intersects = groundRaycaster.intersectObject(mapTiles.mesh, true);

        if (intersects.length > 0) {
            const groundY = intersects[0].point.y;
            const targetPlayerBaseY = groundY;

            // Check if player is about to pass through the ground in this frame
            if (playerPositionHelper.position.y + playerVelocity.y * delta <= targetPlayerBaseY + 0.01) {
                 // Snap to ground if falling or moving very slowly downwards
                 if (playerVelocity.y <= 0) {
                    playerPositionHelper.position.y = targetPlayerBaseY;
                    playerVelocity.y = 0;
                    if(isJumping) console.log("Landed.");
                    isJumping = false;
                    groundDetected = true;
                 }
            } else {
                 // Player is above ground, ensure they are marked as jumping/falling
                 isJumping = true;
            }
        } else {
             // No ground detected immediately below
             isJumping = true;
        }
    } else {
        // No map tiles loaded or ready? Treat as airborne.
        isJumping = true;
    }

    // --- Update Player Position ---
    // Apply calculated velocity for this frame
    const deltaPosition = playerVelocity.clone().multiplyScalar(delta);
    playerPositionHelper.position.add(deltaPosition);

    // Safety floor
    const MIN_Y_LEVEL = -200;
    if (playerPositionHelper.position.y < MIN_Y_LEVEL) {
         playerPositionHelper.position.y = MIN_Y_LEVEL;
         if (playerVelocity.y < 0) playerVelocity.y = 0;
         if(isJumping) console.log("Hit minimum Y level safety floor.");
         isJumping = false;
    }

    // Update Map Tiles LOD
    if (mapTiles) {
        const cameraWorldPosition = new THREE.Vector3();
        camera.getWorldPosition(cameraWorldPosition);
        mapTiles.update(cameraWorldPosition);
    }

    // Logging (Reduced Frequency)
    if (frameCount % 180 === 0) { // Log ~ every 3 seconds at 60fps
        console.log(`Player Pos: X=${playerPositionHelper.position.x.toFixed(2)}, Y=${playerPositionHelper.position.y.toFixed(2)}, Z=${playerPositionHelper.position.z.toFixed(2)}, VelY: ${playerVelocity.y.toFixed(2)}, Jumping: ${isJumping}`);
        // Check if map tiles mesh has children (indicates loading)
        if (mapTiles && mapTiles.mesh) {
            console.log(`Map Tiles Mesh Children: ${mapTiles.mesh.children.length}`);
        }
    }
}

let frameCount = 0; // Keep track of frames for logging

// --- Animation Loop ---
function animate() {
    renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
    const delta = clock.getDelta();
    const clampedDelta = Math.min(delta, 0.1); // Prevent large jumps

    frameCount++; // Increment frame count

    // Run update logic (physics, input, map tiles)
    update(clampedDelta, frame); // Pass frame if available (in XR)

    // Render the scene
    if (renderer && scene && camera) {
        try {
             renderer.render(scene, camera);
        } catch(renderError){
             console.error("Error during render:", renderError);
             displayError("Render Error: " + renderError.message);
             // Optionally stop the loop if render fails catastrophically
             // renderer.setAnimationLoop(null);
        }
    }
}

// --- Utility Functions ---
function displayError(message) {
    let errorDiv = document.getElementById('runtime-error');
    if (errorDiv) { // Check if div exists
        errorDiv.textContent = message;
        errorDiv.style.display = 'block'; // Make sure it's visible
    } else {
        // Fallback if div isn't in HTML for some reason
        console.error("RUNTIME ERROR:", message);
        alert("Runtime Error (check console): " + message.substring(0, 100) + "...");
    }
}

console.log("app.js finished initial execution");
