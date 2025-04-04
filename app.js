// Ensure this line is correct
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
// CORRECTED: Use default import for MapTiles
import MapTiles from '@googlemaps/three';

// -----------------------------------------------------------------------------
// !!!!!!!!!!!!!!!!!!!!!!!!!!!! SECURITY WARNING !!!!!!!!!!!!!!!!!!!!!!!!!!!!
// PASTING API KEYS DIRECTLY INTO CLIENT-SIDE CODE IS EXTREMELY INSECURE
// ESPECIALLY FOR PUBLIC SITES LIKE GITHUB PAGES.
// ANYONE CAN VIEW THE SOURCE AND STEAL YOUR KEY, POTENTIALLY INCURRING COSTS.
// DELETE OR REGENERATE THIS KEY AND USE A NEW, RESTRICTED KEY.
// RESTRICT THE NEW KEY BY HTTP REFERRER (your github pages url) and API (Map Tiles API).
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
const MAPS_API_KEY = "AIzaSyA5FhS5LMbAbhI0tYHt3fZev_PS0YCiVFE"; // <-- YOUR KEY (INSECURE - REPLACE)
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

// Check for API Key - This check is less critical now it's hardcoded, but good practice
if (!MAPS_API_KEY) {
    console.error("API Key is missing. Although hardcoded, it seems empty.");
    displayError("API Key constant is empty in app.js");
    const promptElement = document.getElementById('api-key-prompt');
    if (promptElement) promptElement.style.backgroundColor = 'red'; // Make prompt red if key missing
} else {
    document.addEventListener('DOMContentLoaded', () => {
        console.log("DOM Content Loaded");
        // Show the API key warning prompt regardless
        const promptElement = document.getElementById('api-key-prompt');
        if (promptElement) promptElement.style.display = 'block';

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
    scene.up.set(0, 1, 0);
    console.log("Scene created");

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, CAMERA_FAR_PLANE);
    camera.position.set(0, playerHeight, 0);
    console.log("Camera created");

    playerPositionHelper.add(camera);
    playerPositionHelper.position.set(0, 100, 5); // Start higher up
    scene.add(playerPositionHelper);
    console.log("Player helper added to scene");


    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
    directionalLight.position.set(50, 100, 50);
    scene.add(directionalLight);
    console.log("Lighting added");

    // --- Google Maps 3D Tiles ---
    try {
        console.log("Initializing MapTiles...");
        // Use the imported default export
        mapTiles = new MapTiles(MAPS_API_KEY);
        mapTiles.mesh.name = "MapTilesMesh";

        const LATITUDE = 48.8584; // Eiffel Tower
        const LONGITUDE = 2.2945;
        mapTiles.setCoordinates(LATITUDE, LONGITUDE);
        console.log(`Map Tiles centering at Lat: ${LATITUDE}, Lon: ${LONGITUDE}`);

        playerPositionHelper.position.set(0, playerHeight + 20, 15); // Start ~20m above ground, 15m back

        scene.add(mapTiles.mesh);
        console.log("Map Tiles added to scene");

    } catch (mapError) {
        console.error("Error initializing or setting MapTiles:", mapError);
        displayError("Map Tiles Error: " + mapError.message + ". Check API Key, enabled API, and billing status in Google Cloud.");
        // Optionally disable map-dependent features if loading fails
        mapTiles = null; // Ensure mapTiles is null if init failed
    }


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
    playerPositionHelper.add(controller1);

    controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.name = "ControllerGripLeft";
    playerPositionHelper.add(controllerGrip1);

    // Controller 2 (Right)
    controller2 = renderer.xr.getController(1);
    controller2.name = "ControllerRight";
    controller2.addEventListener('connected', (event) => handleControllerConnection(controller2, event));
    controller2.addEventListener('disconnected', () => handleControllerDisconnection(controller2));
    playerPositionHelper.add(controller2);

    controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.name = "ControllerGripRight";
    playerPositionHelper.add(controllerGrip2);

    console.log("Controllers setup, waiting for connection...");

    // Ground detection Raycaster
    groundRaycaster = new THREE.Raycaster();

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
        removeControllerModel(grip);
        const model = controllerModelFactory.createControllerModel(grip);
        // Handle potential errors during model creation/loading if needed
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

        const cameraQuaternion = new THREE.Quaternion();
        camera.getWorldQuaternion(cameraQuaternion);

        const move = new THREE.Vector3(stickX, 0, stickY); // Z is forward/back relative to stick

        if (move.lengthSq() < deadzone * deadzone) {
            move.set(0, 0, 0);
        } else {
             // Apply camera rotation (horizontal only) to the movement vector
            const cameraEuler = new THREE.Euler().setFromQuaternion(cameraQuaternion, 'YXZ');
            cameraEuler.x = 0; // Zero out pitch
            cameraEuler.z = 0; // Zero out roll
            move.applyEuler(cameraEuler);
        }

        playerVelocity.x = move.x * MOVEMENT_SPEED;
        playerVelocity.z = move.z * MOVEMENT_SPEED;

    } else if (handedness === 'left') {
        // Ensure velocity stops if stick is centered or controller has no stick
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
    if (isJumping) {
        playerVelocity.y += GRAVITY * delta;
    }

    // --- Ground Collision ---
    let groundDetected = false;
    // Check mapTiles exists AND has successfully loaded children before raycasting
    if (mapTiles && mapTiles.mesh && mapTiles.mesh.children.length > 0) {
        const rayOrigin = playerPositionHelper.position;
        groundRaycaster.set(rayOrigin, downVector);
        // Adjust ray length based on expected movement + buffer
        groundRaycaster.far = playerHeight + Math.max(0.1, Math.abs(playerVelocity.y * delta * 1.1));

        try {
             const intersects = groundRaycaster.intersectObject(mapTiles.mesh, true);

             if (intersects.length > 0) {
                 // Find highest intersection point (relevant if overlapping geometry exists)
                 let highestIntersectY = -Infinity;
                 for(const intersect of intersects){
                     highestIntersectY = Math.max(highestIntersectY, intersect.point.y);
                 }
                 const groundY = highestIntersectY;
                 const targetPlayerBaseY = groundY;

                 // Check if player is about to pass through the ground
                 if (playerPositionHelper.position.y + playerVelocity.y * delta <= targetPlayerBaseY + 0.01) {
                      if (playerVelocity.y <= 0) { // Only snap if moving downwards
                         playerPositionHelper.position.y = targetPlayerBaseY;
                         playerVelocity.y = 0;
                         if(isJumping) console.log("Landed.");
                         isJumping = false;
                         groundDetected = true;
                      }
                 } else {
                      // Player is above ground, ensure isJumping is true
                      isJumping = true;
                 }
             } else {
                  // No ground detected below
                  isJumping = true;
             }
        } catch(raycastError){
            console.warn("Raycasting error (potentially during map load/unload):", raycastError);
            isJumping = true; // Assume airborne if raycast fails
        }
    } else {
        // No map tiles loaded or ready? Treat as airborne.
        isJumping = true;
        // If mapTiles object exists but mesh has no children, log it occasionally
        if (mapTiles && frameCount % 300 === 0) { // Log ~ every 5 secs
             console.log("Waiting for map tiles mesh children to load...");
        }
    }

    // --- Update Player Position ---
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
        try {
             const cameraWorldPosition = new THREE.Vector3();
             camera.getWorldPosition(cameraWorldPosition);
             mapTiles.update(cameraWorldPosition);
        } catch (mapUpdateError){
             console.warn("Error during mapTiles.update():", mapUpdateError);
             // Potentially related to map data loading issues
        }
    }

    // Logging
    if (frameCount % 180 === 0) {
        console.log(`Player Pos: X=${playerPositionHelper.position.x.toFixed(2)}, Y=${playerPositionHelper.position.y.toFixed(2)}, Z=${playerPositionHelper.position.z.toFixed(2)}, VelY: ${playerVelocity.y.toFixed(2)}, Jumping: ${isJumping}`);
    }
}

let frameCount = 0;

// --- Animation Loop ---
function animate() {
    renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
    const delta = clock.getDelta();
    const clampedDelta = Math.min(delta, 0.1);

    frameCount++;

    // Run update logic
    try {
        update(clampedDelta, frame);
    } catch (updateError) {
         console.error("Error during update():", updateError);
         displayError("Update Error: " + updateError.message + '\n' + updateError.stack);
         renderer.setAnimationLoop(null); // Stop the loop on critical update error
         return; // Don't try to render
    }


    // Render the scene
    if (renderer && scene && camera) {
        try {
             renderer.render(scene, camera);
        } catch(renderError){
             console.error("Error during render():", renderError);
             displayError("Render Error: " + renderError.message);
             // Potentially stop the loop if render fails catastrophically
             // renderer.setAnimationLoop(null);
        }
    }
}

// --- Utility Functions ---
function displayError(message) {
    let errorDiv = document.getElementById('runtime-error');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        console.error("DISPLAYED ERROR:", message); // Also log it
    } else {
        console.error("RUNTIME ERROR (div not found):", message);
        alert("Runtime Error (check console): " + message.substring(0, 100) + "...");
    }
}

console.log("app.js finished initial execution");
