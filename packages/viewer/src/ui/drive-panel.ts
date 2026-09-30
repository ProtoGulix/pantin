import type { DriveRuntime, DriveType } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import { type DiagnosticLine, nextDiagnosticUpdate } from "../panel/drive-diagnostics.ts";
import type {
  DriveCardView,
  DriveFormView,
  DrivePanelView,
  DriveTagView,
} from "../panel/drive-panel-model.ts";
import { coordinateToDisplay, formatDisplayNumber } from "../units.ts";
import { renderActuatorSection } from "./actuator-section.ts";
import { button, element, iconButton, selectInput } from "./dom.ts";
import { captureFocus, restoreFocus } from "./focus.ts";
import { checkbox, field, formInput, valueSpan } from "./panel-fields.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { renderSensorSection } from "./sensor-section.ts";

// The drives panel on the right (ADR 0022, 0028): drives commanded without a
// PLC, then the actuators they feed, then the sensors. Redrawn from its view on every change; the
// tag values alone are written in place by showTagValues, several times a
// second, so that typing in the panel is never disturbed.

function renderParameters(form: DriveFormView, intents: PanelIntents) {
  const inputs = form.parameters.map((parameter) =>
    field(
      parameter.unit === null ? parameter.label : `${parameter.label} (${parameter.unit})`,
      formInput(`drive-${parameter.field}`, parameter.value, parameter.label, (text) =>
        intents.editDriveParameter(parameter.field, text),
      ),
    ),
  );
  const hint =
    form.unitHint === null
      ? null
      : element("p", { className: "drive-panel__detail", text: form.unitHint });
  return [hint, ...inputs];
}

function renderForm(form: DriveFormView, t: Translate, intents: PanelIntents): HTMLElement {
  const confirm = button(form.confirmLabel, "button button--primary", intents.submitDriveForm);
  confirm.disabled = !form.canSubmit;
  return element(
    "div",
    { className: "inline-form", attributes: { role: "group", "aria-label": form.title } },
    [
      element("div", { className: "inline-form__title", text: form.title }),
      field(
        t("drives.form.name"),
        formInput("drive-name", form.name, t("drives.form.name"), intents.editDriveName),
      ),
      field(
        t("drives.form.type"),
        selectInput(form.typeOptions, form.type, t("drives.form.type"), intents.changeDriveType),
      ),
      field(
        t("drives.form.assembly"),
        selectInput(
          form.assemblyOptions,
          form.assembly,
          t("drives.form.assembly"),
          intents.changeDriveAssembly,
        ),
      ),
      ...renderParameters(form, intents),
      element("div", { className: "inline-form__actions" }, [
        button(t("joint.form.cancel"), "button", intents.cancelDriveForm),
        confirm,
      ]),
    ],
  );
}

function tagControl(tag: DriveTagView, t: Translate, intents: PanelIntents): HTMLElement {
  if (tag.control === "bit") {
    const toggle = button(t("drives.bit.off"), "button drive-panel__bit", () =>
      intents.toggleBitTag(tag.name),
    );
    toggle.setAttribute("data-tag-value", tag.name);
    // A fixed name for screen readers; On or Off is what aria-pressed says.
    toggle.setAttribute("aria-label", tag.label);
    toggle.setAttribute("aria-pressed", "false");
    return toggle;
  }
  if (tag.control === "feedback") {
    return valueSpan(tag.name, tag.coordinateUnit);
  }
  const input = formInput(`tag-${tag.name}`, "", tag.label, () => undefined);
  const send = button(t("drives.send"), "button", () =>
    intents.writeFloatTag(tag.name, input.value),
  );
  return element("span", { className: "drive-panel__send" }, [
    input,
    send,
    valueSpan(tag.name, tag.coordinateUnit),
  ]);
}

function renderCard(card: DriveCardView, t: Translate, intents: PanelIntents): HTMLElement {
  const tags = card.tags.map((tag) =>
    element("div", { className: "drive-panel__row", attributes: { title: tag.name } }, [
      element("span", { text: tag.unit === null ? tag.label : `${tag.label} (${tag.unit})` }),
      tagControl(tag, t, intents),
    ]),
  );
  return element(
    "section",
    { className: "drive-panel__card", attributes: { "aria-label": card.name } },
    [
      element("div", { className: "drive-panel__card-head" }, [
        element("strong", { text: card.name }),
        element("span", {
          className: "drive-panel__detail",
          text: `${card.typeLabel} · ${card.tagPrefix}`,
        }),
      ]),
      // Filled by showDriveRuntime, which runs after every redraw and every tag read.
      element("div", {
        className: "drive-panel__diagnostics",
        attributes: { "data-drive-diagnostics": card.id, role: "status" },
      }),
      element("div", { className: "drive-panel__actions" }, [
        button(t("drives.edit"), "button", () => intents.openDriveForm(card.id)),
        button(t("drives.delete"), "button", () => intents.deleteDrive(card.id)),
        checkbox(t("drives.fault.unresponsive"), card.unresponsive, (on) =>
          intents.setDriveUnresponsive(card.id, on),
        ),
      ]),
      element("div", { className: "drive-panel__label", text: t("drives.tags") }),
      ...tags,
    ],
  );
}

