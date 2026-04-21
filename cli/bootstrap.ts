/**
 * pulseos-lite-open-source-cli bootstrap
 *
 * Fills every template document in the repo with real company content.
 * Works recursively in dependency order — foundation docs are generated first
 * and their content is passed as grounding context to each subsequent document.
 *
 * Usage:
 *   cd cli && npm run bootstrap
 */

import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildBootstrapEvidenceBlock, collectBootstrapIntake } from "./bootstrap-intake.js";
import { loadRepoEnv, writeBootstrapState } from "./shared.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TODAY = new Date().toISOString().split("T")[0];

// ── Dependency Order ──────────────────────────────────────────────────────────
//
// Documents are generated in this order. Each stage can reference all
// documents from previous stages as grounding context.
//
// 100s: Foundation    → establishes what the company is, sells, and stands for
// 200s: Market + GTM  → depends on foundation
// 300s: Delivery      → depends on GTM + product portfolio
// 400s+: Partnerships, Finance, Legal, Tech → depend on everything above

const SECTION_ORDER: Record<string, number> = {
  "101": 0,
  "102": 1,  // Corporate Strategy: mission, vision, portfolio, brand, pricing
  "103": 2,  // Corporate Operations: setup, HR, SOPs, vendors
  "104": 3,  // Finance: models, budgets
  "105": 4,  // Technical Infrastructure
  "106": 5,  // Legal
  "201": 6,  // Market Intelligence + ICP
  "202": 7,  // GTM Strategy (uses 102 + 201)
  "203": 8,  // Sales Enablement (uses 202 + 201)
  "301": 9,  // Client Delivery (uses 202 + 203)
  "302": 10, // Analytics
  "401": 11,
  "402": 12,
  "501": 13,
  "502": 14,
  "600": 15,
};

function sectionOrder(relativePath: string): number {
  const match = relativePath.match(/(?:^|\/)(\d{3})/);
  if (!match) return 99;
  return SECTION_ORDER[match[1]] ?? 99;
}

function subsectionOrder(relativePath: string): number {
  const match = relativePath.match(/(\d+)\.(\d+)/);
  if (!match) return 0;
  return parseInt(match[1]) * 100 + parseInt(match[2]);
}

