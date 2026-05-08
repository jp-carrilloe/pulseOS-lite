import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Loader2, Send, Terminal as TerminalIcon } from "lucide-react";
import { ACME_DOCS, type AcmeDoc } from "@/data/acme-docs";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface FolderNode {
  name: string;
  docs: AcmeDoc[];
}

interface TerminalEntry {
  id: number;
  question: string;
  answer: string | null;
  sources: { path: string; title: string }[];
  loading: boolean;
  error?: string;
}

const FOLDER_LABELS: Record<string, string> = {
  "101_Overview": "Overview",
  "102_Strategy": "Strategy",
  "103_Operations": "Operations",
  "104_Finance": "Finance",
  "105_Infrastructure": "Infrastructure",
  "106_Legal": "Legal",
  "201_Market_Intel": "Market Intel",
  "202_GTM": "GTM",
  "203_Sales": "Sales",
  "301_Delivery": "Delivery",
};

const FOLDER_COLOR: Record<string, string> = {
  "101_Overview": "hsl(185 100% 60%)",
  "102_Strategy": "hsl(265 90% 70%)",
  "103_Operations": "hsl(35 95% 65%)",
  "104_Finance": "hsl(140 70% 60%)",
  "105_Infrastructure": "hsl(210 90% 65%)",
  "106_Legal": "hsl(0 75% 65%)",
  "201_Market_Intel": "hsl(290 80% 70%)",
  "202_GTM": "hsl(50 90% 65%)",
  "203_Sales": "hsl(15 90% 65%)",
  "301_Delivery": "hsl(170 80% 60%)",
};

function buildTree(): FolderNode[] {
  const map = new Map<string, AcmeDoc[]>();
  for (const d of ACME_DOCS) {
    if (!d.folder) continue;
    if (!map.has(d.folder)) map.set(d.folder, []);
    map.get(d.folder)!.push(d);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, docs]) => ({ name, docs }));
}

const SAMPLE_PROMPTS = [
  "What does Acme actually do, and who is the customer?",
  "How does Acme price and package its product?",
  "Summarize the GTM motion and where it's strongest.",
  "What are the biggest operational risks today?",
];

