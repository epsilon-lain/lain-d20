import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const ROLL_STATES = Object.freeze({
  IDLE: "idle",
  ROLLING: "rolling",
  REVEAL: "reveal",
  SETTLED: "settled",
});

const ROLL_DURATION_MS = 2400;
const REVEAL_DELAY_MS = 240;
const FACE_CALIBRATION_EULER = new THREE.Euler(0, 0, 0);

const ui = {
  diceStage: document.querySelector(".dice-stage"),
  stage: document.getElementById("threeCanvas"),
  rollButton: document.getElementById("rollButton"),
  helperText: document.getElementById("helperText"),
  loadStatus: document.getElementById("loadStatus"),
  resultOverlay: document.getElementById("resultOverlay"),
  outcomeValue: document.getElementById("resultValue"),
  outcomeLine: document.getElementById("resultMessage"),
  historyEntries: document.getElementById("history"),
};

const appState = {
  phase: ROLL_STATES.IDLE,
  tone: "neutral",
  outcome: null,
  pointerInsideStage: false,
};

let scene;
let camera;
let renderer;
let clock;
let dicePivot;
let diceObject;
let animationFrameId;
let rollAnimation = null;
const pointerInfluence = {
  currentX: 0,
  currentY: 0,
  targetX: 0,
  targetY: 0,
};

const outcomeToFaceIndex = [
  0, 1, 2, 3, 4,
  5, 6, 7, 8, 9,
  10, 11, 12, 13, 14,
  15, 16, 17, 18, 19,
];

const icosaFaceNormals = [
  [0, 1, PHI()], [0, -1, PHI()], [0, 1, -PHI()], [0, -1, -PHI()],
  [1, PHI(), 0], [-1, PHI(), 0], [1, -PHI(), 0], [-1, -PHI(), 0],
  [PHI(), 0, 1], [PHI(), 0, -1], [-PHI(), 0, 1], [-PHI(), 0, -1],
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
  [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());

init();

function PHI() {
  return (1 + Math.sqrt(5)) / 2;
}

function init() {
  setupScene();
  setupLights();
  setupDiceContainer();
  setupEvents();

  clock = new THREE.Clock();
  loadLocalDieModel();
  animate();
}

function setupScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x080a14, 7, 16);

  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0.95, 4.6);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;

  ui.stage.appendChild(renderer.domElement);
  resizeRenderer();

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(2.8, 48),
    new THREE.MeshBasicMaterial({ color: 0x10172e, transparent: true, opacity: 0.35 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.25;
  scene.add(ground);
}

function setupLights() {
  scene.add(new THREE.AmbientLight(0x8ea4ff, 0.55));

  const key = new THREE.DirectionalLight(0xe5e8ff, 1.2);
  key.position.set(2.8, 3.4, 2.8);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x7a94ff, 0.6);
  rim.position.set(-2.5, 1.8, -3.2);
  scene.add(rim);

  const lowFill = new THREE.PointLight(0xa04848, 0.2, 9);
  lowFill.position.set(0, -1.3, 1.5);
  scene.add(lowFill);
}

function setupDiceContainer() {
  dicePivot = new THREE.Group();
  scene.add(dicePivot);
}

function setupEvents() {
  window.addEventListener("resize", resizeRenderer);
  ui.rollButton.addEventListener("click", beginRollSequence);
  ui.diceStage.addEventListener("click", beginRollSequence);
  ui.diceStage.addEventListener("pointermove", handleStagePointerMove);
  ui.diceStage.addEventListener("pointerenter", handleStagePointerEnter);
  ui.diceStage.addEventListener("pointerleave", handleStagePointerLeave);
  window.addEventListener("keydown", handleKeyRoll);
}

function resizeRenderer() {
  const width = ui.stage.clientWidth;
  const height = ui.stage.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function loadLocalDieModel() {
  const loader = new GLTFLoader();
  const modelPath = "./assets/d20-gold_edition_free.glb";

  ui.loadStatus.textContent = `Summoning die model: ${modelPath}`;

  loader.load(
    modelPath,
    (gltf) => {
      attachLoadedDie(gltf.scene);
      ui.loadStatus.textContent = "Die model loaded.";
      setTimeout(() => {
        if (appState.phase === ROLL_STATES.IDLE) {
          ui.loadStatus.textContent = "";
        }
      }, 900);
    },
    undefined,
    (error) => {
      handleModelLoadFailure(error);
    },
  );
}

function attachLoadedDie(modelScene) {
  if (diceObject) {
    dicePivot.remove(diceObject);
  }

  const model = modelScene.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z) || 1;

  model.position.sub(center);
  model.scale.setScalar(1.8 / largest);
  model.rotation.copy(FACE_CALIBRATION_EULER);

  diceObject = model;
  dicePivot.add(diceObject);
}

