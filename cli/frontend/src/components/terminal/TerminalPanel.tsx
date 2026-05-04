import { useEffect, useMemo, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { api } from "../../lib/api";
import type { TerminalEvent, TerminalSessionSummary } from "../../types/terminal";
import { LiteBadge, LiteButton, LiteEmptyState } from "../ui";

interface TerminalPanelProps {
  open: boolean;
  onClose: () => void;
}

export function TerminalPanel({ open, onClose }: TerminalPanelProps) {
  const [session, setSession] = useState<TerminalSessionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  const statusBadge = useMemo(() => {
    if (!session) return null;
    return session.status === "running" ? <LiteBadge tone="success">Running</LiteBadge> : <LiteBadge tone="warning">Exited</LiteBadge>;
  }, [session]);

  useEffect(() => {
    const host = terminalHostRef.current;
    if (!host || terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"SF Mono", "Geist Mono", ui-monospace, monospace',
      fontSize: 14,
      lineHeight: 1.42,
      theme: {
        background: "#181818",
        foreground: "#efefef",
        cursor: "#f2f2f2",
        cursorAccent: "#181818",
        selectionBackground: "rgba(255, 255, 255, 0.16)",
        black: "#111111",
        red: "#ff8f8f",
        green: "#67d18f",
        yellow: "#f0c56b",
        blue: "#d5d5d5",
        magenta: "#c3b4ff",
        cyan: "#a8d5d8",
        white: "#f2f2f2",
        brightBlack: "#8f8f8f",
        brightRed: "#ffb0b0",
        brightGreen: "#8ce0ab",
        brightYellow: "#f6d58e",
        brightBlue: "#f1f1f1",
        brightMagenta: "#ddd0ff",
        brightCyan: "#c6eaec",
        brightWhite: "#ffffff",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    fitAddon.fit();
    terminal.writeln("PulseOS local repo terminal");
    terminal.writeln("Start shell to open a real interactive terminal in this workspace.");
    terminal.writeln("");

    const disposable = terminal.onData((data) => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) return;
      void api.sendTerminalInput(sessionId, data).catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Could not send input to the local terminal.");
      });
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      disposable.dispose();
      fitAddon.dispose();
      terminal.dispose();
      fitAddonRef.current = null;
      terminalRef.current = null;
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon || !open) return;

    const syncSize = () => {
      fitAddon.fit();
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) return;
      void api.resizeTerminalSession(sessionId, terminal.cols, terminal.rows).catch(() => undefined);
    };

    const frame = requestAnimationFrame(syncSize);
    const resizeObserver = new ResizeObserver(syncSize);
    if (terminalHostRef.current) {
      resizeObserver.observe(terminalHostRef.current);
    }

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !session?.id) return;

    const terminal = terminalRef.current;
    const stream = new EventSource(`/api/terminal/stream?id=${encodeURIComponent(session.id)}`, { withCredentials: true });
    streamRef.current = stream;

    stream.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as TerminalEvent;
        if (event.type === "started") {
          activeSessionIdRef.current = event.session.id;
          setSession(event.session);
          terminal?.reset();
          terminal?.writeln(event.message);
          return;
        }

        if (event.type === "output") {
          terminal?.write(event.chunk);
          return;
        }

        if (event.type === "error") {
          terminal?.writeln(`\r\n[error] ${event.message}`);
          setError(event.message);
          return;
        }

        if (event.type === "exit") {
          setSession((current) =>
            current
              ? { ...current, status: "exited", exitCode: event.code, exitSignal: event.signal }
              : current,
          );
          terminal?.writeln(`\r\n[shell exited${event.code !== null ? ` code ${event.code}` : ""}${event.signal ? ` ${event.signal}` : ""}]`);
        }
      } catch {
        setError("The terminal stream returned a response the UI could not read.");
      }
    };

    stream.onerror = () => {
      stream.close();
      streamRef.current = null;
    };

    return () => {
      stream.close();
      if (streamRef.current === stream) streamRef.current = null;
    };
  }, [open, session?.id]);

  async function startShell() {
    setBusy(true);
    setError(null);
    try {
      if (session?.id) {
        await api.closeTerminalSession(session.id).catch(() => undefined);
      }
      terminalRef.current?.reset();
      const nextSession = await api.createTerminalSession();
      activeSessionIdRef.current = nextSession.id;
      setSession(nextSession);
      requestAnimationFrame(() => {
        const terminal = terminalRef.current;
        const fitAddon = fitAddonRef.current;
        if (!terminal || !fitAddon) return;
        fitAddon.fit();
        void api.resizeTerminalSession(nextSession.id, terminal.cols, terminal.rows).catch(() => undefined);
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not start the local repo shell.");
    } finally {
      setBusy(false);
    }
  }

  async function ensureRunningSession(): Promise<string | null> {
    if (session?.id && session.status === "running") {
      return session.id;
    }

    setBusy(true);
    setError(null);
    try {
      if (session?.id) {
        await api.closeTerminalSession(session.id).catch(() => undefined);
      }
      terminalRef.current?.reset();
      const nextSession = await api.createTerminalSession();
      activeSessionIdRef.current = nextSession.id;
      setSession(nextSession);
      requestAnimationFrame(() => {
        const terminal = terminalRef.current;
        const fitAddon = fitAddonRef.current;
        if (!terminal || !fitAddon) return;
        fitAddon.fit();
        void api.resizeTerminalSession(nextSession.id, terminal.cols, terminal.rows).catch(() => undefined);
      });
      return nextSession.id;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not start the local repo shell.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function runPresetCommand(command: string) {
    const sessionId = await ensureRunningSession();
    if (!sessionId) return;
    try {
      await api.sendTerminalInput(sessionId, `${command}\n`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : `Could not run \`${command}\` in the local terminal.`);
    }
  }

  async function closeShell() {
    if (!session?.id) return;
    setBusy(true);
    try {
      await api.closeTerminalSession(session.id);
      streamRef.current?.close();
      streamRef.current = null;
      activeSessionIdRef.current = null;
      setSession(null);
      terminalRef.current?.reset();
      terminalRef.current?.writeln("Shell closed.");
      terminalRef.current?.writeln("Start shell to open a new interactive session.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not close that shell session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={open ? "terminal-panel open" : "terminal-panel"} aria-hidden={!open}>
      <div className="terminal-panel-card">
        <div className="terminal-panel-head">
          <div className="terminal-panel-copy">
            <p className="eyebrow">Local repo terminal</p>
            <div className="terminal-title-row">
              <h3>Terminal</h3>
              <button
                type="button"
                className="graph-icon-button graph-tooltip-target terminal-info-button"
                data-tooltip="Run PulseOS for chat. Use git, npm, rg, claude, gemini, or cd cli && npm run graph directly."
                aria-label="Terminal help"
              >
                i
              </button>
            </div>
          </div>
          <div className="terminal-panel-actions">
            {statusBadge}
            <LiteButton variant="ghost" onClick={onClose}>
              Close
            </LiteButton>
          </div>
        </div>

        <div className="terminal-toolbar">
          <LiteButton onClick={() => void startShell()} disabled={busy}>
            {session ? "Restart shell" : "Start shell"}
          </LiteButton>
          <LiteButton
            variant="secondary"
            onClick={() => void runPresetCommand("cd cli && npm run chat")}
            disabled={busy}
            title="Run cd cli && npm run chat"
          >
            Run PulseOS
          </LiteButton>
          <LiteButton variant="secondary" onClick={() => void closeShell()} disabled={!session || busy}>
            End shell
          </LiteButton>
          {session ? <span className="muted-copy terminal-meta">{session.cwd}</span> : null}
        </div>

        {error ? <div className="notice notice-error">{error}</div> : null}

          <div className="terminal-output-shell">
            <div className="terminal-output-host" ref={terminalHostRef} />
            {!session ? (
              <div className="terminal-empty-overlay">
                <LiteEmptyState
                  title="Shell not started"
                  detail="Start the shell when you want a real terminal inside this workspace."
                />
              </div>
            ) : null}
          </div>
      </div>
    </aside>
  );
}
