import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import type { TerminalEvent, TerminalSessionSummary } from "../../types/terminal";
import { LiteBadge, LiteButton, LiteEmptyState } from "../ui";

interface TerminalPanelProps {
  open: boolean;
  expanded: boolean;
  onClose: () => void;
  onToggleExpanded: () => void;
}

interface TerminalLine {
  id: string;
  tone: "muted" | "stdout" | "stderr" | "warning";
  text: string;
}

function splitChunkIntoLines(chunk: string): string[] {
  const normalized = chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.split("\n");
}

export function TerminalPanel({ open, expanded, onClose, onToggleExpanded }: TerminalPanelProps) {
  const [session, setSession] = useState<TerminalSessionSummary | null>(null);
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<EventSource | null>(null);

  const statusBadge = useMemo(() => {
    if (!session) return null;
    return session.status === "running" ? <LiteBadge tone="success">Running</LiteBadge> : <LiteBadge tone="warning">Exited</LiteBadge>;
  }, [session]);

  useEffect(() => {
    if (!open || !session?.id) return;

    const stream = new EventSource(`/api/terminal/stream?id=${encodeURIComponent(session.id)}`, { withCredentials: true });
    streamRef.current = stream;
    stream.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as TerminalEvent;
        if (event.type === "started") {
          setSession(event.session);
          setLines([
            {
              id: `${Date.now()}-started`,
              tone: "muted",
              text: event.message,
            },
          ]);
          return;
        }

        if (event.type === "output") {
          const nextLines = splitChunkIntoLines(event.chunk).filter((line, index, arr) => line.length > 0 || index < arr.length - 1);
          if (!nextLines.length) return;
          setLines((current) => [
            ...current,
            ...nextLines.map(
              (line, index): TerminalLine => ({
                id: `${Date.now()}-${current.length}-${index}`,
                tone: event.stream === "stderr" ? "stderr" : "stdout",
                text: line,
              }),
            ),
          ]);
          return;
        }

        if (event.type === "error") {
          setLines((current) => [...current, { id: `${Date.now()}-error`, tone: "warning", text: event.message }]);
          return;
        }

        if (event.type === "exit") {
          setSession((current) =>
            current
              ? { ...current, status: "exited", exitCode: event.code, exitSignal: event.signal }
              : current,
          );
          setLines((current) => [
            ...current,
            {
              id: `${Date.now()}-exit`,
              tone: "muted",
              text: `Shell exited${event.code !== null ? ` with code ${event.code}` : ""}${event.signal ? ` (${event.signal})` : ""}.`,
            },
          ]);
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

  useEffect(() => {
    if (!open) return;
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [lines, open]);

  async function startShell() {
    setBusy(true);
    setError(null);
    setLines([]);
    try {
      if (session?.id) {
        await api.closeTerminalSession(session.id).catch(() => undefined);
      }
      const nextSession = await api.createTerminalSession();
      setSession(nextSession);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not start the local repo shell.");
    } finally {
      setBusy(false);
    }
  }

  async function sendCommand() {
    const trimmed = command.trim();
    if (!session?.id || !trimmed || busy) return;
    setBusy(true);
    setError(null);
    setLines((current) => [...current, { id: `${Date.now()}-command`, tone: "muted", text: `$ ${trimmed}` }]);
    try {
      await api.sendTerminalInput(session.id, `${trimmed}\n`);
      setCommand("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not send that command to the shell.");
    } finally {
      setBusy(false);
    }
  }

  async function closeShell() {
    if (!session?.id) return;
    setBusy(true);
    try {
      await api.closeTerminalSession(session.id);
      setSession(null);
      setLines([]);
      setCommand("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not close that shell session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      className={open ? `terminal-panel open${expanded ? " expanded" : ""}` : "terminal-panel"}
      aria-hidden={!open}
    >
      <div className="terminal-panel-card">
        <div className="terminal-panel-head">
          <div className="terminal-panel-copy">
            <p className="eyebrow">Local repo shell</p>
            <h3>Terminal</h3>
            <p className="section-description">
              Run repo commands like <code>rg</code>, <code>git</code>, <code>npm</code>, or <code>codex</code> if it is installed locally.
            </p>
          </div>
          <div className="terminal-panel-actions">
            {statusBadge}
            <LiteButton variant="secondary" onClick={onToggleExpanded}>
              {expanded ? "Windowed" : "Expand"}
            </LiteButton>
            <LiteButton variant="ghost" onClick={onClose}>
              Close
            </LiteButton>
          </div>
        </div>

        <div className="terminal-toolbar">
          <LiteButton onClick={() => void startShell()} disabled={busy}>
            {session ? "Restart shell" : "Start shell"}
          </LiteButton>
          <LiteButton variant="secondary" onClick={() => void closeShell()} disabled={!session || busy}>
            End shell
          </LiteButton>
          {session ? <span className="muted-copy terminal-meta">{session.cwd}</span> : null}
        </div>

        {error ? <div className="notice notice-error">{error}</div> : null}

        {session ? (
          <>
            <div className="terminal-output" ref={outputRef}>
              {lines.length ? (
                lines.map((line) => (
                  <div key={line.id} className={`terminal-line terminal-line-${line.tone}`}>
                    {line.text}
                  </div>
                ))
              ) : (
                <div className="terminal-line terminal-line-muted">Shell is ready. Type a command below and press Send.</div>
              )}
            </div>

            <div className="terminal-input-row">
              <input
                className="lite-input terminal-input"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendCommand();
                  }
                }}
                placeholder="Type a command and press Enter"
                spellCheck={false}
              />
              <LiteButton onClick={() => void sendCommand()} disabled={!command.trim() || busy || session.status !== "running"}>
                Send
              </LiteButton>
            </div>
          </>
        ) : (
          <LiteEmptyState
            title="Shell not started"
            detail="Nothing runs automatically. Start the shell when you want a local terminal inside this workspace."
          />
        )}
      </div>
    </aside>
  );
}
