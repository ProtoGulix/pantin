import type { DriveRuntime } from "@pantin/protocol";
import type { PantinApiClient } from "../api-client.ts";
import type { JournalView } from "../bridge/bridge-journal.ts";
import type { BridgeView } from "../bridge/bridge-view.ts";
import type { OpcuaBridgeView } from "../bridge/opcua-view.ts";
import type { CentralLayout } from "../central-layout.ts";
import type { ClockView } from "../clock/clock-model.ts";
import type { ConsoleView } from "../console/console-view.ts";
import type { DiagramModel } from "../diagram/diagram-view-model.ts";
import type { GizmoSpace } from "../gizmo/gizmo-space.ts";
import type { SnapSteps } from "../gizmo/placement-snapping.ts";
import type { Language } from "../i18n/translate.ts";
import type { JointStarModel } from "../joint-star/joint-star-view-model.ts";
import type { NavigationSettings } from "../navigation/navigation-settings.ts";
import type { PoseStreamClient } from "../pose-stream-client.ts";
import type { Viewport } from "../scene/viewport.ts";
import type { ThemeChoice } from "../theme/theme.ts";
import type { PanelView } from "../view-model.ts";

// What the store writes to and reads from the page: every effect of the viewer
// crosses one of these ports, so the tests replace them (CLAUDE.md section 8).

export interface StorePorts {
  api: PantinApiClient;
  renderPanel(view: PanelView): void;
  // Joint sliders follow the poses without redrawing the panel: a redraw
  // would interrupt a drag.
  showJointPositions(positions: ReadonlyMap<string, number>): void;
  // Live values of the inspector (tags, drive diagnostics), written in place
  // for the same reason.
  showInspectorLive(
    tags: ReadonlyMap<string, number>,
    runtime: ReadonlyMap<string, DriveRuntime>,
    forced: ReadonlySet<string>,
  ): void;
  // The chain diagram (ADR 0029), redrawn from the model; the live state
  // (tags and drive runtime) reaches it without a redraw.
  renderDiagram(model: DiagramModel): void;
  // The joint star (ADR 0059), redrawn from the model.
  renderJointStar(model: JointStarModel): void;
  showDiagramLive(
    tags: ReadonlyMap<string, number>,
    runtime: ReadonlyMap<string, DriveRuntime>,
    forced: ReadonlySet<string>,
  ): void;
  // The console panel and its counter, written in place (ADR 0031 point 4).
  showConsoleLive(view: ConsoleView | null): void;
  // The transport bar (ADR 0032 point 10): its texts are written in place, so
  // a pose or a clock event never redraws the viewer.
  showClock(view: ClockView): void;
  // The bridge block of the side panel (ADR 0050 point 8), written in place too.
  showBridge(view: BridgeView | null): void;
  // The OPC UA card, next to it (ADR 0065 point 13).
  showOpcuaBridge(view: OpcuaBridgeView | null): void;
  // The bridge log window (ADR 0054 point 5), null while it is closed.
  showBridgeJournal(view: JournalView | null): void;
  // A getter because the viewport is created after the store: its callbacks
  // need the controller.
  viewport(): Viewport;
  poseStream: PoseStreamClient;
  // Hands a generated text file to the browser as a download.
  saveTextFile(fileName: string, text: string): void;
  // Opens a page outside the viewer in a new tab (the Help menu).
  openLink(url: string): void;
  storeLanguage(language: Language): void;
  // Remembers the theme choice and applies it to the page and the 3D view (ADR 0053).
  applyTheme(choice: ThemeChoice): void;
  storeCentralLayout(layout: CentralLayout): void;
  storeGizmoSteps(steps: SnapSteps): void;
  storeGizmoSpace(space: GizmoSpace): void;
  storeNavigation(settings: NavigationSettings): void;
  storeInspectorOpen(open: boolean): void;
  storeCollapsedGroups(groups: ReadonlySet<string>): void;
  // The verbose preference of the console (ADR 0061 point 8), sent to the core on opening.
  readConsoleVerbose(): boolean;
  storeConsoleVerbose(verbose: boolean): void;
}
