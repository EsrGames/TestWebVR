import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Raycaster } from 'three';
import type { ReplyOption } from '../app/conversation';
import { createText, setText } from './font';
import type { Pickable, PointerTarget } from './panelPointer';

const BUTTON_W = 0.47;
const BUTTON_H = 0.12;
const GAP = 0.02;
const COLOR = 0x23324a;
const HOVER = 0x2f6fed;

interface OptionButton extends Pickable {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly text: ReturnType<typeof createText>;
  option: ReplyOption | null;
}

/**
 * The 4 replies the user can pick, in a 2×2 grid below the subtitles, numbered 1–4. Pointing
 * highlights a reply; pressing the trigger (or clicking / pressing its number) chooses it.
 */
export class OptionsPanel implements PointerTarget {
  readonly group = new Group();
  private readonly buttons: OptionButton[] = [];
  private readonly meshes: Mesh[] = [];
  private hovered: OptionButton | null = null;
  private onChoose: ((id: string) => void) | null = null;

  constructor() {
    this.group.name = 'options-panel';
    this.group.visible = false;
    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const mesh = new Mesh(
        new PlaneGeometry(BUTTON_W, BUTTON_H),
        // Transparent so renderOrder keeps the texts above it.
        new MeshBasicMaterial({
          color: COLOR,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
        }),
      );
      mesh.name = `option-${i + 1}`;
      mesh.renderOrder = 30;
      mesh.position.set((col - 0.5) * (BUTTON_W + GAP), (0.5 - row) * (BUTTON_H + GAP), 0);
      const number = createText(String(i + 1), {
        fontSize: 0.03,
        bold: true,
        color: 0x8fb4ff,
        anchorX: 'left',
        anchorY: 'middle',
      });
      number.position.set(-BUTTON_W / 2 + 0.018, 0, 0.001);
      number.renderOrder = 31;
      const text = createText('', {
        fontSize: 0.022,
        color: 0xffffff,
        maxWidth: BUTTON_W - 0.075,
        anchorX: 'left',
        anchorY: 'middle',
      });
      text.position.set(-BUTTON_W / 2 + 0.055, 0, 0.001);
      text.renderOrder = 31;
      mesh.add(number, text);
      this.group.add(mesh);
      const button: OptionButton = {
        mesh,
        text,
        option: null,
        action: () => this.choose(button),
      };
      this.buttons.push(button);
      this.meshes.push(mesh);
    }
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** Shows the replies (in the given order) and calls `onChoose` with the picked id. */
  show(options: readonly ReplyOption[], onChoose: (id: string) => void): void {
    if (options.length === 0) {
      this.hide();
      return;
    }
    this.onChoose = onChoose;
    this.buttons.forEach((button, i) => {
      const option = options[i] ?? null;
      button.option = option;
      button.mesh.visible = option !== null;
      setText(button.text, option?.text ?? '');
    });
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
    this.setHovered(null);
    this.onChoose = null;
  }

  /** Keyboard shortcut: 1–4 choose the reply with that number. */
  chooseNumber(n: number): boolean {
    const button = this.buttons[n - 1];
    if (!this.visible || !button?.option) return false;
    this.choose(button);
    return true;
  }

  pick(raycaster: Raycaster): Pickable | null {
    if (!this.visible) return null;
    const hit = raycaster.intersectObjects(this.meshes, false)[0]?.object;
    const button = this.buttons.find((b) => b.mesh === hit);
    return button?.option ? button : null;
  }

  setHovered(button: Pickable | null): void {
    const next = (button as OptionButton | null) ?? null;
    if (next === this.hovered) return;
    this.hovered?.mesh.material.color.setHex(COLOR);
    next?.mesh.material.color.setHex(HOVER);
    this.hovered = next;
  }

  private choose(button: OptionButton): void {
    const id = button.option?.id;
    const onChoose = this.onChoose;
    if (!id || !onChoose) return;
    // Hide at once so a second trigger press cannot choose twice.
    this.hide();
    onChoose(id);
  }
}
