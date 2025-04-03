import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { BoxLineGeometry } from 'three/examples/jsm/geometries/BoxLineGeometry.js'; // For controller visualization

let camera, scene, renderer;
let controller1, controller2;
let controllerGrip1, controllerGrip2; // For potential models later
let cube;

init();
animate();

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x446688); // A nice sky blue

    // Camera
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.6, 3); // Position typical for VR standing height

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 2, 1);
    scene.add(directionalLight);

    // Simple Cube
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 }); // Green cube
    cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 1, -1); // Place it in front of the user
    scene.add(cube);

    // Simple Floor
    const floorGeometry = new THREE.PlaneGeometry(10, 10);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2; // Rotate flat
    floor.position.y = 0;
    scene.add(floor);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // Important for sharp rendering on Quest 3

    // Enable WebXR
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // VR Button
    const vrButton = VRButton.createButton(renderer);
    document.getElementById('vr-button-container').appendChild(vrButton); // Add button to our container

    // Controllers
    // Controller 1
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('selectend', onSelectEnd);
    scene.add(controller1);

    // Controller 2
    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('selectend', onSelectEnd);
    scene.add(controller2);

    // Controller Visuals (Simple Lines)
    const controllerMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }); // White lines

    const controllerGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), // Origin
        new THREE.Vector3(0, 0, -0.15) // Pointing forward slightly
    ]);

    const line1 = new THREE.Line(controllerGeom, controllerMaterial);
    line1.scale.z = 5; // Make it slightly longer
    controller1.add(line1.clone()); // Add line to controller 1

    const line2 = new THREE.Line(controllerGeom, controllerMaterial);
    line2.scale.z = 5;
    controller2.add(line2.clone()); // Add line to controller 2


    // Optional: Controller Grip representations (using BoxLineGeometry)
    // These help visualize the approximate space the controller occupies
    controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.add(new BoxLineGeometry(0.05, 0.1, 0.1, 10, 10, 10).translate(0, 0, 0.02)); // Adjust size/position as needed
    scene.add(controllerGrip1);

    controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.add(new BoxLineGeometry(0.05, 0.1, 0.1, 10, 10, 10).translate(0, 0, 0.02));
    scene.add(controllerGrip2);


    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onSelectStart(event) {
    // Trigger button pressed
    const controller = event.target;
    // Make the cube jump or change color briefly
    cube.position.y += 0.1;
    cube.material.color.setHex(Math.random() * 0xffffff); // Random color
    // You could add haptic feedback here if supported/desired
    // if (controller.gamepad && controller.gamepad.hapticActuators) {
    //     controller.gamepad.hapticActuators[0]?.pulse(0.5, 100); // Intensity 0.5, duration 100ms
    // }
}

function onSelectEnd(event) {
    // Trigger button released
    // Return cube to original height slowly or instantly
     cube.position.y -= 0.1;
     // Optional: revert color or do something else
     // cube.material.color.setHex(0x00ff00); // Back to green
}


function animate() {
    // Use the renderer's built-in animation loop which handles XR sessions
    renderer.setAnimationLoop(render);
}

function render() {
    // Simple animation: Rotate the cube
    cube.rotation.y += 0.01;
    cube.rotation.x += 0.005;

    // Render the scene for the current frame
    renderer.render(scene, camera);
}
