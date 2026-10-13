// What an io command answers: lines for stdout and stderr, and an exit code.
export type CommandResult = { exitCode: number; messages: string[]; errors: string[] };

export const refused = (errors: string[]): CommandResult => ({ exitCode: 1, messages: [], errors });

export const done = (message: string): CommandResult => ({
  exitCode: 0,
  messages: [message],
  errors: [],
});
