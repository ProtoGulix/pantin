import type { z } from "zod";
import type { PresenceSensorEvaluator } from "../evaluation-common.ts";
import type { PhotoelectricFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof PhotoelectricFieldsSchema>;

// The cell's state is the confirmed raw signal (`active`) and how many steps in
// a row the raw signal has disagreed with it (`pending`). Delays count whole
// steps (ADR 0043 point 7), so a run never depends on floating-point time sums.
// A disagreement switches `active` once it has lasted more than the delay's
// steps: delay 0 switches in the step the signal changes, delay N, N steps
// later, and a flicker that ends before that changes nothing. NO/NC inverts the
// confirmed value last, so the delays apply to the beam, not to the output.
export const photoelectric: PresenceSensorEvaluator<Fields> = {
  evaluate: ({ fields, signal, state, stepSeconds }) => {
    const raw = signal ? 1 : 0;
    const active = state?.active ?? 0;
    const pending = raw === active ? 0 : (state?.pending ?? 0) + 1;
    const delay = raw === 1 ? fields.onDelay : fields.offDelay;
    const switches = pending > Math.round(delay / stepSeconds);
    const next = switches ? { active: raw, pending: 0 } : { active, pending };
    return {
      values: { state: fields.normallyClosed ? 1 - next.active : next.active },
      state: next,
    };
  },
};
