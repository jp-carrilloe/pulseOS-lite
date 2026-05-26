// Edge function: answer pulse-style queries grounded in seeded Acme docs.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface DocPayload {
  path: string;
  title: string;
  content: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, docs } = (await req.json()) as {
      question?: string;
      docs?: DocPayload[];
    };

    if (!question || typeof question !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing 'question' string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!Array.isArray(docs) || docs.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing 'docs' array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Crude relevance ranking: keyword overlap. Keeps payload small.
    const tokens = question
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 3);

    const ranked = docs
      .map((d) => {
        const lower = d.content.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (lower.includes(t)) score += 1;
        }
        return { ...d, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const context = ranked
      .map(
        (d) =>
          `### ${d.title}\n_path: ${d.path}_\n\n${d.content.slice(0, 2400)}`,
      )
      .join("\n\n---\n\n");

    const system = `You are PulseOS, a company-memory engine. Answer the user's question using ONLY the company documents provided as context. Be concise (4-8 sentences max), structured, and cite the document paths inline like [101_Overview/...].
If the answer is not in the documents, say so plainly. Do not invent facts.`;

    const userMessage = `Company documents:\n\n${context}\n\n---\nQuestion: ${question}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": LOVABLE_API_KEY,
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: system },
            { role: "user", content: userMessage },
          ],
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return new Response(
        JSON.stringify({
          error: `AI gateway error ${response.status}: ${text.slice(0, 400)}`,
        }),
        {
          status: response.status === 429 || response.status === 402 ? response.status : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content ?? "(no response)";

    return new Response(
      JSON.stringify({
        answer,
        sources: ranked.filter((d) => d.score > 0).map((d) => ({ path: d.path, title: d.title })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
