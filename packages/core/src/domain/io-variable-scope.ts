import type { IoDocument, IoProblem } from "@pantin/protocol";
import { isDottedVariable } from "./io-identifiers.ts";
import { rulesOf } from "./io-transports.ts";

// One PLC variable is declared once, in one global variable list (ADR 0065 point 3): a
// variable without a dot that two modules map must live in the same list in both. The list's
// name is the transport's business (`variableScope`); this rule only compares them. IEC names
// ignore case.

type FirstUse = { scope: string; moduleKey: string };

/** One problem per module whose list differs from the one that first used a variable. */
export function variableScopeProblems(document: IoDocument): IoProblem[] {
  const firstUses = new Map<string, FirstUse>();
  const problems: IoProblem[] = [];
  document.modules.forEach((module, moduleIndex) => {
    const scope = rulesOf(module.transport).variableScope(module.transport);
    if (scope === null) {
      return;
    }
    let reported = false;
    for (const { variable } of module.channels) {
      if (isDottedVariable(variable)) {
        continue;
      }
      const key = variable.toLowerCase();
      const first = firstUses.get(key);
      if (first === undefined) {
        firstUses.set(key, { scope, moduleKey: module.key });
      } else if (first.scope.toLowerCase() !== scope.toLowerCase() && !reported) {
        reported = true;
        problems.push({
          path: ["modules", moduleIndex, "transport", "gvlName"],
          code: "gvl_name_mismatch",
          message: `Variable "${variable}" is in GVL "${scope}" here and in GVL "${first.scope}" in module "${first.moduleKey}": a variable is declared once, in one GVL. Give both modules the same GVL name.`,
        });
      }
    }
  });
  return problems;
}
