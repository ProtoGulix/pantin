import { LengthUnitSchema, type PantinResponse, UpAxisSchema } from "@pantin/protocol";
import type { PantinApiClient } from "./api-client.ts";
import { buildImportQuery, createPendingImport } from "./import-options.ts";
import type { Viewport } from "./scene/viewport.ts";
import type { PanelIntents } from "./ui/panel-intents.ts";
import { buildPanelView, describeFailure, type PanelView } from "./view-model.ts";
import {
  INITIAL_VIEWER_STATE,
  type ViewerState,
  withOpenPantin,
  withRequestFinished,
  withRequestStarted,
  withSelectedBody,
} from "./viewer-state.ts";

// Glue between the user's intents, the API and what is displayed. It holds
// the only mutable state of the viewer; every decision about what to show is
// in the pure modules it calls.

export interface ControllerPorts {
  api: PantinApiClient;
  renderPanel(view: PanelView, intents: PanelIntents): void;
  // A getter because the viewport is created after the controller: its
  // callbacks need the controller.
  viewport(): Viewport;
}

export class ViewerController {
  private readonly ports: ControllerPorts;
  private state: ViewerState = INITIAL_VIEWER_STATE;
  // Kept outside ViewerState: a File is a browser handle, not display data.
  private pendingImportFile: File | null = null;
  // Last Pantin the user asked to open, to ignore answers that arrive late.
  private requestedPantinId: string | null = null;

  readonly intents: PanelIntents = {
    openPantin: (pantinId) => void this.openPantin(pantinId),
    createPantin: (name) => void this.createPantin(name),
    renamePantin: (name) =>
      void this.editOpenPantin((pantinId) => this.ports.api.renamePantin(pantinId, name), true),
    savePantin: () =>
      void this.editOpenPantin((pantinId) => this.ports.api.savePantin(pantinId), true),
    chooseImportFile: (file) => this.chooseImportFile(file),
    changeImportUnit: (rawUnit) => this.changeImportOptions(rawUnit, undefined),
    changeImportUpAxis: (rawUpAxis) => this.changeImportOptions(undefined, rawUpAxis),
    confirmImport: () =>
      void this.confirmImport().catch((error: unknown) => this.showError(describeFailure(error))),
    cancelImport: () => {
      this.pendingImportFile = null;
      this.update({ ...this.state, pendingImport: null });
    },
    selectBody: (bodyId) => this.selectBody(bodyId),
    renameBody: (bodyId, name) =>
      void this.editOpenPantin(
        (pantinId) => this.ports.api.renameBody(pantinId, bodyId, name),
        false,
      ),
    dismissError: () => this.update({ ...this.state, errorMessage: null }),
  };

  constructor(ports: ControllerPorts) {
    this.ports = ports;
  }

  start(): void {
    this.update(this.state);
    void this.refreshList();
  }

  selectBody(bodyId: string | null): void {
    if (bodyId !== this.state.selectedBodyId) {
      this.update(withSelectedBody(this.state, bodyId));
    }
  }

  showError(message: string): void {
    this.update({ ...this.state, errorMessage: message });
  }

  private update(next: ViewerState): void {
    this.state = next;
    this.ports.renderPanel(buildPanelView(next), this.intents);
    const viewport = this.ports.viewport();
    viewport.showBodies(next.openPantin?.id ?? null, next.openPantin?.document.bodies ?? []);
    viewport.setSelectedBody(next.selectedBodyId);
  }

  // Runs one API call with the busy indicator, and turns any failure into a
  // message for the user: nothing is swallowed. Resolves with undefined on failure.
  private async run<Result>(
    request: () => Promise<Result>,
    apply: (current: ViewerState, result: Result) => ViewerState,
  ): Promise<Result | undefined> {
    this.update(withRequestStarted(this.state));
    try {
      const result = await request();
      this.update(apply(withRequestFinished(this.state), result));
      return result;
    } catch (error) {
      this.update({ ...withRequestFinished(this.state), errorMessage: describeFailure(error) });
      return undefined;
    }
  }

  private applyIfStillRequested(current: ViewerState, response: PantinResponse): ViewerState {
    return this.requestedPantinId === response.id ? withOpenPantin(current, response) : current;
  }

  private async refreshList(): Promise<void> {
    await this.run(
      () => this.ports.api.listPantins(),
      (current, pantins) => ({ ...current, pantins }),
    );
  }

  private async openPantin(pantinId: string): Promise<void> {
    this.requestedPantinId = pantinId;
    this.pendingImportFile = null;
    await this.run(
      () => this.ports.api.getPantin(pantinId),
      (current, response) => this.applyIfStillRequested(current, response),
    );
  }

  private async createPantin(name: string): Promise<void> {
    await this.run(
      () => this.ports.api.createPantin(name),
      (current, created) => {
        this.requestedPantinId = created.id;
        this.pendingImportFile = null;
        return withOpenPantin(current, created);
      },
    );
    await this.refreshList();
  }

  // Every edit is followed by a fresh read of the Pantin: the core owns
  // unsavedChanges. Resolves with the edit's own result, undefined on failure.
  private async editOpenPantin<Result>(
    edit: (pantinId: string) => Promise<Result>,
    alsoRefreshList: boolean,
  ): Promise<Result | undefined> {
    const pantinId = this.state.openPantin?.id;
    if (pantinId === undefined) {
      return undefined;
    }
    const outcome = await this.run(
      async () => {
        const result = await edit(pantinId);
        return { result, pantin: await this.ports.api.getPantin(pantinId) };
      },
      (current, { pantin }) => this.applyIfStillRequested(current, pantin),
    );
    if (alsoRefreshList) {
      await this.refreshList();
    }
    return outcome?.result;
  }

  private chooseImportFile(file: File): void {
    const pendingImport = createPendingImport(file.name);
    if (pendingImport === null) {
      this.showError(`"${file.name}" is not supported. Choose a .glb or .stl file.`);
      return;
    }
    this.pendingImportFile = file;
    this.update({ ...this.state, pendingImport, errorMessage: null });
  }

  // Form values are external input: validated by the contract's schemas.
  private changeImportOptions(rawUnit: string | undefined, rawUpAxis: string | undefined): void {
    const pendingImport = this.state.pendingImport;
    if (pendingImport === null) {
      return;
    }
    const unit = LengthUnitSchema.safeParse(rawUnit ?? pendingImport.unit);
    const upAxis = UpAxisSchema.safeParse(rawUpAxis ?? pendingImport.upAxis);
    if (!unit.success || !upAxis.success) {
      this.showError("Unknown unit or up axis; choose one from the list.");
      return;
    }
    this.update({
      ...this.state,
      pendingImport: { ...pendingImport, unit: unit.data, upAxis: upAxis.data },
    });
  }

  private async confirmImport(): Promise<void> {
    const file = this.pendingImportFile;
    const pendingImport = this.state.pendingImport;
    if (file === null || pendingImport === null) {
      return;
    }
    const bytes = await file.arrayBuffer();
    const importedBody = await this.editOpenPantin(
      (pantinId) => this.ports.api.importBody(pantinId, buildImportQuery(pendingImport), bytes),
      true,
    );
    if (importedBody !== undefined) {
      this.pendingImportFile = null;
      this.update(withSelectedBody({ ...this.state, pendingImport: null }, importedBody.id));
    }
  }
}
