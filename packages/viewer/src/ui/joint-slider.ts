import type { Translate } from "../i18n/translate.ts";
import { displayUnitLabel } from "../joints/joint-parameters.ts";
import { type JointSliderSpec, positionFromSlider, sliderValue } from "../joints/slider-model.ts";
import { createThrottle, type Throttle } from "../throttle.ts";
import { formatDisplayNumber } from "../units.ts";
import { element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The position slider of the selected joint. It lives outside the redrawn
// regions of the panel so that a redraw never interrupts a drag, and it is
// updated in place from the pose stream. While dragging it sends the wanted
// position to the core (at most ~30 requests per second); the bodies move
// through the pose stream, never here (ADR 0016).

const MAX_REQUESTS_PER_SECOND = 30;

const browserScheduler = {
  now: () => performance.now(),
  after: (delayMs: number, callback: () => void) => void setTimeout(callback, delayMs),
};

function specKey(spec: JointSliderSpec): string {
  return [spec.pantinId, spec.jointId, spec.min, spec.max, spec.step, spec.displayUnit].join("|");
}

export class JointSliderControl {
  readonly element = element("div", { className: "joint-slider" });
  private readonly input = element("input", {
    className: "joint-slider__input",
    attributes: { type: "range" },
  });
  private readonly valueText = element("output", { className: "joint-slider__value" });
  private readonly caption = element("label", { className: "joint-slider__caption" });
  private spec: JointSliderSpec | null = null;
  private currentKey: string | null = null;
  private throttle: Throttle<number> | null = null;
  private intents: PanelIntents | null = null;
  private translate: Translate | null = null;
  // The user holds the handle: the stream must not pull it back.
  private dragging = false;

  constructor() {
    this.element.append(
      this.caption,
      element("div", { className: "joint-slider__row" }, [this.input, this.valueText]),
    );
    this.element.hidden = true;
    this.input.addEventListener("pointerdown", () => {
      this.dragging = true;
    });
    for (const type of ["pointerup", "pointercancel", "blur"]) {
      this.input.addEventListener(type, () => {
        this.dragging = false;
      });
    }
    this.input.addEventListener("input", () => this.onInput());
  }

  render(spec: JointSliderSpec | null, translate: Translate, intents: PanelIntents): void {
    this.intents = intents;
    this.translate = translate;
    this.element.hidden = spec === null;
    if (spec === null) {
      this.spec = null;
      this.currentKey = null;
      this.throttle?.cancel();
      this.throttle = null;
      return;
    }
    this.spec = spec;
    const label = translate("joint.slider.label", { name: spec.name });
    this.caption.textContent = label;
    this.input.setAttribute("aria-label", label);
    if (specKey(spec) !== this.currentKey) {
      this.currentKey = specKey(spec);
      this.input.min = String(spec.min);
      this.input.max = String(spec.max);
      this.input.step = String(spec.step);
      this.throttle?.cancel();
      this.throttle = createThrottle(
        (position) => this.intents?.moveJoint(spec.pantinId, spec.jointId, position),
        1000 / MAX_REQUESTS_PER_SECOND,
        browserScheduler,
      );
    }
  }

  /** Follows the core's positions (metres or radians), except while the user drags. */
  showPositions(positions: ReadonlyMap<string, number>): void {
    if (this.spec === null || this.dragging) {
      return;
    }
    this.show(sliderValue(this.spec, positions.get(this.spec.jointId)));
  }

  private show(value: number): void {
    this.input.value = String(value);
    if (this.spec !== null && this.translate !== null) {
      const unit = displayUnitLabel(this.spec.displayUnit, this.translate);
      this.valueText.textContent = `${formatDisplayNumber(value)} ${unit}`;
    }
  }

  private onInput(): void {
    if (this.spec === null) {
      return;
    }
    const value = this.input.valueAsNumber;
    this.show(value);
    this.throttle?.push(positionFromSlider(this.spec, value));
  }
}
