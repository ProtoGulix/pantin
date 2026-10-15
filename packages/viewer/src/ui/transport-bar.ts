import type { ClockView } from "../clock/clock-model.ts";
import { element } from "./dom.ts";
import { type IconName, icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The transport bar at the top of the central area (ADR 0032 point 10). Its
// elements are created once and written in place: a pose or a clock event
// arrives up to thirty times a second, and a redraw would drop the focus of
// the buttons and make a screen reader announce the warning again. A text is
// only written when it changed.

function setText(target: { textContent: string | null }, text: string): void {
  if (target.textContent !== text) {
    target.textContent = text;
  }
}

function setLabel(
  target: { title: string; setAttribute(name: string, value: string): void },
  label: string,
  hint: string,
): void {
  target.setAttribute("aria-label", label);
  target.title = hint;
}

interface ReleaseAllParts {
  button: {
    hidden: boolean | string;
    title: string;
    setAttribute(name: string, value: string): void;
  };
  label: { textContent: string | null };
}

/** Shown only while a tag is forced; its hint says why that matters to the PLC. */
export function showReleaseAll(parts: ReleaseAllParts, releaseAll: ClockView["releaseAll"]): void {
  parts.button.hidden = releaseAll === null;
  if (releaseAll !== null) {
    setText(parts.label, releaseAll.label);
    setLabel(parts.button, releaseAll.label, releaseAll.hint);
  }
}

function transportButton(iconName: IconName, onClick: () => void) {
  const label = element("span", { className: "transport__button-label" });
  const created = element(
    "button",
    { className: "button transport__button", attributes: { type: "button" } },
    [icon(iconName), label],
  );
  created.addEventListener("click", onClick);
  return { button: created, label };
}

export class TransportBar {
  private readonly host: HTMLElement;
  private intents: PanelIntents | null = null;
  private readonly toggle = transportButton("pause", () => this.intents?.toggleClockRunning());
  private readonly stepOne = transportButton("step", () => this.intents?.stepClock(1));
  private readonly stepTen = transportButton("step", () => this.intents?.stepClock(10));
  private readonly reset = transportButton("reset", () => this.intents?.resetSimulation());
  private readonly releaseAll = transportButton("unlock", () => this.intents?.releaseAllTags());
  private readonly time = element("span", { className: "transport__time" });
  private readonly steps = element("span", { className: "transport__steps" });
  private readonly warning = element("span", {
    className: "transport__warning",
    attributes: { role: "status" },
  });
  private shownWarning = "";
  private shownToggle = "";

  constructor(host: HTMLElement) {
    this.host = host;
    host.setAttribute("role", "group");
    this.warning.hidden = true;
    host.append(
      this.toggle.button,
      this.stepOne.button,
      this.stepTen.button,
      this.reset.button,
      this.releaseAll.button,
      this.time,
      this.steps,
      this.warning,
    );
  }

  render(view: ClockView, intents: PanelIntents): void {
    this.intents = intents;
    this.host.hidden = !view.visible;
    this.host.setAttribute("aria-label", view.barLabel);
    this.renderButtons(view);
    setText(this.time, view.timeText);
    setText(this.steps, view.stepText);
    this.time.title = view.timeLabel;
    this.steps.title = view.stepLabel;
    this.renderWarning(view);
  }

  private renderButtons(view: ClockView): void {
    const { toggle, stepOne, stepTen } = this;
    toggle.button.disabled = !view.canToggle;
    // Rewritten only when it changed: this runs at every pose.
    const toggleSignature = `${view.running}|${view.toggleLabel}|${view.toggleHint}`;
    if (toggleSignature !== this.shownToggle) {
      this.shownToggle = toggleSignature;
      setText(toggle.label, view.toggleLabel);
      setLabel(toggle.button, view.toggleLabel, view.toggleHint);
      // The icon shows the action the button does, as its text does.
      toggle.button.querySelector("svg")?.replaceWith(icon(view.running ? "pause" : "play"));
    }
    setText(stepOne.label, view.stepOneLabel);
    setLabel(stepOne.button, view.stepOneLabel, view.stepOneHint);
    setText(stepTen.label, view.stepTenLabel);
    setLabel(stepTen.button, view.stepTenLabel, view.stepTenHint);
    setText(this.reset.label, view.resetLabel);
    setLabel(this.reset.button, view.resetLabel, view.resetHint);
    this.reset.button.disabled = !view.canReset;
    showReleaseAll(this.releaseAll, view.releaseAll);
    stepOne.button.disabled = !view.canStep;
    stepTen.button.disabled = !view.canStep;
  }

  // The icon is a second cue next to the colour, the text the accessible name.
  private renderWarning(view: ClockView): void {
    const { warning } = view;
    this.warning.hidden = warning === null;
    const signature = warning === null ? "" : `${warning.text}|${warning.tooltip}`;
    if (signature !== this.shownWarning) {
      this.shownWarning = signature;
      this.warning.replaceChildren(
        ...(warning === null ? [] : [icon("warning"), element("span", { text: warning.text })]),
      );
      this.warning.title = warning?.tooltip ?? "";
    }
  }
}
