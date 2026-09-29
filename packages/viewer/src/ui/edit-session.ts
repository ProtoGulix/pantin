// One editing session of a text field: from focus to the first way out
// (Enter, blur or Escape). Pure, so the "commit exactly once" rule is tested
// without a browser: Enter followed by the blur it causes, or a re-render
// that detaches the field, must never send the same rename twice.

export type EditOutcome = { type: "commit"; value: string } | { type: "cancel" } | { type: "none" };

const NONE: EditOutcome = { type: "none" };

export type EnterAction = "moveFocus" | "blur" | "commitDirectly";

/**
 * What Enter does. When blur commits, Enter only moves focus away and lets
 * the blur handler commit, exactly once; moving focus to a given element
 * (the tree) rather than blurring keeps the keyboard where the user was.
 */
export function enterAction(commitOnBlur: boolean, hasFocusTarget: boolean): EnterAction {
  if (!commitOnBlur) {
    return "commitDirectly";
  }
  return hasFocusTarget ? "moveFocus" : "blur";
}

export class EditSession {
  private readonly initialValue: string;
  private settled = false;

  constructor(initialValue: string) {
    this.initialValue = initialValue;
  }

  /** The field got focus: a new session starts. */
  begin(): void {
    this.settled = false;
  }

  /** Enter or blur: commit a real change, cancel otherwise; only the first call counts. */
  finish(currentValue: string): EditOutcome {
    if (this.settled) {
      return NONE;
    }
    this.settled = true;
    return currentValue.trim() === this.initialValue
      ? { type: "cancel" }
      : { type: "commit", value: currentValue };
  }

  /** Escape: always a cancel, and whatever comes next in this session is ignored. */
  abandon(): EditOutcome {
    if (this.settled) {
      return NONE;
    }
    this.settled = true;
    return { type: "cancel" };
  }
}