function handleModelLoadFailure(error) {
  console.error("D20 model failed to load.", error);
  ui.loadStatus.textContent = "Model unavailable. Using fallback die geometry.";

  diceObject = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({
      color: 0xbda062,
      emissive: 0x111111,
      roughness: 0.33,
      metalness: 0.58,
      flatShading: true,
    }),
  );

  dicePivot.add(diceObject);
}

function beginRollSequence() {
  if (appState.phase === ROLL_STATES.ROLLING || !diceObject) {
    return;
  }

  const outcome = rollOutcome();
  const targetQuaternion = getTargetQuaternionForOutcome(outcome);

  appState.outcome = outcome;
  setPhase(ROLL_STATES.ROLLING, "neutral");
  ui.diceStage.classList.remove("is-armed");

  ui.rollButton.disabled = true;
  ui.helperText.textContent = "The die rattles across the table...";
  ui.resultOverlay.classList.remove("is-visible");

  playRollAudioCue();

  rollAnimation = {
    start: performance.now(),
    duration: ROLL_DURATION_MS,
    spin: new THREE.Vector3(
      22 + Math.random() * 8,
      24 + Math.random() * 8,
      18 + Math.random() * 8,
    ),
    targetQuaternion,
  };
}

function rollOutcome() {
  return Math.floor(Math.random() * 20) + 1;
}

function getTargetQuaternionForOutcome(outcome) {
  const faceNormal = icosaFaceNormals[outcomeToFaceIndex[outcome - 1]];
  const up = new THREE.Vector3(0, 1, 0);
  const align = new THREE.Quaternion().setFromUnitVectors(faceNormal, up);

  const spinAroundTop = new THREE.Quaternion().setFromAxisAngle(
    up,
    ((outcome * 137.5) % 360) * (Math.PI / 180),
  );

  return spinAroundTop.multiply(align);
}

function animate() {
  animationFrameId = requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  pointerInfluence.currentX += (pointerInfluence.targetX - pointerInfluence.currentX) * 0.08;
  pointerInfluence.currentY += (pointerInfluence.targetY - pointerInfluence.currentY) * 0.08;

  if (rollAnimation) {
    updateRollAnimation();
    camera.position.x = Math.sin(elapsed * 0.7) * 0.08 + pointerInfluence.currentX * 0.12;
    camera.position.y = 0.92 + Math.cos(elapsed * 0.6) * 0.04 + pointerInfluence.currentY * 0.05;
    camera.lookAt(0, 0, 0);
  } else {
    dicePivot.rotation.y += 0.0025;
    dicePivot.rotation.x = THREE.MathUtils.lerp(dicePivot.rotation.x, pointerInfluence.currentY * 0.2, 0.06);
    dicePivot.rotation.z = THREE.MathUtils.lerp(dicePivot.rotation.z, -pointerInfluence.currentX * 0.16, 0.06);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointerInfluence.currentX * 0.18, 0.05);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.95 + pointerInfluence.currentY * 0.08, 0.05);
    camera.lookAt(pointerInfluence.currentX * 0.12, pointerInfluence.currentY * 0.08, 0);
  }

  renderer.render(scene, camera);
}

function updateRollAnimation() {
  const t = Math.min((performance.now() - rollAnimation.start) / rollAnimation.duration, 1);
  const eased = easeOutCubic(t);
  const spinScale = 1 - eased * 0.8;

  dicePivot.rotation.x += 0.15 * rollAnimation.spin.x * 0.002 * spinScale;
  dicePivot.rotation.y += 0.15 * rollAnimation.spin.y * 0.0023 * spinScale;
  dicePivot.rotation.z += 0.15 * rollAnimation.spin.z * 0.0019 * spinScale;

  if (t > 0.45) {
    dicePivot.quaternion.slerp(rollAnimation.targetQuaternion, ((t - 0.45) / 0.55) * 0.14);
  }

  if (t >= 0.92 && appState.phase === ROLL_STATES.ROLLING) {
    ui.stage.style.transform = "translateX(1px)";
    setTimeout(() => {
      ui.stage.style.transform = "";
    }, 70);
  }

  if (t >= 1) {
    dicePivot.quaternion.copy(rollAnimation.targetQuaternion);
    rollAnimation = null;
    setPhase(ROLL_STATES.REVEAL, resolveTone(appState.outcome));

    setTimeout(() => {
      revealOutcome(appState.outcome);
      setPhase(ROLL_STATES.SETTLED, resolveTone(appState.outcome));
      ui.rollButton.disabled = false;
    }, REVEAL_DELAY_MS);
  }
}

