import { ArrowUpRight, Box, GitBranch, Mail, Network, ShieldCheck, Terminal, Workflow, Database, FileText, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 grid-bg" />

      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <a href="#" className="flex items-center gap-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-lg card-surface">
            <span className="absolute inset-0 rounded-lg bg-primary/10" />
            <span className="relative h-2 w-2 rounded-full bg-primary" style={{ animation: "pulse-dot 1.8s ease-in-out infinite", boxShadow: "0 0 12px hsl(var(--primary))" }} />
          </span>
          <span className="font-semibold tracking-tight">PulseOS</span>
          <span className="ml-1 rounded-full border border-border/60 bg-secondary/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Lite</span>
        </a>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#what" className="hover:text-foreground transition-colors">What it is</a>
          <a href="#stack" className="hover:text-foreground transition-colors">Stack</a>
          <a href="#contact" className="hover:text-foreground transition-colors">Join</a>
        </nav>
        <Button asChild variant="outline" size="sm" className="border-border/60 bg-secondary/30 hover:bg-secondary/60">
          <a href="https://github.com/jp-carrilloe/pulseOS-lite" target="_blank" rel="noreferrer">
            <GitBranch className="h-3.5 w-3.5" /> GitHub
          </a>
        </Button>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-16 pt-12 text-center md:pt-20">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-secondary/30 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" style={{ animation: "pulse-dot 1.6s ease-in-out infinite" }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          Open source · early
        </div>

        <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
          Making companies <br className="hidden md:block" />
          <span className="text-gradient">machine-readable</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground md:text-xl">
          Not just LLM for the wiki. Company memory, ontology, evidence and runtime — the substrate agents actually need.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="group glow bg-primary text-primary-foreground hover:bg-primary/90">
            <a href="https://github.com/jp-carrilloe/pulseOS-lite" target="_blank" rel="noreferrer">
              Try PulseOS Lite
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-border/60 bg-secondary/30 hover:bg-secondary/60">
            <a href="#what">Read the thinking</a>
          </Button>
        </div>

        {/* Code-ish equation */}
        <div className="mx-auto mt-14 max-w-3xl card-surface rounded-2xl p-1.5">
          <div className="flex items-center gap-1.5 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
            <span className="ml-3 text-xs text-muted-foreground">pulseos.ts</span>
          </div>
          <pre className="overflow-x-auto rounded-xl bg-background/60 px-6 py-6 text-left text-sm leading-relaxed text-muted-foreground md:text-base">
<span className="text-muted-foreground/60">// what a company actually is, to an agent</span>{"\n"}
<span className="text-foreground">company</span> = <span className="text-gradient font-medium">memory</span> + <span className="text-gradient font-medium">ontology</span> + <span className="text-gradient font-medium">evidence</span> + <span className="text-gradient font-medium">runtime</span>
          </pre>
        </div>
      </section>

      {/* What it is */}
      <section id="what" className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="mb-14 max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-widest text-primary/80">The premise</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">A company is not a pile of pages.</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            We have been working on this from the company side: how do you make an entire organization machine-readable, not just searchable? An LLM wiki is a piece of the answer. The next step is structural.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: FileText, title: "Canonical documents", desc: "A single, authoritative source — not five conflicting Notion pages." },
            { icon: Network, title: "Entities & relationships", desc: "People, products, customers, contracts — connected, not flat." },
            { icon: ShieldCheck, title: "Evidence layer", desc: "Every claim traceable to its source. A reality layer for agents." },
            { icon: Workflow, title: "Workflows & ownership", desc: "Operating state — who owns what, what runs when, what's stuck." },
            { icon: Boxes, title: "Runtime environment", desc: "Deploy, test, and optimize agentic workflows against the real graph." },
            { icon: Database, title: "Persistent memory", desc: "Survives one chat, one repo clone, one model swap." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="group card-surface relative rounded-2xl p-6 transition-all hover:border-primary/30">
              <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-medium tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stack / Lite */}
      <section id="stack" className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-primary/80">PulseOS Lite</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">The simplest version, open-sourced.</h2>
            <p className="mt-4 text-muted-foreground">
              The local-first foundation behind the full PulseOS direction. Fork it, break it, improve it.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                ["Canonical markdown company memory", Box],
                ["Local CLI + daemon — LLM OAuth or API keys", Terminal],
                ["Graph UI for ontology & document relationships", Network],
                ["Mini IDE for non-technical users, with terminal access", Terminal],
                ["Local SQL + vector memory layer", Database],
                ["Local-first persistent workspace", ShieldCheck],
              ].map(([text, Icon]) => (
                <li key={text as string} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm text-foreground/90">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Mock terminal / graph */}
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
              <p className="text-muted-foreground">→ traversing <span className="text-accent">owns</span> edges …</p>
              <div className="my-4 grid grid-cols-3 gap-2">
                {["billing", "stripe-int", "finance"].map((n) => (
                  <div key={n} className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-center text-[11px] text-foreground">{n}</div>
                ))}
                {["a.chen", "ops-team", "j.park"].map((n) => (
                  <div key={n} className="rounded-md border border-accent/20 bg-accent/5 px-2 py-1.5 text-center text-[11px] text-foreground">{n}</div>
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
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-20">
        <div className="card-surface rounded-3xl p-10 md:p-14">
          <p className="text-sm font-medium uppercase tracking-widest text-primary/80">The direction</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            From local memory to <span className="text-gradient">enterprise agent runtime</span>.
          </h2>
          <p className="mt-5 max-w-3xl text-muted-foreground">
            We are taking the same foundation and building the infrastructure required to run this at company scale: memory, ontology, evidence, graph, runtime — and the agentic workflows that sit on top. That feels much closer to what companies will actually need.
          </p>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="relative z-10 mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">We are hiring builders.</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Small team, working very hard, backed by investors. Looking for strong people who want to help build PulseOS.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="glow bg-primary text-primary-foreground hover:bg-primary/90">
            <a href="mailto:juan@tintto.com?subject=Karpathy%20LLM%20Wiki">
              <Mail className="h-4 w-4" /> juan@tintto.com
            </a>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-border/60 bg-secondary/30 hover:bg-secondary/60">
            <a href="https://github.com/jp-carrilloe/pulseOS-lite" target="_blank" rel="noreferrer">
              <GitBranch className="h-4 w-4" /> Fork on GitHub
            </a>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Subject line: "Karpathy LLM Wiki"</p>
      </section>

      <footer className="relative z-10 mx-auto max-w-6xl px-6 py-10 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} PulseOS · built by Tintto
      </footer>
    </div>
  );
};

export default Index;
