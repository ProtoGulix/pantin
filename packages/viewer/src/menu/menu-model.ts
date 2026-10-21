import { CENTRAL_VIEWS, showsViewport } from "../central-layout.ts";
import { isDeviceKind } from "../device-selection.ts";
import { LANGUAGES, type Translate } from "../i18n/translate.ts";
import { NAVIGATION_PRESET_IDS } from "../navigation/navigation-presets.ts";
import { ARROW_STEPS_DEGREES } from "../navigation/navigation-settings.ts";
import { STANDARD_VIEW_IDS } from "../navigation/standard-views.ts";
import { THEME_CHOICES } from "../theme/theme.ts";
import type { ViewerState } from "../viewer-state.ts";
import { EDIT_MENU } from "./edit-menu.ts";
import { type MenuContext, menuContext } from "./menu-context.ts";
import {
  arrowStepItem,
  item,
  languageItem,
  type MenuCommand,
  type MenuDefinition,
  type MenuEntryDefinition,
  type MenuId,
  navigationPresetItem,
  navigationToggleItem,
  normalToItem,
  previousViewItem,
  type Shortcut,
  standardViewItem,
  themeItem,
  zoneViewItem,
} from "./menu-definitions.ts";

export type { MenuCommand } from "./menu-definitions.ts";

// The menu bar as data: menus, items, enable rules and keyboard shortcuts.
// Adding an item (e.g. Fichier > Exporter) is adding one entry to MENUS.

const MENUS: readonly MenuDefinition[] = [
  {
    id: "file",
    labelKey: "menubar.file",
    entries: [
      item("welcome", "menubar.file.welcome", (context) => !context.editing),
      item("open", "menubar.file.open", (context) => !context.busy),
      item(
        "save",
        "menubar.file.save",
        (context) =>
          context.editing && (context.unsavedChanges || context.changedOutside) && !context.busy,
        {
          key: "s",
          primaryModifier: true,
          labelKey: "shortcut.save",
        },
      ),
      item(
        "import",
        "menubar.file.import",
        (context) => context.editing && !context.busy && !context.importing,
      ),
      item(
        "cleanOrphans",
        "menubar.file.cleanOrphans",
        (context) => context.editing && !context.busy && !context.importing,
      ),
      "separator",
      item("close", "menubar.file.close", (context) => context.editing),
    ],
  },
  EDIT_MENU,
  {
    id: "view",
    labelKey: "menubar.view",
    entries: [
      item(
        "frameAll",
        "menubar.view.frameAll",
        (context) => context.hasBodies && showsViewport(context.centralLayout),
        { key: "f", primaryModifier: false, labelKey: "shortcut.frameAll" },
      ),
      item(
        "frameSelection",
        "menubar.view.frameSelection",
        (context) =>
          context.hasBodies &&
          context.selectedKind !== null &&
          !isDeviceKind(context.selectedKind) &&
          showsViewport(context.centralLayout),
      ),
      "separator",
      ...STANDARD_VIEW_IDS.map(standardViewItem),
      normalToItem(),
      previousViewItem(),
      "separator",
      {
        ...item("toggleInspector", "menubar.view.inspector", (context) => context.editing),
        // Checked while the drives panel is shown (ADR 0022).
        checked: (context) => context.inspectorOpen,
      },
      {
        ...item("toggleConsole", "menubar.view.console", (context) => context.editing, {
          key: "F8",
          primaryModifier: false,
          labelKey: "shortcut.toggleConsole",
        }),
        // Checked while the console is shown (ADR 0031 point 5).
        checked: (context) => context.consoleOpen,
      },
      "separator",
      item("cycleLayout", "menubar.view.cycleLayout", (context) => context.editing, {
        key: "F4",
        primaryModifier: false,
        labelKey: "shortcut.cycleLayout",
      }),
      ...CENTRAL_VIEWS.map((view) => zoneViewItem("top", view)),
      ...CENTRAL_VIEWS.map((view) => zoneViewItem("bottom", view)),
      item(
        "openBottomZone",
        "menubar.view.openBottomZone",
        (context) => context.editing && context.centralLayout.bottom === null,
      ),
      item(
        "closeBottomZone",
        "menubar.view.closeBottomZone",
        (context) => context.editing && context.centralLayout.bottom !== null,
      ),
      "separator",
      navigationToggleItem(
        "perspective",
        "menubar.view.perspective",
        (context) => context.navigation.perspective,
      ),
      ...NAVIGATION_PRESET_IDS.map(navigationPresetItem),
      navigationToggleItem(
        "reverseWheel",
        "menubar.view.reverseWheel",
        (context) => context.navigation.reverseWheel,
      ),
      ...ARROW_STEPS_DEGREES.map(arrowStepItem),
      "separator",
      ...LANGUAGES.map(languageItem),
      ...THEME_CHOICES.map(themeItem),
    ],
  },
  {
    id: "help",
    labelKey: "menubar.help",
    entries: [
      item("documentation", "menubar.help.documentation", () => true),
      item("about", "menubar.help.about", () => true),
    ],
  },
];