function revealOutcome(outcome) {
  const tone = resolveTone(outcome);

  ui.resultOverlay.dataset.tone = tone;
  ui.outcomeValue.textContent = String(outcome);
  ui.outcomeLine.textContent = buildOutcomeLine(outcome);
  ui.resultOverlay.classList.add("is-visible");
  ui.helperText.textContent = helperTextForOutcome(outcome);

  addHistoryEntry(outcome);
  playOutcomeAudioCue(outcome);
}

function resolveTone(outcome) {
  if (outcome === 20) return "success";
  if (outcome === 1) return "fail";
  return "neutral";
}

function buildOutcomeLine(outcome) {
  if (outcome === 20) return "Natural 20 — fortune roars in your favor.";
  if (outcome === 1) return "Natural 1 — fate turns its blade on you.";
  if (outcome >= 15) return "A strong omen answers your call.";
  if (outcome <= 5) return "A dim sign. The path resists.";
  return "The omen is uncertain, but usable.";
}

function helperTextForOutcome(outcome) {
  if (outcome === 20) return "Triumph. The chamber hums with power.";
  if (outcome === 1) return "A grim silence follows.";
  return "Hover the die and cast again.";
}

function addHistoryEntry(outcome) {
  const item = document.createElement("li");
  item.textContent = `d20 → ${outcome}`;
  ui.historyEntries.prepend(item);

  while (ui.historyEntries.children.length > 6) {
    ui.historyEntries.removeChild(ui.historyEntries.lastChild);
  }
}

function setPhase(phase, tone = appState.tone) {
  appState.phase = phase;
  appState.tone = tone;
  document.body.dataset.state = phase;
  document.body.dataset.tone = tone;
}

function handleStagePointerEnter() {
  appState.pointerInsideStage = true;
  if (appState.phase !== ROLL_STATES.ROLLING) {
    ui.diceStage.classList.add("is-armed");
    ui.helperText.textContent = "The die is within reach. Click the stage to roll.";
  }
}

function handleStagePointerMove(event) {
  const rect = ui.diceStage.getBoundingClientRect();
  const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;

  pointerInfluence.targetX = THREE.MathUtils.clamp(nx, -1, 1);
  pointerInfluence.targetY = THREE.MathUtils.clamp(-ny, -1, 1);
}

function handleStagePointerLeave() {
  appState.pointerInsideStage = false;
  ui.diceStage.classList.remove("is-armed");
  pointerInfluence.targetX = 0;
  pointerInfluence.targetY = 0;

  if (appState.phase !== ROLL_STATES.ROLLING) {
    ui.helperText.textContent = appState.outcome
      ? "Take a breath and cast again."
      : "Click the die or press the button to tempt fate.";
  }
}

function handleKeyRoll(event) {
  if (event.repeat) {
    return;
  }

  if (event.code === "Space" || event.code === "Enter") {
    event.preventDefault();
    beginRollSequence();
  }
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function playRollAudioCue() {
  createTone(130, 0.06, 0.18, "sawtooth");
}

function playOutcomeAudioCue(outcome) {
  if (outcome === 20) {
    createTone(392, 0.08, 0.24, "triangle");
    createTone(523.25, 0.09, 0.28, "triangle", 0.05);
  } else if (outcome === 1) {
    createTone(98, 0.07, 0.32, "sine");
  } else {
    createTone(220, 0.04, 0.12, "triangle");
  }
}

function createTone(frequency, attack, release, type, delaySeconds = 0) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return;
  }

  const ctx = createTone.ctx || (createTone.ctx = new AudioContextCtor());
  const startAt = ctx.currentTime + delaySeconds;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);

  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(0.055, startAt + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + attack + release);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(startAt);
  oscillator.stop(startAt + attack + release + 0.03);
}

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationFrameId);
  window.removeEventListener("keydown", handleKeyRoll);
});
