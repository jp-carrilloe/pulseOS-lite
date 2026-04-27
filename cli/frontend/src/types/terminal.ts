export interface TerminalSessionSummary {
  id: string;
  cwd: string;
  shell: string;
  startedAt: string;
  status: "running" | "exited";
  exitCode: number | null;
  exitSignal: string | null;
}

export type TerminalEvent =
  | { type: "started"; session: TerminalSessionSummary; message: string }
  | { type: "output"; stream: "stdout" | "stderr"; chunk: string }
  | { type: "exit"; code: number | null; signal: string | null }
  | { type: "error"; message: string };
