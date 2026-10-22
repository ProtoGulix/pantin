import { OPCUA_CLIENT_KIND } from "@pantin/transport-types/schemas";
import { withMapping } from "../io/io-state.ts";
import {
  withProposalApplied,
  withProposalApplying,
  withProposalRefused,
} from "../io/symbol-import-state.ts";
import { describeFailure } from "../messages.ts";
import { withRequestFinished, withRequestStarted } from "../request-count.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { loadIoMapping } from "./io-load.ts";
import { refreshPantinList } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Applying the NodeId prefix the symbol file proposes for an OPC UA module (ADR 0065 point 12):
// one PATCH of the module, apart from the variables, recorded as an unsaved edit like any other.

export async function applyModuleProposal(store: ViewerStore, moduleKey: string): Promise<void> {
  const open = store.state.openPantin;
  const current = store.state.symbolImport;
  if (open === null || current.status !== "ready" || current.applyingProposal !== null) {
    return;
  }
  const proposal = current.preview.moduleProposals.find((found) => found.module === moduleKey);
  if (proposal === undefined) {
    return;
  }
  store.update({
    ...withRequestStarted(store.state),
    symbolImport: withProposalApplying(current, moduleKey),
  });
  try {
    const mapping = await store.ports.api.updateIoModule(open.id, moduleKey, {
      transport: { kind: OPCUA_CLIENT_KIND, nodeIdPrefix: proposal.nodeIdPrefix },
    });
    const pantin = await store.ports.api.getPantin(open.id);
    const finished = withRequestFinished(store.state);
    // Another Pantin was opened meanwhile: this dialog belonged to the first one.
    if (store.requestedPantinId !== pantin.id) {
      store.update(finished);
      return;
    }
    const state = withOpenPantin(finished, pantin);
    store.update({
      ...state,
      io: withMapping(state.io, pantin, mapping),
      symbolImport: withProposalApplied(finished.symbolImport, moduleKey),
    });
    await refreshPantinList(store);
  } catch (error) {
    const finished = withRequestFinished(store.state);
    store.update({
      ...finished,
      symbolImport: withProposalRefused(finished.symbolImport, describeFailure(error)),
    });
    await loadIoMapping(store);
  }
}
