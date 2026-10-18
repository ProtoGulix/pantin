import type { DriveRuntime } from "@pantin/protocol";
import type { JournalView } from "../bridge/bridge-journal.ts";
import type { BridgeView } from "../bridge/bridge-view.ts";
import { effectiveLayout } from "../central-layout.ts";
import type { ClockView } from "../clock/clock-model.ts";
import type { ConsoleView } from "../console/console-view.ts";
import type { DiagramModel } from "../diagram/diagram-view-model.ts";
import type { ThemeName } from "../theme/theme.ts";
import type { PanelView } from "../view-model.ts";
import { CentralArea } from "./central-area.ts";
import { ConsolePanel } from "./console-panel.ts";
import { DiagramView } from "./diagram-view.ts";
import { Inspector } from "./inspector.ts";
import { IoPanel } from "./io-panel.ts";
import { JournalDialog } from "./journal-dialog.ts";
import { MenuBar } from "./menu-bar.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { SidePanel } from "./side-panel.ts";
import { TransportBar } from "./transport-bar.ts";
import { ViewCube } from "./view-cube.ts";
import { WelcomeDialog } from "./welcome-dialog.ts";

// Everything the page draws from the view, built from the elements of index.html.

function requireElement<Kind extends HTMLElement>(selector: string, kind: new () => Kind): Kind {
  const found = document.querySelector(selector);
  if (!(found instanceof kind)) {
    throw new Error(`index.html must contain ${selector} (${kind.name}).`);
  }
  return found;
}

export interface Screen {
  canvas: HTMLCanvasElement;
  render(view: PanelView, intents: PanelIntents): void;
  showJointPositions(positions: ReadonlyMap<string, number>): void;
  showInspectorLive(
    tags: ReadonlyMap<string, number>,
    runtime: ReadonlyMap<string, DriveRuntime>,
    forced: ReadonlySet<string>,
  ): void;
  renderDiagram(model: DiagramModel, intents: PanelIntents): void;
  showDiagramLive(
    tags: ReadonlyMap<string, number>,
    runtime: ReadonlyMap<string, DriveRuntime>,
    forced: ReadonlySet<string>,
  ): void;
  showConsoleLive(view: ConsoleView | null): void;
  showClock(view: ClockView, intents: PanelIntents): void;
  showBridge(view: BridgeView | null, intents: PanelIntents): void;
  showBridgeJournal(view: JournalView | null, intents: PanelIntents): void;
  showCameraOrientation(alpha: number, beta: number): void;
  /** The theme changed: what the screen draws as data colours follows. */
  setTheme(theme: ThemeName): void;
}

// Its counter sits in the toolbar of the side panel, which is redrawn: looked up when needed.
function createConsolePanel(sidePanel: HTMLElement): ConsolePanel {
  return new ConsolePanel(
    requireElement("#console", HTMLElement),
    requireElement(".central", HTMLElement),
    () => sidePanel.querySelector<HTMLElement>(".console-counter"),
  );
}

// Over the canvas, under the welcome dialog.
function createDiagramView(): DiagramView {
  return new DiagramView(
    requireElement(".viewport", HTMLElement),
    requireElement("#welcome", HTMLElement),
  );
}

// Same place as the diagram: over the canvas, under the welcome dialog.
function createIoPanel(): IoPanel {
  return new IoPanel(
    requireElement(".viewport", HTMLElement),
    requireElement("#welcome", HTMLElement),
  );
}

function writePageTexts(
  view: PanelView,
  panel: HTMLElement,
  canvas: HTMLCanvasElement,
  hint: HTMLElement,
): void {
  document.documentElement.lang = view.language;
  panel.setAttribute("aria-label", view.translate("page.panelLabel"));
  canvas.setAttribute("aria-label", view.translate("page.viewportLabel"));
  hint.textContent = view.viewportHint;
}

// Entering the edit mode puts the keyboard in the tree, the view mode in the canvas.
function createWelcomeDialog(sidePanel: SidePanel, canvas: HTMLCanvasElement): WelcomeDialog {
  return new WelcomeDialog(requireElement("#welcome", HTMLElement), (mode) =>
    mode === "edit" ? sidePanel.focusTree() : canvas.focus(),
  );
}

// Everything drawn from the view: menu bar, left panel, welcome dialog, texts of index.html.
export function createScreen(): Screen {
  const panel = requireElement("#side-panel", HTMLElement);
  const canvas = requireElement("#viewport-canvas", HTMLCanvasElement);
  const hint = requireElement("#viewport-hint", HTMLElement);
  const sidePanel = new SidePanel(panel, requireElement(".layout", HTMLElement));
  const welcome = createWelcomeDialog(sidePanel, canvas);
  const journal = new JournalDialog(requireElement("#journal", HTMLElement));
  const diagram = createDiagramView();
  const ioPanel = createIoPanel();
  const centralArea = new CentralArea(requireElement(".viewport", HTMLElement));
  const consolePanel = createConsolePanel(panel);
  const transportBar = new TransportBar(requireElement("#transport", HTMLElement));
  const inspector = new Inspector(requireElement("#inspector", HTMLElement));
  const viewCube = new ViewCube(requireElement("#view-cube", HTMLElement), canvas);
  const menuBar = new MenuBar(requireElement("#menu-bar", HTMLElement), sidePanel.callbacks);
  return {
    canvas,
    render: (view, intents) => {
      writePageTexts(view, panel, canvas, hint);
      menuBar.render(view.menus, view.translate, intents);
      sidePanel.render(view, intents);
      centralArea.render(
        effectiveLayout(view.toolbar.centralLayout, view.toolbar.mode === "edit"),
        view.translate,
      );
      ioPanel.render(view.io, view.translate, view.language, intents);
      consolePanel.render(view.console, view.translate, intents);
      welcome.render(view, intents);
      viewCube.render(view, intents);
      inspector.render(view.inspector, view.translate, intents);
    },
    showJointPositions: (positions) => inspector.showJointPositions(positions),
    showInspectorLive: (tags, runtime, forced) => inspector.showLive(tags, runtime, forced),
    renderDiagram: (model, intents) => diagram.render(model, intents),
    showDiagramLive: (tags, runtime, forced) => diagram.showLive(tags, runtime, forced),
    showConsoleLive: (view) => consolePanel.showLive(view),
    showClock: (view, intents) => transportBar.render(view, intents),
    showBridge: (view, intents) => sidePanel.showBridge(view, intents),
    showBridgeJournal: (view, intents) => journal.render(view, intents),
    showCameraOrientation: (alpha, beta) => viewCube.showOrientation(alpha, beta),
    setTheme: (theme) => viewCube.setTheme(theme),
  };
}
