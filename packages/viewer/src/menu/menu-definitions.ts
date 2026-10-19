import { type CentralView, isViewDisabledIn, type Zone } from "../central-layout.ts";
import type { DragKind } from "../gizmo/placement-snapping.ts";
import type { Language, MessageKey, Translate } from "../i18n/translate.ts";
import type { NavigationPresetId } from "../navigation/navigation-presets.ts";
import type { StandardViewId } from "../navigation/standard-views.ts";
import type { ThemeChoice } from "../theme/theme.ts";
import type { MenuContext } from "./menu-context.ts";

// The vocabulary of the menu bar: commands, item definitions and the helpers
// that build them. The menus themselves are in menu-model.ts.

export type MenuCommand =
  | "welcome"
  | "open"
  | "save"
  | "import"
  | "cleanOrphans"
  | "close"
  | "newJoint"
  | "group"
  | "ungroup"
  | "resetSimulation"
  | "releaseAllTags"
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
  | "gizmoSpace"
  | "align"
  | "documentation"
  | "about"
  | "toggleInspector"
  | "toggleConsole"
  | "cycleLayout"
  | "openBottomZone"
  | "closeBottomZone"
  | `topView:${CentralView}`
  | `bottomView:${CentralView}`
  | `language:${Language}`
  | `theme:${ThemeChoice}`;

export type MenuId = "file" | "edit" | "view" | "help";

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

/** "Thème : Clair" (ADR 0053 point 1): checked on the choice in use, like the language. */
export function themeItem(choice: ThemeChoice): MenuItemDefinition {
  return {
    command: `theme:${choice}`,
    label: (translate) => translate("menubar.view.theme", { theme: translate(`theme.${choice}`) }),
    enabled: always,
    checked: (context) => context.themeChoice === choice,
  };
}

const VIEW_LABEL_KEYS: Readonly<Record<CentralView, MessageKey>> = {
  "3d": "view.3d",
  diagram: "view.diagram",
  joints: "view.joints",
  io: "view.io",
};

// "Vue du haut : 3D" and "Vue du bas : 3D": checked on the view of the zone, disabled when the
// other zone shows it (ADR 0059 amendment). The bottom zone's views open it when it is closed.
export function zoneViewItem(zone: Zone, view: CentralView): MenuItemDefinition {
  const command = zone === "top" ? (`topView:${view}` as const) : (`bottomView:${view}` as const);
  const labelKey: MessageKey = zone === "top" ? "menubar.view.topView" : "menubar.view.bottomView";
  return {
    command,
    label: (translate) => translate(labelKey, { view: translate(VIEW_LABEL_KEYS[view]) }),
    enabled: (context) => context.editing && !isViewDisabledIn(context.centralLayout, zone, view),
    checked: (context) => context.centralLayout[zone] === view,
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
