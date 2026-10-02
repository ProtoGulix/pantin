import type { AlignmentStepView, AlignmentView } from "../alignment/alignment-view.ts";
import type { Translate } from "../i18n/translate.ts";
import { button, element, iconButton, selectInput } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The alignment panel over the 3D view (ADR 0035 points 3, 5 and 8): the
// kind, one line per pick, the parameters and the fixed joint shortcut. The
// picks themselves are clicks in the 3D view. Rebuilt only when its structure
// changes; the typed fields are kept, so a value committed on blur neither
// steals the focus nor replaces the button being clicked.

// The two typed fields live as long as the panel.
type NumberFields = { offset: HTMLInputElement; rotation: HTMLInputElement };

function stepItem(step: AlignmentStepView): HTMLElement {
  return element(
    "li",
    { className: `alignment-panel__step alignment-panel__step--${step.status}` },
    [
      element("span", { className: "alignment-panel__step-label", text: step.label }),
      element("span", { className: "alignment-panel__step-detail", text: step.detail }),
    ],
  );
}

function labelled(text: string, control: HTMLElement): HTMLElement {
  return element("label", { className: "alignment-panel__field" }, [
    element("span", { text }),
    control,
  ]);
}

function checkbox(checked: boolean, disabled: boolean, onChange: (checked: boolean) => void) {
  const input = element("input", { attributes: { type: "checkbox" } });
  input.checked = checked;
  input.disabled = disabled;
  input.addEventListener("change", () => onChange(input.checked));
  return input;
}

function numberField(onChange: (text: string) => void): HTMLInputElement {
  const input = element("input", {
    className: "alignment-panel__number",
    attributes: { type: "text", inputmode: "decimal" },
  });
  input.addEventListener("change", () => onChange(input.value));
  return input;
}

function parameterFields(
  view: AlignmentView,
  t: Translate,
  intents: PanelIntents,
  inputs: NumberFields,
): HTMLElement[] {
  const fields: HTMLElement[] = [];
  if (view.flip !== null) {
    const flip = checkbox(view.flip, false, intents.setAlignmentFlip);
    fields.push(labelled(t("alignment.flip"), flip));
  }
  if (view.offsetText !== null) {
    fields.push(labelled(t("alignment.offset"), inputs.offset));
  }
  if (view.rotationText !== null) {
    fields.push(labelled(t("alignment.rotation"), inputs.rotation));
  }
  return fields;
}

function fixedJointField(view: AlignmentView, t: Translate, intents: PanelIntents): HTMLElement {
  const { checked, enabled, note } = view.fixedJoint;
  const field = labelled(
    t("alignment.fixedJoint"),
    checkbox(checked, !enabled, intents.setAlignmentFixedJoint),
  );
  return note === null
    ? field
    : element("div", {}, [field, element("p", { className: "alignment-panel__note", text: note })]);
}

function panelContent(
  view: AlignmentView,
  t: Translate,
  intents: PanelIntents,
  inputs: NumberFields,
): HTMLElement[] {
  const apply = button(t("alignment.apply"), "button button--primary", intents.applyAlignment);
  apply.disabled = !view.applyEnabled;
  const kind = selectInput(
    view.kinds,
    view.kind,
    t("alignment.kind.label"),
    intents.chooseAlignmentKind,
  );
  return [
    element("div", { className: "alignment-panel__header" }, [
      element("h2", { className: "alignment-panel__title", text: view.title }),
      iconButton("close", t("alignment.close"), () => intents.runMenuCommand("align")),
    ]),
    labelled(t("alignment.kind.label"), kind),
    element("ol", { className: "alignment-panel__steps" }, view.steps.map(stepItem)),
    element(
      "div",
      { className: "alignment-panel__parameters" },
      parameterFields(view, t, intents, inputs),
    ),
    fixedJointField(view, t, intents),
    element("p", { className: "alignment-panel__note", text: t("alignment.hint") }),
    element("div", { className: "alignment-panel__actions" }, [
      button(t("alignment.restart"), "button", intents.restartAlignment),
      apply,
    ]),
  ];
}

// What changes the panel's elements; the typed texts only change values.
function structureKey(view: AlignmentView | null): string {
  return JSON.stringify(view === null ? null : { ...view, offsetText: null, rotationText: null });
}

function showText(input: HTMLInputElement, text: string | null): void {
  // The field being typed in keeps what the user typed.
  if (text !== null && input.value !== text && input !== document.activeElement) {
    input.value = text;
  }
}

export class AlignmentPanel {
  private readonly root: HTMLElement;
  private shownKey = "";
  private intents: PanelIntents | null = null;
  private readonly inputs: NumberFields = {
    offset: numberField((text) => this.intents?.setAlignmentText("offset", text)),
    rotation: numberField((text) => this.intents?.setAlignmentText("rotation", text)),
  };

  constructor(root: HTMLElement) {
    this.root = root;
    root.setAttribute("role", "dialog");
  }

  render(view: AlignmentView | null, translate: Translate, intents: PanelIntents): void {
    this.intents = intents;
    const key = structureKey(view);
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.root.hidden = view === null;
      this.root.replaceChildren(
        ...(view === null ? [] : panelContent(view, translate, intents, this.inputs)),
      );
      if (view !== null) {
        this.root.setAttribute("aria-label", view.title);
      }
    }
    showText(this.inputs.offset, view?.offsetText ?? null);
    showText(this.inputs.rotation, view?.rotationText ?? null);
  }
}
