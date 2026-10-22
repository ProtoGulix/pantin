// The bridge's log: one line per message on stderr, which the core keeps in the bridge log
// (ADR 0054). Never put a password or a private key in a message.

type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR";

export type Logger = Record<"debug" | "info" | "warning" | "error", (message: string) => void>;

export function createLogger(writeLine: (line: string) => void, now: () => Date): Logger {
  const at =
    (level: LogLevel) =>
    (message: string): void =>
      writeLine(`${now().toISOString()} ${level} ${message}`);
  return {
    debug: at("DEBUG"),
    info: at("INFO"),
    warning: at("WARNING"),
    error: at("ERROR"),
  };
}
