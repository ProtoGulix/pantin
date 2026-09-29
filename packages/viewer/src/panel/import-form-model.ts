import type { LengthUnit, SourceFormat, UpAxis } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import { importNeedsUnit } from "../import-options.ts";
import type { ViewerState } from "../viewer-state.ts";

// The inline import form, as data.

export interface ImportFormView {
  title: string;
  fileName: string;
  formatLabel: string;
  showUnit: boolean;
  unit: LengthUnit;
  upAxis: UpAxis;
  unitOptions: Readonly<Record<LengthUnit, string>>;
  upAxisOptions: Readonly<Record<UpAxis, string>>;
  // Shown instead of the buttons while the core works on the file.
  progressMessage: string | null;
  canSubmit: boolean;
}

function importProgressMessage(format: SourceFormat, translate: Translate): string {
  return translate(format === "step" ? "import.converting" : "import.inProgress");
}

export function buildImportFormView(state: ViewerState, t: Translate): ImportFormView | null {
  const pendingImport = state.pendingImport;
  if (pendingImport === null || state.openPantin === null) {
    return null;
  }
  return {
    title: t("import.target", { pantinName: state.openPantin.document.name }),
    fileName: pendingImport.fileName,
    formatLabel: t(`format.${pendingImport.format}`),
    showUnit: importNeedsUnit(pendingImport),
    unit: pendingImport.unit,
    upAxis: pendingImport.upAxis,
    unitOptions: { m: t("unit.m"), mm: t("unit.mm"), cm: t("unit.cm"), in: t("unit.in") },
    upAxisOptions: { y: t("upAxis.y"), z: t("upAxis.z") },
    progressMessage: state.importInProgress ? importProgressMessage(pendingImport.format, t) : null,
    canSubmit: !state.importInProgress && state.pendingRequestCount === 0,
  };
}
