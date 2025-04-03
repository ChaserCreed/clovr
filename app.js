import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
// Make sure BoxLineGeometry is imported if you are using it
import { BoxLineGeometry } from 'three/examples/jsm/geometries/BoxLineGeometry.js'; // <-- Keep this import

console.log("app.js started"); // 1. Script loaded?

let camera, scene, renderer;
let controller1, controller2;
let controllerGrip1, controllerGrip2;
let cube;

// Wrap initialization in DOMContentLoaded to be safe
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Content Loaded"); // 2. DOM ready?
    try {
        init();
        console.log("init() completed successfully"); // 6. Init finished?
        animate();
        console.log("animate() called, render loop should start"); // 7. Animation loop requested?
    } catch (error) {
        console.error("Error during init() or animate():", error); // Catch errors during setup
        // Display error on screen for easier debugging on Quest if console isn't working
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'absolute';
        errorDiv.style.top = '10px';
        errorDiv.style.left = '10px';
        errorDiv.style.color = 'red';
        errorDiv.style.backgroundColor = 'white';
        errorDiv.style.padding = '10px';
        errorDiv.style.fontFamily = 'monospace';
        errorDiv.style.zIndex = '1000';
        errorDiv.textContent = 'Initialization Error: ' + error.message + '\n' + error.stack; // Add stack trace
        document.body.appendChild(errorDiv);
    }
});


function init() {
    console.log("Inside init()"); // 3. Init function entered?

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x446688);
    console.log("Scene created");

    // Camera
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.6, 3);
    console.log("Camera created");

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 2, 1);
    scene.add(directionalLight);
    console.log("Lighting added");

    // Simple Cube
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 1, -1);
    scene.add(cube);
    console.log("Cube added");

    // Simple Floor
    const floorGeometry = new THREE.PlaneGeometry(10, 10);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);
    console.log("Floor added");

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    console.log("Renderer created");

    // Append Renderer Canvas to Body
    if (document.body) {
        document.body.appendChild(renderer.domElement);
        console.log("Renderer DOM element appended to body");
    } else {
        console.error("document.body not found when trying to append renderer!");
        throw new Error("Document body not available for renderer."); // Stop execution
    }

    // Enable WebXR
    renderer.xr.enabled = true;
    console.log("Renderer XR enabled");

    // VR Button
    const vrButtonContainer = document.getElementById('vr-button-container');
    if (vrButtonContainer) {
        const vrButton = VRButton.createButton(renderer);
        vrButtonContainer.appendChild(vrButton);
        console.log("VR Button created and appended");
    } else {
        console.error("#vr-button-container not found!");
        // Note: This might not stop rendering, but the button won't appear.
    }


    // Controllers
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('selectend', onSelectEnd);
    scene.add(controller1); // Add controller itself to scene (tracks position)

    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('selectend', onSelectEnd);
    scene.add(controller2); // Add controller itself to scene (tracks position)
    console.log("Controllers setup");

    // Controller Visuals (Simple Lines pointing forward)
    const controllerMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }); // White lines
    const controllerPointerGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -0.15) // Pointing forward slightly
    ]);

    const line1 = new THREE.Line(controllerPointerGeom, controllerMaterial);
    line1.name = 'PointerLine'; // Optional: name for debugging
    line1.scale.z = 1; // Keep original length or adjust as needed
    controller1.add(line1.clone()); // Add pointer line to controller 1

    const line2 = new THREE.Line(controllerPointerGeom, controllerMaterial);
    line2.name = 'PointerLine'; // Optional: name for debugging
    line2.scale.z = 1;
    controller2.add(line2.clone()); // Add pointer line to controller 2


    // --- Corrected Controller Grip Visual Setup ---
    controllerGrip1 = renderer.xr.getControllerGrip(0); // Get the grip space Object3D
    scene.add(controllerGrip1); // Add the grip space itself to the scene

    controllerGrip2 = renderer.xr.getControllerGrip(1); // Get the grip space Object3D
    scene.add(controllerGrip2); // Add the grip space itself to the scene

    // Define the geometry for the grip visual ONCE
    const gripGeometry = new BoxLineGeometry(0.05, 0.1, 0.1, 10, 10, 10).translate(0, 0.01, 0.015); // Adjust size/position as needed

    // Define the material for the grip visual ONCE
    const gripMaterial = new THREE.LineBasicMaterial({ color: 0xcccccc, linewidth: 1 }); // Grey lines

    // Create the LineSegments object FOR controller 1 using the geometry and material
    const gripLines1 = new THREE.LineSegments(gripGeometry, gripMaterial);
    gripLines1.name = 'GripLines'; // Optional: name for debugging
    controllerGrip1.add(gripLines1); // Add the VISUAL (LineSegments - an Object3D) to the grip space

    // Create the LineSegments object FOR controller 2 using the same geometry and material
    const gripLines2 = new THREE.LineSegments(gripGeometry, gripMaterial);
    gripLines2.name = 'GripLines'; // Optional: name for debugging
    controllerGrip2.add(gripLines2); // Add the VISUAL (LineSegments - an Object3D) to the grip space
    // --- End of Corrected Controller Grip Visual Setup ---

    console.log("Controller visuals (pointer lines and grip outlines) added");


    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    console.log("Event listeners added"); // 5. Listeners ready?
}

function onWindowResize() {
    console.log("Window resized");
    // Check if camera and renderer exist before using them
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

function onSelectStart(event) {
    // Check if cube exists
    if (cube) {
        const controller = event.target; // The controller that triggered the event
        cube.position.y += 0.1;
        cube.material.color.setHex(Math.random() * 0xffffff);
        console.log("Select Start triggered by controller:", controller === controller1 ? 0 : 1);

        // Optional: Add simple haptic feedback
        // Check if gamepad and hapticActuators exist
        if (controller.gamepad && controller.gamepad.hapticActuators && controller.gamepad.hapticActuators.length > 0) {
            controller.gamepad.hapticActuators[0].pulse(0.5, 100); // Intensity 0.5, duration 100ms
        }
    }
}

function onSelectEnd(event) {
    // Check if cube exists
    if (cube) {
        const controller = event.target;
        cube.position.y -= 0.1;
        // Optional: revert color
        // cube.material.color.setHex(0x00ff00); // Back to green
        console.log("Select End triggered by controller:", controller === controller1 ? 0 : 1);
    }
}


function animate() {
    // Use the renderer's built-in animation loop which handles XR sessions
    renderer.setAnimationLoop(render);
}

let frameCount = 0;
function render() {
     // Log only every 300 frames (approx 5 seconds at 60fps) to avoid flooding the console
    if (frameCount % 300 === 0) {
        // Check if renderer exists before logging
        if(renderer) {
             console.log(`Render loop running, frame: ${frameCount}, XR Presenting: ${renderer.xr.isPresenting}`); // 8. Is render loop executing? Is VR active?
        }
    }
    frameCount++;

    // Simple animation: Rotate the cube
    if (cube) { // Add checks in case init failed partially
       cube.rotation.y += 0.01;
       cube.rotation.x += 0.005;
    }

    // Render the scene for the current frame
    if (renderer && scene && camera) { // Add checks
       renderer.render(scene, camera);
    } else {
        if (frameCount % 300 === 0) { // Log issue periodically
             console.warn("Skipping render - renderer, scene, or camera not ready.");
        }
    }
}

console.log("app.js finished initial execution"); // Check if script runs to the end