function warningLine(line: DiagnosticLine): HTMLElement {
  return element("p", { className: "drive-panel__warning", attributes: { title: line.id } }, [
    // The glyph is a second cue next to the colour; the text says it all for screen readers.
    element("span", { text: "\u26A0", attributes: { "aria-hidden": "true" } }),
    element("span", { text: line.text }),
  ]);
}

export class DrivePanel {
  private readonly root: HTMLElement;
  private translate: Translate | null = null;
  // The type of each drawn drive, from the view rather than read back from the page.
  private driveTypes: ReadonlyMap<string, DriveType> = new Map();

  constructor(root: HTMLElement) {
    this.root = root;
  }

  render(view: DrivePanelView, t: Translate, intents: PanelIntents): void {
    this.translate = t;
    this.driveTypes = new Map(view.drives.map((card) => [card.id, card.type]));
    this.root.hidden = !view.open;
    if (!view.open) {
      this.root.replaceChildren();
      return;
    }
    const focus = captureFocus(this.root);
    this.root.setAttribute("aria-label", view.title);
    const parts = [
      element("div", { className: "drive-panel__head" }, [
        element("h2", { className: "drive-panel__title", text: view.title }),
        iconButton("close", t("joint.form.cancel"), intents.toggleDrivePanel),
      ]),
      this.renderDrives(view, t, intents),
      view.actuators === null ? null : renderActuatorSection(view.actuators, t, intents),
      view.sensors === null ? null : renderSensorSection(view.sensors, t, intents),
    ];
    this.root.replaceChildren(...parts.filter((part) => part !== null));
    restoreFocus(this.root, focus);
  }

  private renderDrives(view: DrivePanelView, t: Translate, intents: PanelIntents): HTMLElement {
    const create = button(t("drives.new"), "button", () => intents.openDriveForm(null));
    return element(
      "section",
      { className: "drive-panel__section", attributes: { "aria-label": view.drivesTitle } },
      [
        element("div", { className: "drive-panel__head" }, [
          element("h3", { className: "drive-panel__title", text: view.drivesTitle }),
          create,
        ]),
        view.form === null ? null : renderForm(view.form, t, intents),
        view.drives.length === 0
          ? element("p", { className: "drive-panel__empty", text: t("drives.empty") })
          : null,
        ...view.drives.map((card) => renderCard(card, t, intents)),
      ].filter((part) => part !== null),
    );
  }

  /** SI values from the core, shown in mm or degrees; bits as On or Off. */
  showTagValues(values: ReadonlyMap<string, number>): void {
    for (const target of this.root.querySelectorAll("[data-tag-value]")) {
      const value = values.get(target.getAttribute("data-tag-value") ?? "");
      if (value === undefined) {
        continue;
      }
      if (target instanceof HTMLButtonElement) {
        const on = value >= 0.5;
        target.textContent =
          this.translate?.(on ? "drives.bit.on" : "drives.bit.off") ?? String(value);
        target.setAttribute("aria-pressed", String(on));
        continue;
      }
      const unit = target.getAttribute("data-unit");
      const shown =
        unit === "metre" || unit === "radian" ? coordinateToDisplay(unit, value) : value;
      target.textContent = formatDisplayNumber(shown);
    }
  }

  /** Each active diagnostic as a warning line on its drive's card; none once it clears. */
  showDriveRuntime(runtime: ReadonlyMap<string, DriveRuntime>): void {
    const t = this.translate;
    if (t === null) {
      return;
    }
    for (const target of this.root.querySelectorAll("[data-drive-diagnostics]")) {
      const driveId = target.getAttribute("data-drive-diagnostics") ?? "";
      const driveType = this.driveTypes.get(driveId);
      if (driveType === undefined) {
        continue;
      }
      const update = nextDiagnosticUpdate(
        target.getAttribute("data-shown") ?? "",
        runtime.get(driveId)?.diagnostics ?? [],
        driveType,
        t,
      );
      if (update !== null) {
        target.setAttribute("data-shown", update.signature);
        target.replaceChildren(...update.lines.map(warningLine));
      }
    }
  }
}
