import type { CentralLayout } from "../central-layout.ts";
import type { DragKind } from "../gizmo/placement-snapping.ts";
import type { Language, MessageKey, Translate } from "../i18n/translate.ts";
import type { NavigationPresetId } from "../navigation/navigation-presets.ts";
import type { StandardViewId } from "../navigation/standard-views.ts";
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
  | `view:${StandardViewId}`
  | "perspective"
  | "reverseWheel"
  | `arrowStep:${number}`
  | `navigation:${NavigationPresetId}`
  | "gizmoMove"
  | "gizmoRotate"
  | "align"
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

/** "Souris : SolidWorks" and "Souris : ZW3D" (ADR 0036 point 1): checked on the preset in use. */
export function navigationPresetItem(preset: NavigationPresetId): MenuItemDefinition {
  return {
    command: `navigation:${preset}`,
    label: (translate) => translate(`menubar.view.navigation.${preset}`),
    enabled: always,
    checked: (context) => context.navigation.preset === preset,
  };
}

/** A checkable item of the 3D view's settings, always available. */
export function navigationToggleItem(
  command: "perspective" | "reverseWheel",
  labelKey: MessageKey,
  isOn: (context: MenuContext) => boolean,
): MenuItemDefinition {
  return { ...item(command, labelKey, always), checked: isOn };
}

/** "Pas des flèches : 15°" (ADR 0036 point 7): checked on the step in use. */
export function arrowStepItem(degrees: number): MenuItemDefinition {
  return {
    command: `arrowStep:${degrees}`,
    label: (translate) => translate("menubar.view.arrowStep", { degrees }),
    enabled: always,
    checked: (context) => context.navigation.arrowStepDegrees === degrees,
  };
}

const VIEW_SHORTCUT_KEYS: Readonly<Record<StandardViewId, string>> = {
  front: "1",
  back: "2",
  left: "3",
  right: "4",
  top: "5",
  bottom: "6",
  isometric: "7",
};

/** A standard view of the Affichage menu, on Ctrl+1 to Ctrl+7 in the SolidWorks order. */
export function standardViewItem(id: StandardViewId): MenuItemDefinition {
  return item(`view:${id}`, `view.${id}`, (context) => context.viewsAvailable, {
    key: VIEW_SHORTCUT_KEYS[id],
    primaryModifier: true,
    labelKey: `shortcut.view.${id}`,
  });
}
