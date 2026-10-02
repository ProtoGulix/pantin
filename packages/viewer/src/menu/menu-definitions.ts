import type { CentralLayout } from "../central-layout.ts";
import type { DragKind } from "../gizmo/placement-snapping.ts";
import type { Language, MessageKey, Translate } from "../i18n/translate.ts";
import type { MenuContext } from "./menu-context.ts";

// The vocabulary of the menu bar: commands, item definitions and the helpers
// that build them. The menus themselves are in menu-model.ts.

export type MenuCommand =
  | "welcome"
  | "open"
  | "save"
  | "import"
  | "close"
  | "newJoint"
  | "rename"
  | "delete"
  | "frameAll"
  | "frameSelection"
  | "gizmoMove"
  | "gizmoRotate"
  | "toggleInspector"
  | "toggleConsole"
  | "cycleLayout"
  | `layout:${CentralLayout}`
  | `language:${Language}`;

export type MenuId = "file" | "edit" | "view";

export interface Shortcut {
  key: string;
  // Ctrl on Windows and Linux, Cmd on macOS.
  primaryModifier: boolean;
  labelKey: MessageKey;
}

export interface MenuItemDefinition {
  command: MenuCommand;
  label(translate: Translate): string;
  shortcut?: Shortcut;
  enabled(context: MenuContext): boolean;
  checked?(context: MenuContext): boolean;
}

export type MenuEntryDefinition = MenuItemDefinition | "separator";

export interface MenuDefinition {
  id: MenuId;
  labelKey: MessageKey;
  entries: readonly MenuEntryDefinition[];
}

const always = () => true;

export function item(
  command: MenuCommand,
  labelKey: MessageKey,
  enabled: (context: MenuContext) => boolean,
  shortcut?: Shortcut,
): MenuItemDefinition {
  const base = { command, label: (translate: Translate) => translate(labelKey), enabled };
  return shortcut === undefined ? base : { ...base, shortcut };
}

export function languageItem(language: Language): MenuItemDefinition {
  return {
    command: `language:${language}`,
    label: (translate) =>
      translate("menubar.view.language", { language: translate(`language.${language}`) }),
    enabled: always,
    checked: (context) => context.language === language,
  };
}

const LAYOUT_LABEL_KEYS: Readonly<Record<CentralLayout, MessageKey>> = {
  "3d": "menubar.view.layout3d",
  diagram: "menubar.view.layoutDiagram",
  both: "menubar.view.layoutBoth",
};

// Explicit entries next to the F4 cycle, checked on the layout in use (ADR 0030).
export function layoutItem(layout: CentralLayout): MenuItemDefinition {
  return {
    ...item(`layout:${layout}`, LAYOUT_LABEL_KEYS[layout], (context) => context.editing),
    checked: (context) => context.centralLayout === layout,
  };
}

/** "Déplacer" and "Tourner" (ADR 0034 point 3): checked while that gizmo is on. */
export function gizmoItem(
  command: "gizmoMove" | "gizmoRotate",
  labelKey: MessageKey,
  key: string,
  shortcutLabelKey: MessageKey,
  kind: DragKind,
): MenuItemDefinition {
  return {
    ...item(command, labelKey, (context) => context.gizmoAvailable, {
      key,
      primaryModifier: false,
      labelKey: shortcutLabelKey,
    }),
    checked: (context) => context.gizmoMode === kind,
  };
}