function sortByDependencyOrder(files: TemplateFile[]): TemplateFile[] {
  return [...files].sort((a, b) => {
    const sectionDiff = sectionOrder(a.relativePath) - sectionOrder(b.relativePath);
    if (sectionDiff !== 0) return sectionDiff;
    return subsectionOrder(a.relativePath) - subsectionOrder(b.relativePath);
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface BootstrapProfile {
  name: string;
}

interface TemplateFile {
  relativePath: string;
  absolutePath: string;
  content: string;
}

interface GeneratedDoc {
  relativePath: string;
  content: string;
}

interface BootstrapProvider {
  name: "openai" | "anthropic" | "gemini";
  model: string;
  validate(): Promise<void>;
  fillTemplate(args: {
    systemPrompt: string;
    userPrompt: string;
    fallback: string;
  }): Promise<string>;
}

// ── File Discovery ────────────────────────────────────────────────────────────

// Only numbered content docs (e.g. 102.1_Mission.md, 203.2_Sales.md)
// Skip: agent files, READMEs, system docs, cli dir
const CONTENT_FILE_PATTERN = /\/\d+\.\d+[^/]*\.md$/;
const SKIP_DIRS = new Set(["node_modules", ".git", "cli", "600_Projects"]);

async function findTemplateFiles(dir: string, base: string, results: TemplateFile[]): Promise<void> {
  let entries: any[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries as any[]) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(base, fullPath);

    if (entry.isDirectory()) {
      await findTemplateFiles(fullPath, base, results);
    } else if (entry.isFile() && CONTENT_FILE_PATTERN.test(fullPath)) {
      try {
        const content = await fsp.readFile(fullPath, "utf8");
        if (
          content.includes("[INSERT") ||
          content.includes("[CLIENT_NAME]") ||
          content.includes("Status:** Template")
        ) {
          results.push({ relativePath, absolutePath: fullPath, content });
        }
      } catch {
        // skip unreadable
      }
    }
  }
}

// ── Intake Questionnaire ──────────────────────────────────────────────────────

async function runIntake(rl: ReturnType<typeof createInterface>): Promise<BootstrapProfile> {
  const ask = async (prompt: string, required = true): Promise<string> => {
    while (true) {
      const answer = (await rl.question(prompt)).trim();
      if (answer || !required) return answer;
      process.stdout.write("  This field is required, so please enter a value before continuing.\n");
    }
  };

  process.stdout.write("\n" + "─".repeat(60) + "\n");
  process.stdout.write("Bootstrap Onboarding\n");
  process.stdout.write(
    "Bootstrap now reads from 001_Source_Intake and uses those source materials to fill the repo.\nOnly the company name is required here; the rest is inferred from your intake documents.\n",
  );
  process.stdout.write("─".repeat(60) + "\n\n");

  const name = await ask("Company name: ");
  return { name };
}

// ── Context Accumulator ───────────────────────────────────────────────────────

// Builds a condensed "already generated" context block from prior docs.
// We cap at ~80K chars to stay within Claude's context budget comfortably.
const CONTEXT_CAP = 80_000;

function buildAccumulatedContext(generated: GeneratedDoc[]): string {
  if (generated.length === 0) return "";

  let block = "## Previously Generated Documents\n\nThe following documents have already been generated in this session. Use them as source of truth when cross-referencing — prefer their specific content over your general knowledge.\n\n";
  let remaining = CONTEXT_CAP;

  // Include most recent docs first (they're most relevant to the current one)
  for (const doc of [...generated].reverse()) {
    const entry = `### ${doc.relativePath}\n\n${doc.content}\n\n---\n\n`;
    if (entry.length > remaining) {
      block += `[${doc.relativePath} omitted — context budget reached]\n\n`;
      continue;
    }
    block += entry;
    remaining -= entry.length;
  }

  return block;
}

// ── AI Fill ───────────────────────────────────────────────────────────────────

async function fillTemplate(
  provider: BootstrapProvider,
  profile: BootstrapProfile,
  file: TemplateFile,
  generated: GeneratedDoc[],
  evidenceBlock: string,
): Promise<string> {
  const accumulatedContext = buildAccumulatedContext(generated);

  const systemPrompt = `You are filling in company operations template documents in a specific dependency order. Foundation docs were filled first; you now have access to their completed content to ensure consistency and cross-referencing accuracy.

${evidenceBlock}

${accumulatedContext}

Rules:
- Replace ALL occurrences of [CLIENT_NAME] and [COMPANY_NAME] with "${profile.name}"
- Ground the document in the supplied intake evidence first. Use assumptions only when the evidence is incomplete.
- When making an assumption, state it explicitly in natural language as an inference from available intake materials.
- Replace ALL [INSERT_*] and [INSERT — *] placeholders with specific, relevant content
- When cross-referencing other documents (e.g. ICP, service portfolio, GTM), use the actual content from the previously generated documents above — not generic placeholders
- Update metadata: keep Version as-is, set Last Updated to ${TODAY}, keep Author/Editor as @ARK, change Status from "Template" to "Active"
- Keep every structural element intact: headers, bullet formats, tables, checkbox lists
- For table rows with [INSERT], fill in realistic values grounded in the company profile and prior docs
- If a section genuinely doesn't apply, state "N/A — ${profile.name} [reason]" rather than leaving placeholders
- Do NOT add new sections or remove existing ones
- Return ONLY the completed markdown document — no preamble, no explanations`;

  return provider.fillTemplate({
    systemPrompt,
    userPrompt: `Fill in this template document completely. File: ${file.relativePath}\n\n${file.content}`,
    fallback: file.content,
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await loadRepoEnv(process.env);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let bootstrapStateWritten = false;
  let bootstrapStartedAt: string | null = null;
  let bootstrapCompanyName: string | null = null;
  let bootstrapTemplateFiles = 0;
  let bootstrapLocalSourceCount = 0;
  let bootstrapExternalSourceCount = 0;
  let bootstrapWarningsCount = 0;

  try {
    process.stdout.write(
      "\npulseos-lite-open-source-cli bootstrap — Seed your PulseOS Lite Open Source repo with real content\n",
    );
    process.stdout.write(
      "Bootstrap seeds documents in dependency order. It reads source material from 001_Source_Intake and keeps the originals in place.\n",
    );

    // Discover and sort template files
    process.stdout.write("\nScanning for unfilled template files...\n");
    const raw: TemplateFile[] = [];
    await findTemplateFiles(REPO_ROOT, REPO_ROOT, raw);
    const templateFiles = sortByDependencyOrder(raw);

    if (templateFiles.length === 0) {
      process.stdout.write("No unfilled template files found. Run bootstrap again after adding new templates.\n");
      return;
    }

    process.stdout.write(`\nFound ${templateFiles.length} template files (in generation order):\n`);
    for (const f of templateFiles) {
      process.stdout.write(`  ${f.relativePath}\n`);
    }

    process.stdout.write(
      "\nReviewing source material in `001_Source_Intake/Data_Souces_Folder` and `001_Source_Intake/Data_Sources_References` before bootstrap starts...\n",
    );
    const intakeReport = await collectBootstrapIntake(REPO_ROOT, "");
    const totalIntakeFiles = intakeReport.localSources.length + intakeReport.externalSources.length;
    if (totalIntakeFiles === 0) {
      process.stderr.write(
        "\nBootstrap could not find any usable intake material.\nAdd source files to `001_Source_Intake/Data_Souces_Folder` or add valid reference notes in `001_Source_Intake/Data_Sources_References`, then run `npm run bootstrap` again.\n",
      );
      return;
    }

    process.stdout.write(
      `Found ${intakeReport.localSources.length} local intake files and ${intakeReport.externalSources.length} external reference files.\n`,
    );
    if (intakeReport.warnings.length > 0) {
      process.stdout.write("Bootstrap found a few intake warnings:\n");
      for (const warning of intakeReport.warnings) {
        process.stdout.write(`  - ${warning}\n`);
      }
    }

    const proceed = await rl.question(`\nProceed with source-driven onboarding? [Y/n] `);
    if (proceed.trim().toLowerCase() === "n") {
      process.stdout.write("Aborted.\n");
      return;
    }

    const profile = await runIntake(rl);
    intakeReport.companyName = profile.name;

    process.stdout.write("\nValidating available model providers for bootstrap...\n");
    const provider = await createBootstrapProvider();
    process.stdout.write(`\nBootstrap model provider: ${provider.name} (${provider.model})\n`);

    bootstrapStartedAt = new Date().toISOString();
    bootstrapCompanyName = profile.name;
    bootstrapTemplateFiles = templateFiles.length;
    bootstrapLocalSourceCount = intakeReport.localSources.length;
    bootstrapExternalSourceCount = intakeReport.externalSources.length;
    bootstrapWarningsCount = intakeReport.warnings.length;

    await writeBootstrapState(
      {
        status: "running",
        startedAt: bootstrapStartedAt,
        completedAt: null,
        companyName: profile.name,
        templateFiles: templateFiles.length,
        succeeded: 0,
        failed: 0,
        localSourceCount: intakeReport.localSources.length,
        externalSourceCount: intakeReport.externalSources.length,
        warningsCount: intakeReport.warnings.length,
        error: null,
      },
      process.env,
    );
    bootstrapStateWritten = true;

    // Final confirmation
    process.stdout.write("\n" + "─".repeat(60) + "\n");
    process.stdout.write(
      `Ready to generate ${templateFiles.length} documents for: ${profile.name}\n`,
    );
    process.stdout.write(
      "Each doc will be grounded in intake evidence first, then in previously generated docs.\n",
    );
    const confirm = await rl.question("Start generation? [Y/n] ");
    if (confirm.trim().toLowerCase() === "n") {
      process.stdout.write("Aborted.\n");
      return;
    }

    rl.close();

    // Generate in dependency order, accumulating context
    const generated: GeneratedDoc[] = [];
    let succeeded = 0;
    let failed = 0;

    process.stdout.write("\n");

    for (let i = 0; i < templateFiles.length; i++) {
      const file = templateFiles[i];
      const pct = Math.round(((i + 1) / templateFiles.length) * 100);
      process.stdout.write(`[${i + 1}/${templateFiles.length}] (${pct}%) ${file.relativePath}... `);

      try {
        const evidenceBlock = buildBootstrapEvidenceBlock(intakeReport, file.relativePath);
        const filled = await fillTemplate(provider, profile, file, generated, evidenceBlock);
        await fsp.writeFile(file.absolutePath, filled, "utf8");

        // Accumulate for subsequent docs
        generated.push({ relativePath: file.relativePath, content: filled });

        process.stdout.write(`done\n`);
        succeeded++;
      } catch (err) {
        process.stdout.write(`FAILED\n  → ${err instanceof Error ? err.message : String(err)}\n`);
        // Still add original to context so later docs have something to reference
        generated.push({ relativePath: file.relativePath, content: file.content });
        failed++;
      }
    }

    process.stdout.write("\n" + "─".repeat(60) + "\n");
    process.stdout.write(`Bootstrap complete.\n`);
    process.stdout.write(`  Filled:  ${succeeded} files\n`);
    if (failed > 0) process.stdout.write(`  Failed:  ${failed} files (originals preserved)\n`);
    await writeBootstrapState(
      {
        status: failed > 0 ? "failed" : "completed",
        startedAt: bootstrapStartedAt,
        completedAt: new Date().toISOString(),
        companyName: profile.name,
        templateFiles: templateFiles.length,
        succeeded,
        failed,
        localSourceCount: intakeReport.localSources.length,
        externalSourceCount: intakeReport.externalSources.length,
        warningsCount: intakeReport.warnings.length,
        error: failed > 0 ? `${failed} template files failed during bootstrap.` : null,
      },
      process.env,
    );
    process.stdout.write(
      `\nNext steps:\n  1. Review a few docs to sanity-check quality\n  2. Run 'npm run chat' to create the SQL index, run vectorization, and interact with your seeded repo\n  3. Re-run 'npm run bootstrap' anytime to reseed unfilled docs\n`,
    );
  } catch (error) {
    if (bootstrapStateWritten) {
      await writeBootstrapState(
        {
          status: "failed",
          startedAt: bootstrapStartedAt ?? new Date().toISOString(),
          completedAt: new Date().toISOString(),
          companyName: bootstrapCompanyName,
          templateFiles: bootstrapTemplateFiles,
          succeeded: 0,
          failed: 0,
          localSourceCount: bootstrapLocalSourceCount,
          externalSourceCount: bootstrapExternalSourceCount,
          warningsCount: bootstrapWarningsCount,
          error: error instanceof Error ? error.message : String(error),
        },
        process.env,
      );
    }
    throw error;
  } finally {
    rl.close();
  }
}

async function createBootstrapProvider(env: NodeJS.ProcessEnv = process.env): Promise<BootstrapProvider> {
  const candidates = buildBootstrapProviders(env);
  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      await candidate.validate();
      return candidate;
    } catch (error) {
      failures.push(
        `${candidate.name} (${candidate.model}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(
    [
      "Bootstrap could not validate any usable model provider.",
      "Checked providers in this order: OpenAI, Anthropic, Gemini.",
      "Validation failures:",
      ...failures.map((failure) => `- ${failure}`),
      "Add a working `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`/`GOOGLE_API_KEY` to `.env.local` or `.env`, then run `npm run bootstrap` again.",
    ].join("\n"),
  );
}

function buildBootstrapProviders(env: NodeJS.ProcessEnv = process.env): BootstrapProvider[] {
  const providers: BootstrapProvider[] = [];
  const openAiKey = env.OPENAI_API_KEY?.trim() ?? loadEnvKey("OPENAI_API_KEY");
  if (openAiKey) {
    const client = new OpenAI({ apiKey: openAiKey });
    const model = env.PULSEOS_BOOTSTRAP_OPENAI_MODEL?.trim() || "gpt-4o";
    providers.push({
      name: "openai",
      model,
      async validate() {
        await client.models.retrieve(model);
      },
      async fillTemplate({ systemPrompt, userPrompt, fallback }) {
        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });
        return response.choices[0]?.message?.content?.trim() || fallback;
      },
    });
  }

  const anthropicKey = env.ANTHROPIC_API_KEY?.trim() ?? loadEnvKey("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    const client = new Anthropic({ apiKey: anthropicKey });
    const model = env.PULSEOS_BOOTSTRAP_ANTHROPIC_MODEL?.trim() || "claude-opus-4-6";
    providers.push({
      name: "anthropic",
      model,
      async validate() {
        await client.messages.create({
          model,
          max_tokens: 1,
          messages: [{ role: "user", content: "Reply with OK." }],
        } as Parameters<typeof client.messages.create>[0]);
      },
      async fillTemplate({ systemPrompt, userPrompt, fallback }) {
        const response = await client.messages.create({
          model,
          max_tokens: 8192,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: userPrompt }],
          betas: ["prompt-caching-2024-07-31"],
        } as Parameters<typeof client.messages.create>[0]);
        const block = (response as Anthropic.Messages.Message).content[0];
        return block?.type === "text" ? block.text : fallback;
      },
    });
  }

  const geminiKey =
    env.GEMINI_API_KEY?.trim() ??
    env.GOOGLE_API_KEY?.trim() ??
    loadEnvKey("GEMINI_API_KEY") ??
    loadEnvKey("GOOGLE_API_KEY");
  if (geminiKey) {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = env.PULSEOS_BOOTSTRAP_GEMINI_MODEL?.trim() || "gemini-2.0-flash";
    providers.push({
      name: "gemini",
      model,
      async validate() {
        const geminiModel = genAI.getGenerativeModel({ model });
        await geminiModel.generateContent("Reply with OK.");
      },
      async fillTemplate({ systemPrompt, userPrompt, fallback }) {
        const geminiModel = genAI.getGenerativeModel({
          model,
          systemInstruction: systemPrompt,
        });
        const result = await geminiModel.generateContent({
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        });
        return result.response.text().trim() || fallback;
      },
    });
  }

  if (providers.length === 0) {
    throw new Error(
      "Bootstrap could not find any configured model API key.\nAdd `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`/`GOOGLE_API_KEY` to `.env.local` or `.env`, then run `npm run bootstrap` again.",
    );
  }

  return providers;
}

function loadEnvKey(key: string): string | undefined {
  const envPath = path.join(REPO_ROOT, ".env");
  if (!fs.existsSync(envPath)) return undefined;
  try {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eqIdx = trimmed.indexOf("=");
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (k === key) return v;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

await main();
