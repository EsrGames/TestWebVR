import { Matrix4, Raycaster, Vector2 } from 'three';
import type { XRContext } from '../xr/context';
import type { ControllerHandle, Controllers } from '../xr/controllers';

/** Something that can be pressed with the laser or a click. */
export interface Pickable {
  action(): void;
}

/** A panel with pressable buttons (final panel, reply options...). */
export interface PointerTarget {
  readonly visible: boolean;
  pick(raycaster: Raycaster): Pickable | null;
  setHovered(button: Pickable | null): void;
}

/**
 * Lets the user press buttons on the given panels: the laser of either controller (right
 * first, so left-handed users can use the left one) plus the trigger in VR, or a mouse click
 * on desktop. A button is only chosen when the trigger is pressed on it, never by pointing.
 */
export function attachPointer(
  ctx: XRContext,
  controllers: Controllers,
  targets: readonly PointerTarget[],
) {
  const raycaster = new Raycaster();
  const rotation = new Matrix4();
  const mouse = new Vector2();

  const aimFrom = (handle: ControllerHandle | null): boolean => {
    if (!handle?.inputSource) return false;
    rotation.identity().extractRotation(handle.ray.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(handle.ray.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
    return true;
  };

  /** First button under the ray across the visible panels. */
  const pickAny = (): Pickable | null => {
    for (const target of targets) {
      if (!target.visible) continue;
      const hit = target.pick(raycaster);
      if (hit) return hit;
    }
    return null;
  };

  ctx.onFrame(() => {
    if (!ctx.renderer.xr.isPresenting || !targets.some((t) => t.visible)) return;
    let hovered: Pickable | null = null;
    for (const handle of [controllers.right, controllers.left]) {
      if (aimFrom(handle)) hovered = pickAny();
      if (hovered) break;
    }
    for (const target of targets) {
      if (!target.visible) continue;
      // Each panel only highlights its own buttons.
      target.setHovered(hovered && target.pick(raycaster) === hovered ? hovered : null);
    }
  });

  for (const handle of controllers.all) {
    handle.ray.addEventListener('selectstart', () => {
      if (!targets.some((t) => t.visible) || !aimFrom(handle)) return;
      pickAny()?.action();
    });
  }

  ctx.renderer.domElement.addEventListener('click', (event) => {
    if (ctx.renderer.xr.isPresenting || !targets.some((t) => t.visible)) return;
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    mouse.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(mouse, ctx.camera);
    pickAny()?.action();
  });
}
