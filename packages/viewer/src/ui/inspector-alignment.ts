import type { AlignmentStepView, AlignmentView } from "../alignment/alignment-view.ts";
import type { Translate } from "../i18n/translate.ts";
import { button, committingTextInput, element, selectInput } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { glyphThenText } from "./state-glyph.ts";

// The alignment block of the "Positionnement" section (ADR 0039 point 4): thin
// DOM over alignment/alignment-view.ts. Every control has a data-focus-key, so
// that the redraw of the inspector gives the focus back (ui/focus.ts). The
// picks themselves are clicks in the 3D view; a done pick is a button that
// makes it the current one again.

function stepRow(
  step: AlignmentStepView,
  index: number,
  t: Translate,
  intents: PanelIntents,
): HTMLElement {
  const parts = [
    element(
      "span",
      { className: "alignment__step-label" },
      step.status === "done"
        ? glyphThenText("check", step.label)
        : [document.createTextNode(step.label)],
    ),
    element("span", { className: "alignment__step-detail", text: step.detail }),
  ];
  const className = `alignment__step alignment__step--${step.status}`;
  if (!step.picked) {
    return element("li", {}, [element("div", { className }, parts)]);
  }
  const pick = button("", className, () => intents.chooseAlignmentPick(index));
  pick.append(...parts);
  pick.title = t("alignment.repick");
  pick.setAttribute("data-focus-key", `alignment-pick-${index}`);
  return element("li", {}, [pick]);
}

function labelled(text: string, control: HTMLElement): HTMLElement {
  return element("label", { className: "alignment__field" }, [element("span", { text }), control]);
}

function checkbox(
  focusKey: string,
  checked: boolean,
  disabled: boolean,
  onChange: (checked: boolean) => void,
): HTMLInputElement {
  const input = element("input", {
    attributes: { type: "checkbox", "data-focus-key": focusKey },
  });
  input.checked = checked;
  input.disabled = disabled;
  input.addEventListener("change", () => onChange(input.checked));
  return input;
}

// Enter commits the text, then applies when every pick is made. The blur
// commits (dom.ts) before the apply reads the session.
function numberField(
  field: "offset" | "rotation",
  text: string,
  label: string,
  view: AlignmentView,
  intents: PanelIntents,
): HTMLInputElement {
  const input = committingTextInput(text, {
    label,
    focusKey: `alignment-${field}`,
    onCommit: (value) => intents.setAlignmentText(field, value),
    focusOnEnter: () => {
      input.blur();
      if (view.applyEnabled) {
        intents.applyAlignment();
      }
    },
  });
  input.classList.add("alignment__number");
  input.setAttribute("inputmode", "decimal");
  return input;
}

function parameterFields(view: AlignmentView, t: Translate, intents: PanelIntents): HTMLElement[] {
  const fields: HTMLElement[] = [];
  if (view.flip !== null) {
    const flip = checkbox("alignment-flip", view.flip, false, intents.setAlignmentFlip);
    fields.push(labelled(t("alignment.flip"), flip));
  }
  if (view.offsetText !== null) {
    const label = t("alignment.offset");
    fields.push(labelled(label, numberField("offset", view.offsetText, label, view, intents)));
  }
  if (view.rotationText !== null) {
    const label = t("alignment.rotation");
    fields.push(labelled(label, numberField("rotation", view.rotationText, label, view, intents)));
  }
  return fields;
}

function fixedJointField(view: AlignmentView, t: Translate, intents: PanelIntents): HTMLElement {
  const { checked, enabled, note } = view.fixedJoint;
  const field = labelled(
    t("alignment.fixedJoint"),
    checkbox("alignment-fixed-joint", checked, !enabled, intents.setAlignmentFixedJoint),
  );
  return note === null
    ? field
    : element("div", {}, [field, element("p", { className: "alignment__note", text: note })]);
}

function actionRow(view: AlignmentView, t: Translate, intents: PanelIntents): HTMLElement {
  const restart = button(t("alignment.restart"), "button", intents.restartAlignment);
  const apply = button(t("alignment.apply"), "button button--primary", intents.applyAlignment);
  restart.setAttribute("data-focus-key", "alignment-restart");
  apply.setAttribute("data-focus-key", "alignment-apply");
  apply.disabled = !view.applyEnabled;
  return element("div", { className: "alignment__actions" }, [restart, apply]);
}

export function renderAlignment(
  view: AlignmentView,
  t: Translate,
  intents: PanelIntents,
): HTMLElement {
  const label = t("alignment.kind.label");
  const kind = selectInput(view.kinds, view.kind, label, intents.chooseAlignmentKind);
  kind.setAttribute("data-focus-key", "alignment-kind");
  return element("div", { className: "alignment" }, [
    element("h4", { className: "alignment__title", text: view.title }),
    labelled(label, kind),
    element(
      "ol",
      { className: "alignment__steps" },
      view.steps.map((step, index) => stepRow(step, index, t, intents)),
    ),
    ...parameterFields(view, t, intents),
    fixedJointField(view, t, intents),
    view.clockNote === null
      ? null
      : element("p", { className: "alignment__note", text: view.clockNote }),
    actionRow(view, t, intents),
  ]);
}
