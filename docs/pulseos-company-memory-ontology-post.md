# PulseOS: making companies machine-readable

This resonates a lot! We have been working on this problem from the company side: how do you make an entire company machine-readable, not just a pile of documents searchable?

The LLM wiki idea is a big piece of the answer. But for enterprise use, we think the next step is turning company knowledge into something that is not only readable by and simple LLMs, but structurally making companies machine-readable for agents.

A company is not just pages. It is:
- canonical documents
- entities and relationships
- evidence behind claims, creating a reality layer
- workflows, ownership, and operating state
- a runtime environment that allows Deployment, testing, and optimization of agentic workflows.

That is what we are building with PulseOS.

We also open-sourced the simplest version of this idea here:

[PulseOS Lite](https://github.com/jp-carrilloe/pulseOS-lite)

It gives you:
- a canonical markdown company memory
- a local CLI and daemon, also running with LLM o-auth or api keys
- a graph UI for ontology and document relationships, and a mini IDE UI for non technical users that use IDEs including direct terminal access to call on LLMs.
- a local SQL/vector memory layer
- a local-first persistent workspace so memory survives beyond one chat session or repo clone

In the full PulseOS direction, we are taking that same foundation and building the infrastructure required to run this at a real company level: company memory, ontology, evidence, graph structure, runtime, and eventually enterprise agent workflows on top.

So for us, it is not just “LLM for the wiki.”

It is:

```text
company memory + ontology + evidence + runtime
```

That feels much closer to what companies will actually need.

Screenshot placeholder:

`[ INSERT SCREENSHOT HERE ]`

If this is interesting, please try it, fork it, break it, and improve it:

[https://github.com/jp-carrilloe/pulseOS-lite](https://github.com/jp-carrilloe/pulseOS-lite)

We are a small team working very hard on this, backed by investors, and we are looking for strong people who want to help build it. If that is you, write me at [juan@tintto.com](mailto:juan@tintto.com). Subject: "Karpathy LLM Wiki".
