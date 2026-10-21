// The close question is not asked (ADR 0050 point 7 for the bridge notice).
export const NO_CLOSE_PROMPT = {
  closePrompt: false,
  closeBridgeNotice: false,
  closeStopsBridge: false,
} as const;

// The question before reloading over unsaved changes (ADR 0063 point 5) is not asked.
export const NO_RELOAD_PROMPT = { pendingReload: false } as const;