export type MenuEntryView =
  | {
      type: "item";
      command: MenuCommand;
      label: string;
      shortcutLabel: string | null;
      enabled: boolean;
      // null: not a checkable item.
      checked: boolean | null;
    }
  | { type: "separator" };

export interface MenuView {
  id: MenuId;
  label: string;
  entries: MenuEntryView[];
}

function entryView(
  entry: MenuEntryDefinition,
  context: MenuContext,
  translate: Translate,
): MenuEntryView {
  if (entry === "separator") {
    return { type: "separator" };
  }
  return {
    type: "item",
    command: entry.command,
    label: entry.label(translate),
    shortcutLabel: entry.shortcut === undefined ? null : translate(entry.shortcut.labelKey),
    enabled: entry.enabled(context),
    checked: entry.checked === undefined ? null : entry.checked(context),
  };
}

export function buildMenuBar(state: ViewerState, translate: Translate): MenuView[] {
  const context = menuContext(state);
  return MENUS.map((menu) => ({
    id: menu.id,
    label: translate(menu.labelKey),
    entries: menu.entries.map((entry) => entryView(entry, context, translate)),
  }));
}

export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
  // The physical key ("Digit8", "Numpad8"): digits are read from it, see `keyMatches`.
  code?: string;
  // True while the user types in a text field: shortcuts never fire then.
  inEditableField: boolean;
}

// A digit is the same physical key on every layout, but its character is not: AZERTY gives
// "_" for Ctrl+8. So a digit shortcut follows the physical key; other keys follow the
// character, so that Z stays the Z of the user's layout. Without a code, the character counts.
function keyMatches(shortcut: Shortcut, press: KeyPress): boolean {
  if (/^[0-9]$/.test(shortcut.key) && press.code !== undefined && press.code !== "") {
    return press.code === `Digit${shortcut.key}` || press.code === `Numpad${shortcut.key}`;
  }
  return press.key.toLowerCase() === shortcut.key.toLowerCase();
}

function matches(shortcut: Shortcut, press: KeyPress): boolean {
  const primary = press.ctrlKey || press.metaKey;
  return (
    !press.altKey &&
    (shortcut.shift === undefined || shortcut.shift === (press.shiftKey ?? false)) &&
    primary === shortcut.primaryModifier &&
    keyMatches(shortcut, press)
  );
}

export interface ShortcutMatch {
  command: MenuCommand;
  // Ctrl/Cmd shortcuts: handled before the focused field sees them, and their
  // browser default (Ctrl+S "save page") is always blocked, even when they do
  // not run. F2 and Suppr keep their normal meaning in a text field.
  primaryModifier: boolean;
  // The key is left to the focused text field, which has its own use for it.
  yieldsToField: boolean;
  // Run only when the command is enabled and the user is not typing.
  run: boolean;
}

/** The shortcut a key press matches, whether or not it may run; null if none. */
export function shortcutForKeyPress(state: ViewerState, press: KeyPress): ShortcutMatch | null {
  const context = menuContext(state);
  for (const menu of MENUS) {
    for (const entry of menu.entries) {
      if (entry !== "separator" && entry.shortcut !== undefined && matches(entry.shortcut, press)) {
        const run = entry.enabled(context) && !press.inEditableField;
        const { primaryModifier } = entry.shortcut;
        return {
          command: entry.command,
          primaryModifier,
          yieldsToField: entry.shortcut.yieldsToTextField === true && press.inEditableField,
          run,
        };
      }
    }
  }
  return null;
}

export interface ShortcutListing {
  keys: string;
  action: string;
}

/** The keyboard shortcuts of the menus, for the welcome dialog's resources. */
export function listShortcuts(translate: Translate): ShortcutListing[] {
  return MENUS.flatMap((menu) =>
    menu.entries.flatMap((entry) =>
      entry === "separator" || entry.shortcut === undefined
        ? []
        : [{ keys: translate(entry.shortcut.labelKey), action: entry.label(translate) }],
    ),
  );
}
