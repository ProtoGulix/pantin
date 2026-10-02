import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import type { InputMapEntry } from "@babylonjs/core/Cameras/inputMapper.js";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  type CameraInteraction,
  NAVIGATION_PRESETS,
  type NavigationPreset,
  resolveBinding,
} from "../navigation/navigation-presets.ts";
import { DEFAULT_NAVIGATION, type NavigationSettings } from "../navigation/navigation-settings.ts";
import { isArrowKey } from "../navigation/turntable.ts";
import { dragZoomFactor, wheelZoomFactor } from "../navigation/zoom-math.ts";
import { createCameraMoves } from "./camera-moves.ts";
import type { CameraPivot } from "./camera-pivot.ts";
import { createCameraPivot } from "./camera-pivot.ts";
import type { CameraView } from "./camera-view.ts";

// The mouse, wheel and keyboard of the 3D view (ADR 0036 points 1, 2, 3, 6, 7).
// Babylon.js's input map does the rotation and the panning (its inertia and
// speeds); its pointers input cannot zoom on a drag, and its wheel and
// keyboard inputs cannot zoom about the cursor in orthographic mode or take
// our keys, so those three are ours. The arithmetic is in navigation/.

// Pixels per line when a mouse reports its wheel in lines (Firefox).
const WHEEL_PIXELS_PER_LINE = 40;
const MIDDLE_BUTTON_BIT = 4;

export interface CameraNavigation {
  apply(settings: NavigationSettings): void;
}

export interface NavigationHost {
  scene: Scene;
  canvas: HTMLCanvasElement;
  camera: ArcRotateCamera;
  view: CameraView;
  // The point of a body under a canvas position (pixels), or null over empty space.
  pickBodyPoint(x: number, y: number): Vector3 | null;
}

// Babylon.js reads these entries on every button press. A "zoom" entry makes
// Babylon.js do nothing for that gesture; ours does the zoom.
function inputMapOf(preset: NavigationPreset): InputMapEntry<CameraInteraction>[] {
  return preset.bindings.map((binding) => ({
    source: "pointer",
    button: binding.button,
    interaction: binding.interaction,
    ...(binding.modifiers === undefined ? {} : { modifiers: binding.modifiers }),
  }));
}

// What the listeners share: the settings and the preset they were applied from.
interface Live {
  settings: NavigationSettings;
  preset: NavigationPreset;
}

// Cursor in normalised device coordinates, y up.
function cursorOf(canvas: HTMLCanvasElement, event: MouseEvent): { x: number; y: number } {
  const box = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) / box.width) * 2 - 1,
    y: 1 - ((event.clientY - box.top) / box.height) * 2,
  };
}

type Moves = ReturnType<typeof createCameraMoves>;

function listenToPointer(host: NavigationHost, live: Live, pivot: CameraPivot, moves: Moves): void {
  const { canvas } = host;
  let dragZoom: { x: number; y: number } | null = null;
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      canvas.focus({ preventScroll: true });
      const held = { ctrl: event.ctrlKey, shift: event.shiftKey };
      const interaction = resolveBinding(live.preset, event.button, held);
      if (interaction === "rotate") {
        const box = canvas.getBoundingClientRect();
        pivot.begin(host.pickBodyPoint(event.clientX - box.left, event.clientY - box.top));
      } else {
        pivot.release();
      }
      dragZoom = interaction === "zoom" ? cursorOf(canvas, event) : null;
    },
    // Before Babylon.js's own handler, which starts the rotation.
    { capture: true },
  );
  canvas.addEventListener("pointermove", (event) => {
    // Middle button held (bit 4): a drag that began elsewhere must not zoom.
    if (dragZoom !== null && (event.buttons & MIDDLE_BUTTON_BIT) !== 0) {
      moves.zoomAbout(dragZoomFactor(event.movementY), dragZoom.x, dragZoom.y);
    }
  });
  const endDrag = () => {
    dragZoom = null;
    pivot.buttonReleased();
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
}

function listenToWheel(canvas: HTMLCanvasElement, live: Live, moves: Moves): void {
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const pixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? WHEEL_PIXELS_PER_LINE : 1;
      const cursor = cursorOf(canvas, event);
      const factor = wheelZoomFactor(
        event.deltaY * pixels,
        live.preset.forwardWheelZoomsOut,
        live.settings.reverseWheel,
      );
      moves.zoomAbout(factor, cursor.x, cursor.y);
    },
    { passive: false },
  );
}

// Only with the canvas focused, so that arrows keep moving in the tree and in
// the fields.
function listenToKeys(canvas: HTMLCanvasElement, live: Live, moves: Moves): void {
  canvas.addEventListener("keydown", (event) => {
    if (!isArrowKey(event.key) || event.altKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    if (event.ctrlKey) {
      moves.panByArrow(event.key);
    } else {
      moves.turnByArrow(event.key, event.shiftKey, live.settings.arrowStepDegrees);
    }
  });
}

export function createCameraNavigation(host: NavigationHost): CameraNavigation {
  const { scene, canvas, camera, view } = host;
  const live: Live = { settings: DEFAULT_NAVIGATION, preset: NAVIGATION_PRESETS.solidworks };
  const pivot = createCameraPivot(camera);
  const moves = createCameraMoves(scene, camera, view, () => pivot.release());
  camera.inputs.removeByType("ArcRotateCameraMouseWheelInput");
  camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
  // Default actions are prevented, otherwise the browser's context menu opens
  // on the right button and cancels a right-button drag.
  camera.attachControl(false);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  listenToPointer(host, live, pivot, moves);
  listenToWheel(canvas, live, moves);
  listenToKeys(canvas, live, moves);
  // After the inputs and before the matrices are built, so that neither the
  // pivot nor the orthographic bounds lag a frame behind the camera.
  camera.onAfterCheckInputsObservable.add(() => {
    pivot.follow();
    view.update();
  });
  camera.movement.input.inputMap = inputMapOf(live.preset);
  return {
    apply(next) {
      view.setPerspective(next.perspective);
      if (next.preset !== live.settings.preset) {
        live.preset = NAVIGATION_PRESETS[next.preset];
        camera.movement.input.inputMap = inputMapOf(live.preset);
      }
      live.settings = next;
    },
  };
}