export default function Demo() {
  const tree = useMemo(buildTree, []);
  const firstDoc = useMemo(
    () =>
      ACME_DOCS.find((d) => d.path.endsWith("README_Acme_Sample_Company_Memory.md")) ??
      ACME_DOCS[0],
    [],
  );
  const [activePath, setActivePath] = useState<string>(firstDoc.path);
  const [openFolders, setOpenFolders] = useState<Set<string>>(
    () => new Set(tree.map((f) => f.name)),
  );
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const terminalScrollRef = useRef<HTMLDivElement>(null);

  const activeDoc = useMemo(
    () => ACME_DOCS.find((d) => d.path === activePath) ?? firstDoc,
    [activePath, firstDoc],
  );

  useEffect(() => {
    document.title = "PulseOS Lite — Live Demo";
  }, []);

  useEffect(() => {
    terminalScrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" });
  }, [entries]);

  function toggleFolder(name: string) {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    const id = Date.now();
    setEntries((prev) => [
      ...prev,
      { id, question: trimmed, answer: null, sources: [], loading: true },
    ]);
    setInput("");

    try {
      const { data, error } = await supabase.functions.invoke("pulse-query", {
        body: {
          question: trimmed,
          docs: ACME_DOCS.map((d) => ({
            path: d.path,
            title: d.title,
            content: d.content,
          })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                loading: false,
                answer: data?.answer ?? "(empty response)",
                sources: data?.sources ?? [],
              }
            : e,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, loading: false, answer: null, error: message }
            : e,
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen min-h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 bg-card/40 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <span className="h-4 w-px bg-border/60" />
          <span className="text-sm font-semibold tracking-tight">
            PulseOS <span className="text-xs font-normal text-muted-foreground">Lite</span>
          </span>
          <span className="pill rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-primary">
            Live demo
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Workspace:</span>
          <span className="rounded-md border border-border/60 bg-secondary/40 px-2 py-0.5 font-mono text-[11px] text-foreground">
            000_Acme_Sample_Company_Memory
          </span>
        </div>
      </header>

      {/* Main */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-card/30 md:flex">
          <div className="flex h-9 items-center justify-between border-b border-border/60 px-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>Explorer</span>
            <span className="font-mono text-[10px] normal-case tracking-normal">{ACME_DOCS.length} files</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2 text-sm">
            {tree.map((folder) => {
              const open = openFolders.has(folder.name);
              return (
                <div key={folder.name} className="mb-0.5">
                  <button
                    onClick={() => toggleFolder(folder.name)}
                    className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-foreground/90 hover:bg-secondary/60"
                  >
                    {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                    {open ? <FolderOpen className="h-3.5 w-3.5" style={{ color: FOLDER_COLOR[folder.name] }} /> : <Folder className="h-3.5 w-3.5" style={{ color: FOLDER_COLOR[folder.name] }} />}
                    <span className="truncate text-[13px]">{FOLDER_LABELS[folder.name] ?? folder.name}</span>
                  </button>
                  {open && (
                    <div className="ml-5 border-l border-border/40 pl-2">
                      {folder.docs.map((doc) => (
                        <button
                          key={doc.path}
                          onClick={() => setActivePath(doc.path)}
                          className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12.5px] transition-colors ${
                            activePath === doc.path
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                          }`}
                        >
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate">{doc.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="border-t border-border/60 p-3 text-[11px] text-muted-foreground">
            Read-only demo. Source:{" "}
            <a
              href="https://github.com/jp-carrilloe/pulseOS-lite"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              pulseOS-lite
            </a>
          </div>
        </aside>

        {/* Center: graph + viewer */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {/* Graph */}
            <section className="flex h-72 shrink-0 flex-col border-b border-border/60 lg:h-auto lg:flex-1 lg:border-b-0 lg:border-r">
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 px-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <span>Company ontology</span>
                <span className="text-[10px] normal-case tracking-normal text-muted-foreground/70">click to inspect</span>
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden grid-bg">
                <OntologyGraph
                  tree={tree}
                  activePath={activePath}
                  onSelect={setActivePath}
                />
              </div>
            </section>

            {/* Viewer */}
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 bg-card/30 px-3 text-[11px] text-muted-foreground">
                <FileText className="h-3 w-3" />
                <span className="truncate font-mono">{activeDoc.path}</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                <article className="prose-pulse mx-auto max-w-3xl">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {activeDoc.content}
                  </ReactMarkdown>
                </article>
              </div>
            </section>
          </div>

          {/* Terminal */}
          <section
            className={`shrink-0 border-t border-border/60 bg-card/40 transition-all ${
              terminalOpen ? "h-72" : "h-9"
            }`}
          >
            <button
              onClick={() => setTerminalOpen((v) => !v)}
              className="flex h-9 w-full items-center justify-between border-b border-border/60 px-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-2">
                <TerminalIcon className="h-3 w-3" />
                Pulse terminal
                <span className="pill ml-2 rounded-full px-2 py-0.5 text-[10px] normal-case tracking-normal text-primary">
                  AI-powered
                </span>
              </span>
              <span className="font-mono text-[10px] normal-case tracking-normal">
                {terminalOpen ? "−" : "+"}
              </span>
            </button>

            {terminalOpen && (
              <div className="flex h-[calc(100%-2.25rem)] flex-col">
                <div
                  ref={terminalScrollRef}
                  className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed"
                >
                  {entries.length === 0 && (
                    <div className="text-muted-foreground">
                      <p>$ pulse query "&lt;your question&gt;"</p>
                      <p className="mt-1 text-muted-foreground/70">
                        Ask anything about Acme. Pulse retrieves the relevant company documents and answers with citations.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {SAMPLE_PROMPTS.map((p) => (
                          <button
                            key={p}
                            onClick={() => ask(p)}
                            className="pill rounded-full px-3 py-1 text-xs text-foreground/80 transition-colors hover:text-primary"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {entries.map((e) => (
                    <div key={e.id} className="mb-4">
                      <div className="text-primary">
                        <span className="text-muted-foreground">$</span> pulse query "{e.question}"
                      </div>
                      {e.loading && (
                        <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          retrieving evidence and reasoning…
                        </div>
                      )}
                      {e.error && (
                        <div className="mt-1 whitespace-pre-wrap text-destructive">
                          error: {e.error}
                        </div>
                      )}
                      {e.answer && (
                        <div className="mt-2 rounded-md border border-border/60 bg-background/40 p-3">
                          <div className="prose-pulse prose-pulse-sm font-sans">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {e.answer}
                            </ReactMarkdown>
                          </div>
                          {e.sources.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/40 pt-2">
                              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                sources
                              </span>
                              {e.sources.map((s) => (
                                <button
                                  key={s.path}
                                  onClick={() => setActivePath(s.path)}
                                  className="pill rounded-full px-2 py-0.5 text-[10px] normal-case text-foreground/80 hover:text-primary"
                                >
                                  {s.path}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    ask(input);
                  }}
                  className="flex shrink-0 items-center gap-2 border-t border-border/60 px-3 py-2"
                >
                  <span className="font-mono text-xs text-primary">$</span>
                  <input
                    autoFocus
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder='pulse query "..."'
                    disabled={submitting}
                    className="flex-1 bg-transparent font-mono text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={submitting || !input.trim()}
                    className="h-7 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  </Button>
                </form>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

/* ───────── Ontology graph ───────── */

interface GraphProps {
  tree: FolderNode[];
  activePath: string;
  onSelect: (path: string) => void;
}

type NodePos = { x: number; y: number };
function OntologyGraph({ tree, activePath, onSelect }: GraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 480 });
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hoverDoc, setHoverDoc] = useState<string | null>(null);
  const [hoverFolder, setHoverFolder] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, NodePos>>({});
  const panState = useRef<{ startX: number; startY: number; vx: number; vy: number } | null>(null);
  const dragState = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startNodeX: number;
    startNodeY: number;
    moved: boolean;
    onClick?: () => void;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ w: Math.max(320, width), h: Math.max(240, height) });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const layout = useMemo(() => {
    const cx = size.w / 2;
    const cy = size.h / 2;
    const folderRadius = Math.min(size.w, size.h) * 0.28;
    const docRadius = folderRadius * 2.05;
    const folders = tree.map((f, i) => {
      const angle = (i / tree.length) * Math.PI * 2 - Math.PI / 2;
      const baseX = cx + Math.cos(angle) * folderRadius;
      const baseY = cy + Math.sin(angle) * folderRadius;
      const ov = overrides[`f:${f.name}`];
      return {
        ...f,
        x: ov ? ov.x : baseX,
        y: ov ? ov.y : baseY,
        angle,
      };
    });
    const docs = folders.flatMap((folder) =>
      folder.docs.map((doc, j, arr) => {
        const spread = 0.5;
        const localAngle =
          folder.angle +
          (arr.length === 1 ? 0 : ((j / (arr.length - 1)) - 0.5) * spread);
        const baseX = cx + Math.cos(localAngle) * docRadius;
        const baseY = cy + Math.sin(localAngle) * docRadius;
        const ov = overrides[`d:${doc.path}`];
        return {
          doc,
          folder: folder.name,
          x: ov ? ov.x : baseX,
          y: ov ? ov.y : baseY,
          parent: { x: folder.x, y: folder.y },
        };
      }),
    );
    return { folders, docs, cx, cy };
  }, [tree, size, overrides]);

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setView((prev) => {
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nextK = Math.min(3, Math.max(0.4, prev.k * factor));
      // zoom toward cursor: keep (mx,my) fixed in world coords
      const wx = (mx - prev.x) / prev.k;
      const wy = (my - prev.y) / prev.k;
      return { k: nextK, x: mx - wx * nextK, y: my - wy * nextK };
    });
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    // ignore drags that start on a node (let click happen)
    const target = e.target as Element;
    if (target.closest("[data-node]")) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    panState.current = { startX: e.clientX, startY: e.clientY, vx: view.x, vy: view.y };
  }
  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (dragState.current) {
      const ds = dragState.current;
      const dx = (e.clientX - ds.startClientX) / view.k;
      const dy = (e.clientY - ds.startClientY) / view.k;
      if (!ds.moved && Math.hypot(e.clientX - ds.startClientX, e.clientY - ds.startClientY) > 4) {
        ds.moved = true;
      }
      if (ds.moved) {
        setOverrides((prev) => ({
          ...prev,
          [ds.id]: { x: ds.startNodeX + dx, y: ds.startNodeY + dy },
        }));
      }
      return;
    }
    if (!panState.current) return;
    const dx = e.clientX - panState.current.startX;
    const dy = e.clientY - panState.current.startY;
    setView((prev) => ({ ...prev, x: panState.current!.vx + dx, y: panState.current!.vy + dy }));
  }
  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (dragState.current) {
      const ds = dragState.current;
      if (!ds.moved && ds.onClick) ds.onClick();
      dragState.current = null;
      try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* noop */ }
      return;
    }
    panState.current = null;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }
  function startNodeDrag(
    e: React.PointerEvent,
    id: string,
    nodeX: number,
    nodeY: number,
    onClick?: () => void,
  ) {
    e.stopPropagation();
    const svg = (e.currentTarget as Element).closest("svg");
    try { svg?.setPointerCapture(e.pointerId); } catch { /* noop */ }
    dragState.current = {
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startNodeX: nodeX,
      startNodeY: nodeY,
      moved: false,
      onClick,
    };
  }
  function reset() {
    setView({ x: 0, y: 0, k: 1 });
    setOverrides({});
  }
  function zoomBy(factor: number) {
    setView((prev) => {
      const cx = size.w / 2;
      const cy = size.h / 2;
      const nextK = Math.min(3, Math.max(0.4, prev.k * factor));
      const wx = (cx - prev.x) / prev.k;
      const wy = (cy - prev.y) / prev.k;
      return { k: nextK, x: cx - wx * nextK, y: cy - wy * nextK };
    });
  }

  return (
    <div ref={containerRef} className="absolute inset-0">
      <svg
        width={size.w}
        height={size.h}
        className="block touch-none select-none"
        style={{ cursor: panState.current ? "grabbing" : "grab" }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {/* center -> folder edges */}
          {layout.folders.map((f) => (
            <line
              key={`c-${f.name}`}
              x1={layout.cx}
              y1={layout.cy}
              x2={f.x}
              y2={f.y}
              stroke="hsl(var(--border))"
              strokeOpacity={hoverFolder === f.name ? 0.9 : 0.5}
              strokeWidth={hoverFolder === f.name ? 1.5 : 1}
            />
          ))}
          {/* folder -> doc edges */}
          {layout.docs.map((d) => {
            const isActive = d.doc.path === activePath;
            const isHover = hoverDoc === d.doc.path || hoverFolder === d.folder;
            return (
              <line
                key={`e-${d.doc.path}`}
                x1={d.parent.x}
                y1={d.parent.y}
                x2={d.x}
                y2={d.y}
                stroke={FOLDER_COLOR[d.folder]}
                strokeOpacity={isActive || isHover ? 0.9 : 0.35}
                strokeWidth={isActive ? 1.8 : isHover ? 1.4 : 1}
              />
            );
          })}

          {/* center node */}
          <g data-node>
            <circle cx={layout.cx} cy={layout.cy} r={30} fill="hsl(var(--primary) / 0.18)" stroke="hsl(var(--primary))" />
            <text x={layout.cx} y={layout.cy + 4} textAnchor="middle" className="pointer-events-none fill-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
              Acme
            </text>
          </g>

          {/* folder nodes */}
          {layout.folders.map((f) => {
            const hover = hoverFolder === f.name;
            return (
              <g
                key={f.name}
                data-node
                className="cursor-grab active:cursor-grabbing"
                onPointerEnter={() => setHoverFolder(f.name)}
                onPointerLeave={() => setHoverFolder((cur) => (cur === f.name ? null : cur))}
                onPointerDown={(e) => startNodeDrag(e, `f:${f.name}`, f.x, f.y)}
              >
                {/* invisible hit target */}
                <circle cx={f.x} cy={f.y} r={28} fill="transparent" />
                <circle
                  cx={f.x}
                  cy={f.y}
                  r={hover ? 20 : 18}
                  fill="hsl(var(--card))"
                  stroke={FOLDER_COLOR[f.name]}
                  strokeWidth={hover ? 2 : 1.5}
                />
                <text
                  x={f.x}
                  y={f.y + 34}
                  textAnchor="middle"
                  className="pointer-events-none fill-foreground text-[11px] font-medium"
                  style={{ paintOrder: "stroke", stroke: "hsl(var(--background))", strokeWidth: 3 }}
                >
                  {FOLDER_LABELS[f.name] ?? f.name}
                </text>
              </g>
            );
          })}

          {/* doc nodes */}
          {layout.docs.map((d) => {
            const active = d.doc.path === activePath;
            const hover = hoverDoc === d.doc.path;
            const showLabel = active || hover;
            return (
              <g
                key={d.doc.path}
                data-node
                className="cursor-grab active:cursor-grabbing"
                onPointerEnter={() => setHoverDoc(d.doc.path)}
                onPointerLeave={() => setHoverDoc((cur) => (cur === d.doc.path ? null : cur))}
                onPointerDown={(e) => startNodeDrag(e, `d:${d.doc.path}`, d.x, d.y, () => onSelect(d.doc.path))}
              >
                {/* generous invisible hit target */}
                <circle cx={d.x} cy={d.y} r={16} fill="transparent" />
                <circle
                  cx={d.x}
                  cy={d.y}
                  r={active ? 9 : hover ? 8 : 6}
                  fill={active ? FOLDER_COLOR[d.folder] : hover ? `${FOLDER_COLOR[d.folder]}` : "hsl(var(--card))"}
                  fillOpacity={active ? 1 : hover ? 0.45 : 1}
                  stroke={FOLDER_COLOR[d.folder]}
                  strokeWidth={active ? 2 : hover ? 1.6 : 1.2}
                />
                {showLabel && (
                  <text
                    x={d.x}
                    y={d.y - 14}
                    textAnchor="middle"
                    className="pointer-events-none fill-foreground text-[10px]"
                    style={{ paintOrder: "stroke", stroke: "hsl(var(--background))", strokeWidth: 3 }}
                  >
                    {d.doc.name.replace(/\.md$/, "")}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1">
        <button
          onClick={() => zoomBy(1.25)}
          className="pill flex h-7 w-7 items-center justify-center rounded-md text-sm text-foreground/80 hover:text-primary"
          aria-label="Zoom in"
        >+</button>
        <button
          onClick={() => zoomBy(0.8)}
          className="pill flex h-7 w-7 items-center justify-center rounded-md text-sm text-foreground/80 hover:text-primary"
          aria-label="Zoom out"
        >−</button>
        <button
          onClick={reset}
          className="pill flex h-7 w-7 items-center justify-center rounded-md text-[10px] text-foreground/80 hover:text-primary"
          aria-label="Reset view"
          title="Reset view"
        >⟳</button>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-muted-foreground/70">
        drag nodes to rearrange · drag canvas to pan · scroll to zoom · click a doc to open · ⟳ resets layout
      </div>
    </div>
  );
}
