import { ArrowRight, ChevronRight, GitBranch, Mail, Network, ShieldCheck, Terminal, Workflow, Database, FileText, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";

const marqueePills = [
  "Simulation-first execution",
  "Certified agent access",
  "Digital twin",
  "Financial safeguards",
  "Operator oversight",
  "Cognitive database",
  "Audit trails",
  "Machine-readable company",
  "Knowledge graph",
  "Zero-risk testing",
];

const Index = () => {
  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg" />

      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
        <a href="#" className="flex flex-col leading-tight">
          <span className="text-base font-semibold tracking-tight">PulseOS <span className="ml-1 text-xs font-normal text-muted-foreground">Lite</span></span>
          <span className="text-[11px] text-muted-foreground">by tintto</span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#problem" className="hover:text-foreground transition-colors">Docs</a>
          <a href="#contact" className="hover:text-foreground transition-colors">Sign In</a>
        </nav>
        <Button asChild size="sm" className="rounded-full bg-primary text-primary-foreground glow hover:bg-primary/90">
          <a href="https://github.com/jp-carrilloe/pulseOS-lite" target="_blank" rel="noreferrer">
            Get the repo <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </Button>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-8 pb-16 pt-24 md:pt-32">
        <div className="max-w-3xl">
          <div className="pill mb-8 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-primary">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-70" style={{ animation: "pulse-dot 1.6s ease-in-out infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            System Online
          </div>

          <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
            Making companies <span className="text-gradient">machine-readable</span> for agents.
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            PulseOS Lite is the open-source foundation of PulseOS, a local-first company memory with ontology, evidence, and a runtime for agentic workflows. It is more than an LLM layered on a wiki.
          </p>

          {/* Inline CTA card */}
          <div className="card-surface mt-10 max-w-xl rounded-2xl p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="pill rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">Open Source</span>
              <span className="text-sm text-muted-foreground">Fork it, break it, improve it.</span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full bg-primary text-primary-foreground glow hover:bg-primary/90">
                <a href="https://github.com/jp-carrilloe/pulseOS-lite" target="_blank" rel="noreferrer">
                  Try PulseOS Lite <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-border/60 bg-secondary/40 hover:bg-secondary">
                <a href="#what">Read the thinking</a>
              </Button>
            </div>
          </div>

          {/* Highlight chips */}
          <div className="mt-8 flex flex-wrap gap-2">
            {["Digital twin of your company", "Cognitive memory layer", "Simulation before execution"].map((t) => (
              <span key={t} className="pill inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm text-foreground/80">
                <ChevronRight className="h-3.5 w-3.5 text-primary" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Marquee */}
      <div className="relative z-10 overflow-hidden border-y border-border/40 bg-background/40 py-4">
        <div className="flex w-max gap-8 whitespace-nowrap" style={{ animation: "marquee 40s linear infinite" }}>
          {[...marqueePills, ...marqueePills].map((p, i) => (
            <span key={i} className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {p} <span className="ml-8 text-primary/40">·</span>
            </span>
          ))}
        </div>
      </div>

      {/* Problem */}
      <section id="problem" className="relative z-10 mx-auto max-w-7xl px-8 py-28">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">The Problem</p>
        <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
          A company is not a pile of pages.
        </h2>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          Information is scattered across CRMs, documents, APIs, and finance systems. Each captures a fragment of reality without encoding how they relate. Humans reconstruct this context implicitly. Agents cannot.
        </p>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/40 md:grid-cols-3">
          {[
            { title: "Agents lack the map", desc: "They do not know how systems relate, what workflows exist, or which actions are permitted." },
            { title: "Tools stay disconnected", desc: "CRMs, documents, APIs, and finance systems each expose pieces of the company, never the operating model." },
            { title: "Context gets rebuilt", desc: "Every prompt reassembles the truth from scratch, increasing cost and reducing reliability." },
          ].map(({ title, desc }) => (
            <div key={title} className="bg-card p-8">
              <h3 className="text-lg font-medium tracking-tight">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What it is */}
      <section id="what" className="relative z-10 mx-auto max-w-7xl px-8 py-28">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">The Solution</p>
        <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
          Company memory, ontology, evidence, runtime.
        </h2>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          The substrate agents actually need, rather than a vector index pointing at a wiki.
        </p>

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: FileText, title: "Canonical documents", desc: "A single, authoritative source rather than five conflicting Notion pages." },
            { icon: Network, title: "Entities and relationships", desc: "People, products, customers, and contracts, connected rather than flat." },
            { icon: ShieldCheck, title: "Evidence layer", desc: "Every claim is traceable to its source, providing a reality layer for agents." },
            { icon: Workflow, title: "Workflows and ownership", desc: "Operating state that captures who owns what, what runs when, and what is blocked." },
            { icon: Boxes, title: "Runtime environment", desc: "Deploy, test, and optimize agentic workflows against the real company graph." },
            { icon: Database, title: "Persistent memory", desc: "Knowledge that survives a single chat, a repo clone, or a model swap." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card-surface group relative rounded-2xl p-7 transition-all hover:border-primary/40">
              <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-medium tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Lite + terminal */}
      <section className="relative z-10 mx-auto max-w-7xl px-8 py-28">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">PulseOS Lite</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              The simplest version, open-sourced.
            </h2>
            <p className="mt-5 max-w-xl text-muted-foreground">
              The local-first foundation behind PulseOS. Run it on your laptop, against your own keys, today.
            </p>
            <ul className="mt-10 space-y-4">
              {([
                { text: "Canonical markdown company memory", Icon: FileText },
                { text: "Local CLI and daemon, with LLM OAuth or API keys", Icon: Terminal },
                { text: "Graph UI for ontology and document relationships", Icon: Network },
                { text: "Mini IDE for non-technical users, with terminal access", Icon: Terminal },
                { text: "Local SQL and vector memory layer", Icon: Database },
                { text: "Local-first persistent workspace", Icon: ShieldCheck },
              ]).map(({ text, Icon }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm text-foreground/90">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Terminal */}
          <div className="card-surface rounded-2xl p-1.5" style={{ animation: "float-slow 6s ease-in-out infinite" }}>
            <div className="flex items-center gap-1.5 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
              <span className="ml-3 text-xs text-muted-foreground">pulse · graph</span>
            </div>
            <div className="rounded-xl bg-background/70 p-6 font-mono text-xs leading-relaxed">
              <p className="text-primary">$ pulse query "who owns billing?"</p>
              <p className="mt-2 text-muted-foreground">→ resolving entity <span className="text-foreground">billing</span></p>
              <p className="text-muted-foreground">→ traversing <span className="text-primary">owns</span> edges …</p>
              <div className="my-4 grid grid-cols-3 gap-2">
                {["billing", "stripe-int", "finance"].map((n) => (
                  <div key={n} className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-center text-[11px] text-foreground">{n}</div>
                ))}
                {["a.chen", "ops-team", "j.park"].map((n) => (
                  <div key={n} className="pill rounded-md px-2 py-1.5 text-center text-[11px] text-foreground/90">{n}</div>
                ))}
              </div>
              <p className="text-foreground">a.chen <span className="text-muted-foreground">— PIC, evidence: contracts/2025/billing.md#L42</span></p>
              <p className="mt-1 text-muted-foreground">confidence <span className="text-primary">0.94</span></p>
              <p className="mt-3 text-primary">$ <span className="inline-block h-3.5 w-1.5 translate-y-0.5 bg-primary" style={{ animation: "pulse-dot 1s steps(2) infinite" }} /></p>
            </div>
          </div>
        </div>
      </section>

      {/* Direction */}
      <section className="relative z-10 mx-auto max-w-7xl px-8 py-28">
        <div className="card-surface relative overflow-hidden rounded-3xl p-12 md:p-16">
          <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "var(--gradient-hero)" }} />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">The Direction</p>
            <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
              From local memory to <span className="text-gradient">enterprise agent runtime</span>.
            </h2>
            <p className="mt-5 max-w-2xl text-muted-foreground">
              We are extending the same foundation into the infrastructure required to run this at company scale: memory, ontology, evidence, graph, runtime, and the agentic workflows that sit on top.
            </p>
            <pre className="mt-8 inline-block rounded-xl border border-border/60 bg-background/60 px-5 py-4 text-sm md:text-base">
<span className="text-foreground">company</span> = <span className="text-gradient font-medium">memory</span> + <span className="text-gradient font-medium">ontology</span> + <span className="text-gradient font-medium">evidence</span> + <span className="text-gradient font-medium">runtime</span>
            </pre>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="relative z-10 mx-auto max-w-4xl px-8 py-28 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Join us</p>
        <h2 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">We are hiring builders.</h2>
        <p className="mx-auto mt-5 max-w-xl text-muted-foreground">
          We are a small, investor-backed team looking for strong engineers and designers who want to help build PulseOS.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="rounded-full glow bg-primary text-primary-foreground hover:bg-primary/90">
            <a href="mailto:juan@tintto.com?subject=Karpathy%20LLM%20Wiki">
              <Mail className="h-4 w-4" /> juan@tintto.com
            </a>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full border-border/60 bg-secondary/40 hover:bg-secondary">
            <a href="https://github.com/jp-carrilloe/pulseOS-lite" target="_blank" rel="noreferrer">
              <GitBranch className="h-4 w-4" /> Fork on GitHub
            </a>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Subject line: "Karpathy LLM Wiki"</p>
      </section>

      <footer className="relative z-10 mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 border-t border-border/40 px-8 py-10 text-xs text-muted-foreground md:flex-row">
        <span>© {new Date().getFullYear()} PulseOS · built by Tintto</span>
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" style={{ animation: "pulse-dot 1.6s ease-in-out infinite" }} />
          System Online
        </span>
      </footer>
    </div>
  );
};

export default Index;
