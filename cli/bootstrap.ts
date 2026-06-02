/**
 * pulseos-lite-cli bootstrap
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
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateClaudeText, generateOpenAiText, getModelCredentialStatus, validateClaudeAccess, validateOpenAiAccess } from "./auth.js";
import { buildBootstrapEvidenceBlock, collectBootstrapIntake } from "./bootstrap-intake.js";
import { actionBlock, bold, bullet, dim, kv, section, spinner, tone } from "./terminal-format.js";
import { buildUiBundle, ensureUiReady } from "./ui-runtime.js";
import {
  ensureCliWorkspaceReady,
  fetchDaemonJson,
  getCliDbPath,
  loadRepoEnv,
  probeDaemonHealth,
  readDaemonState,
  writeBootstrapState,
} from "./shared.js";
import { openWorkspaceStore } from "./workspace-store.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TODAY = new Date().toISOString().split("T")[0];
export const ACME_SAMPLE_MEMORY_DIR = "000_Acme_Sample_Company_Memory";

type SpawnLike = (
  command: string,
  args: readonly string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdio: "inherit";
  },
) => ChildProcess;

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

interface BootstrapIndexRefreshResult {
  fileCount: number;
  charCount: number;
  indexedAt: string;
  embeddingModel: string;
  embeddingMode: string;
  refreshedViaDaemon: boolean;
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

export function hasAcmeSampleCompanyMemory(repoRoot: string = REPO_ROOT): boolean {
  return fs.existsSync(path.join(repoRoot, ACME_SAMPLE_MEMORY_DIR));
}

export function getBootstrapChatHandoffCommand() {
  const cliRoot = path.dirname(fileURLToPath(import.meta.url));
  return {
    cwd: cliRoot,
    command: process.execPath,
    args: ["--import", "tsx/esm", path.join(cliRoot, "index.ts"), "chat"],
  };
}

export async function handoffBootstrapToChat(
  env: NodeJS.ProcessEnv = process.env,
  launcher: SpawnLike = spawn,
): Promise<number> {
  const { command, args, cwd } = getBootstrapChatHandoffCommand();
  return await new Promise((resolve, reject) => {
    const child = launcher(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
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
    "Bootstrap now reads from 001_Data_Souces and existing 000_Company_Memory docs to fill the repo.\nOnly the company name is required here; the rest is inferred from your intake documents and curated memory.\n",
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
- Ground the document in the supplied evidence first. Use curated Company Memory evidence as the current source of truth when it conflicts with raw intake materials; use raw data sources to fill gaps and add detail.
- Use assumptions only when curated memory and raw intake evidence are incomplete.
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
  const workspace = await ensureCliWorkspaceReady(process.env, { log: (message) => process.stdout.write(message) });
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let bootstrapStateWritten = false;
  let bootstrapStartedAt: string | null = null;
  let bootstrapCompanyName: string | null = null;
  let bootstrapTemplateFiles = 0;
  let bootstrapLocalSourceCount = 0;
  let bootstrapExternalSourceCount = 0;
  let bootstrapCompanyMemorySourceCount = 0;
  let bootstrapWarningsCount = 0;

  try {
    process.stdout.write(
      `\n${section("Bootstrap")}\n${bold("pulseos-lite-cli bootstrap")} — Seed your PulseOS-Lite repo with real content\n`,
    );
    process.stdout.write(`${kv("Workspace storage", workspace.paths.workspaceRoot)}\n`);
    process.stdout.write(
      `${bullet("Bootstrap seeds documents in dependency order.")}\n${bullet("It reads raw source material from 001_Data_Souces and checks existing curated docs in 000_Company_Memory.")}\n`,
    );

    // ── Step 1: Model & Auth Selection ──────────────────────────────────────
    process.stdout.write(`\n${section("Step 1 — Select Model & Authentication")}\n`);
    process.stdout.write(`${bullet("Choose which AI provider and authentication method to use for this bootstrap run.", "info")}\n\n`);
    await showAuthStatus(process.env);
    const provider = await createBootstrapProvider(rl, process.env);
    process.stdout.write(`${kv("Provider confirmed", `${provider.name} (${provider.model})`, "success")}\n`);

    // ── Step 2: Discover and sort template files ─────────────────────────────
    process.stdout.write(`\n${section("Step 2 — Template Scan")}\n${bullet("Scanning for unfilled template files...", "info")}\n`);
    const raw: TemplateFile[] = [];
    await findTemplateFiles(REPO_ROOT, REPO_ROOT, raw);
    const templateFiles = sortByDependencyOrder(raw);

    process.stdout.write(
      `\n${section("Intake Review")}\n${bullet("Reviewing source material in `001_Data_Souces/Data_Souces_Folder`, `001_Data_Sources_References`, and existing curated docs in `000_Company_Memory` before bootstrap starts...", "info")}\n`,
    );
    const intakeReport = await collectBootstrapIntake(REPO_ROOT, "");
    const totalRawIntakeFiles = intakeReport.localSources.length + intakeReport.externalSources.length;
    const totalCompanyMemoryFiles = intakeReport.companyMemorySources.length;

    // Block if absolutely no content exists anywhere
    if (totalRawIntakeFiles === 0 && totalCompanyMemoryFiles === 0) {
      process.stderr.write(
        `\n${section("Bootstrap Blocked")}\n${kv("Reason", "no usable intake material or company memory files found", "danger")}\n${bullet("Add source files to `001_Data_Souces/Data_Souces_Folder`, add valid reference notes in `001_Data_Sources_References`, or add custom files directly to `000_Company_Memory`.", "warning")}\n`,
      );
      process.stdout.write(
        `\n${actionBlock("Best next action", [
          "PulseOS will open chat so you can keep working with the daemon and auth already wired up.",
          "Add source material or direct company memory files, then leave chat with `/exit`.",
          "Run `npm run bootstrap` again when you are ready to seed the docs.",
        ], "warning")}\n\n`,
      );
      const exitCode = await handoffBootstrapToChat(process.env);
      if (exitCode !== 0) {
        process.exitCode = exitCode;
      }
      return;
    }

    // If no templates to fill, but we have memory files or raw sources, perform index sync directly
    if (templateFiles.length === 0) {
      process.stdout.write(`${kv("Status", "no unfilled template files found", "warning")}\n`);
      process.stdout.write(`${bullet("All templates are already filled or none were found. Proceeding to index and build the knowledge graph and embeddings from your active company memory...", "info")}\n`);
      
      process.stdout.write(`\n${section("Index Refresh")}\n${bullet("Refreshing Company Memory graph/index from `000_Company_Memory`...", "info")}\n`);
      const indexRefresh = await refreshCompanyMemoryIndex(process.env);
      process.stdout.write(`${kv("Indexed", `${indexRefresh.fileCount} Company Memory docs (${indexRefresh.charCount.toLocaleString()} chars)`, "success")}\n`);
      process.stdout.write(`${kv("Embeddings", `${indexRefresh.embeddingModel} [${indexRefresh.embeddingMode}]`, "info")}\n`);
      if (indexRefresh.refreshedViaDaemon) {
        process.stdout.write(`${kv("Daemon graph cache", "refreshed", "success")}\n`);
      }

      let uiUrl: string | null = null;
      process.stdout.write(`\n${section("UI Build")}\n${bullet("Building the browser UI for this bootstrap run...", "info")}\n`);
      try {
        await buildUiBundle(process.env);
        const daemonState = await readDaemonState(process.env);
        if (daemonState && (await probeDaemonHealth(daemonState.port, daemonState.token))) {
          uiUrl = await ensureUiReady(daemonState);
          process.stdout.write(`${kv("UI", "ready", "success")}\n${bullet(uiUrl, "info")}\n`);
        } else {
          process.stdout.write(`${kv("UI", "not ready", "warning")}\n${bullet("The index refresh completed, but no healthy daemon was available to serve the UI yet.", "warning")}\n`);
        }
      } catch (error) {
        process.stdout.write(`${kv("UI", "not ready", "warning")}\n${bullet(error instanceof Error ? error.message : String(error), "warning")}\n`);
      }
      process.stdout.write(`\n${actionBlock("Best next action", [
        "Run `npm run chat` to interact with the refreshed Company Memory index.",
        uiUrl ? `Open the ready UI: ${uiUrl}` : "Run `npm run ui` to inspect the Company Memory workspace in the browser.",
      ], "success")}\n`);
      return;
    }

    process.stdout.write(`\n${section("Templates Found")}\n${kv("Count", String(templateFiles.length), "success")}\n`);
    for (const f of templateFiles) {
      process.stdout.write(`${bullet(tone(f.relativePath, "info"))}\n`);
    }

    process.stdout.write(`\n${section("Sources & Evidence")}\n`);
    // Company Memory breakdown
    const memUsable = intakeReport.companyMemorySources.length;
    const memScanned = intakeReport.companyMemoryScanned;
    const memSkipped = memScanned - memUsable;
    process.stdout.write(
      `${kv("Company Memory", `${memScanned} files scanned`, memScanned > 0 ? "info" : "muted")}\n`,
    );
    process.stdout.write(
      `  ${tone("✓", "success")} ${bold(String(memUsable))} usable as evidence   ${dim(`(${memSkipped} skipped — templates / agent files / READMEs)`)}\n`,
    );
    // Raw intake
    process.stdout.write(
      `${kv("Local intake files", String(intakeReport.localSources.length), intakeReport.localSources.length > 0 ? "success" : "muted")}\n`,
    );
    const refCount = intakeReport.parsedReferences.filter((r) => r.valid).length;
    process.stdout.write(
      `${kv("External references", `${intakeReport.externalSources.length} files from ${refCount} reference source(s)`, intakeReport.externalSources.length > 0 ? "success" : "muted")}\n`,
    );
    const totalEvidence = memUsable + intakeReport.localSources.length + intakeReport.externalSources.length;
    process.stdout.write(
      `${kv("Total evidence pool", `${totalEvidence} sources available to ground generation`, totalEvidence > 0 ? "success" : "warning")}\n`,
    );
    process.stdout.write(
      `  ${dim(`Up to 8 most-relevant sources are selected per document during generation.`)}\n`,
    );
    if (intakeReport.warnings.length > 0) {
      process.stdout.write(`${actionBlock("Intake warnings", intakeReport.warnings, "warning")}\n`);
    }

    const proceed = await rl.question(`\nProceed with source-driven onboarding? [y/n] `);
    if (proceed.trim().toLowerCase() === "n") {
      process.stdout.write(`${kv("Status", "aborted", "warning")}\n`);
      return;
    }

    const profile = await runIntake(rl);
    intakeReport.companyName = profile.name;

    if (hasAcmeSampleCompanyMemory(REPO_ROOT)) {
      process.stdout.write(`\n${section("Sample Company Memory")}\n${kv("Detected", ACME_SAMPLE_MEMORY_DIR, "warning")}\n${bullet("This sample folder is included as a public reference/template.")}\n`);
      const deleteSample = await rl.question(
        `Do you want to delete the sample folder to keep your repo clean? [y/n] `,
      );
      if (deleteSample.trim().toLowerCase() === "y") {
        process.stdout.write(`${bullet(`Deleting ${ACME_SAMPLE_MEMORY_DIR}...`, "warning")} `);
        await fsp.rm(path.join(REPO_ROOT, ACME_SAMPLE_MEMORY_DIR), { recursive: true, force: true });
        process.stdout.write("done\n");
      } else {
        process.stdout.write(`${bullet("Keeping sample folder.", "muted")}\n`);
      }
    }



    bootstrapStartedAt = new Date().toISOString();
    bootstrapCompanyName = profile.name;
    bootstrapTemplateFiles = templateFiles.length;
    bootstrapLocalSourceCount = intakeReport.localSources.length;
    bootstrapExternalSourceCount = intakeReport.externalSources.length;
    bootstrapCompanyMemorySourceCount = intakeReport.companyMemorySources.length;
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
        companyMemorySourceCount: intakeReport.companyMemorySources.length,
        indexedDocumentCount: 0,
        indexedAt: null,
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
      "Each doc will be grounded in curated Company Memory, raw intake evidence, and previously generated docs.\n",
    );
    const confirm = await rl.question("Start generation? [y/n] ");
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
      const label = `[${i + 1}/${templateFiles.length}] ${pct}%`;
      const shortName = file.relativePath.split("/").slice(-2).join("/");

      const stopSpinner = spinner(`${dim(label)} ${tone(shortName, "info")}`);
      const t0 = Date.now();

      try {
        const evidenceBlock = buildBootstrapEvidenceBlock(intakeReport, file.relativePath);
        const filled = await fillTemplate(provider, profile, file, generated, evidenceBlock);
        await fsp.writeFile(file.absolutePath, filled, "utf8");

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        stopSpinner(
          `${tone("✓", "success")} ${dim(label)} ${tone(shortName, "info")} ${dim(`(${elapsed}s)`)}`,
        );
        generated.push({ relativePath: file.relativePath, content: filled });
        succeeded++;
      } catch (err) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        stopSpinner(
          `${tone("✗", "danger")} ${dim(label)} ${tone(shortName, "danger")} ${dim(`(${elapsed}s)`)}`,
        );
        process.stdout.write(`  ${bullet(err instanceof Error ? err.message : String(err), "danger")}\n`);
        generated.push({ relativePath: file.relativePath, content: file.content });
        failed++;
      }
    }

    process.stdout.write(`\n${section("Bootstrap Complete")}\n`);
    process.stdout.write(`${kv("Documents filled", `${succeeded} of ${templateFiles.length}`, succeeded === templateFiles.length ? "success" : "warning")}\n`);
    if (failed > 0) process.stdout.write(`${kv("Failed", `${failed} (originals preserved on disk)`, "danger")}\n`);

    process.stdout.write(`\n${section("Index & Embeddings")}\n`);
    process.stdout.write(
      `${bullet(`Scanning 000_Company_Memory and building vector index — this may take a moment...`, "info")}\n`,
    );
    const stopIndex = spinner("Indexing company memory files and computing embeddings...");
    const indexRefresh = await refreshCompanyMemoryIndex(process.env);
    stopIndex(
      `${tone("✓", "success")} Indexed ${bold(String(indexRefresh.fileCount))} files  ${dim(`(${indexRefresh.charCount.toLocaleString()} chars · ${indexRefresh.embeddingModel})`)}`,
    );
    if (indexRefresh.refreshedViaDaemon) {
      process.stdout.write(`  ${tone("✓", "success")} Daemon graph cache refreshed\n`);
    }

    let uiUrl: string | null = null;
    process.stdout.write(`\n${section("UI Build")}\n${bullet("Building the browser UI for this bootstrap run...", "info")}\n`);
    try {
      await buildUiBundle(process.env);
      const daemonState = await readDaemonState(process.env);
      if (daemonState && (await probeDaemonHealth(daemonState.port, daemonState.token))) {
        uiUrl = await ensureUiReady(daemonState);
        process.stdout.write(`${kv("UI", "ready", "success")}\n${bullet(uiUrl, "info")}\n`);
      } else {
        process.stdout.write(`${kv("UI", "not ready", "warning")}\n${bullet("The index refresh completed, but no healthy daemon was available to serve the UI yet.", "warning")}\n`);
      }
    } catch (error) {
      process.stdout.write(`${kv("UI", "not ready", "warning")}\n${bullet(error instanceof Error ? error.message : String(error), "warning")}\n`);
    }

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
        companyMemorySourceCount: intakeReport.companyMemorySources.length,
        indexedDocumentCount: indexRefresh.fileCount,
        indexedAt: indexRefresh.indexedAt,
        warningsCount: intakeReport.warnings.length,
        error: failed > 0 ? `${failed} template files failed during bootstrap.` : null,
      },
      process.env,
    );
    process.stdout.write(`\n${actionBlock("Best next action", [
      "Review a few docs to sanity-check quality.",
      "Run `npm run chat` to interact with the refreshed Company Memory index.",
      uiUrl ? `Open the ready UI: ${uiUrl}` : "Run `npm run ui` to inspect the Company Memory workspace in the browser.",
    ], failed > 0 ? "warning" : "success")}\n`);
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
          companyMemorySourceCount: bootstrapCompanyMemorySourceCount,
          indexedDocumentCount: 0,
          indexedAt: null,
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

async function refreshCompanyMemoryIndex(env: NodeJS.ProcessEnv): Promise<BootstrapIndexRefreshResult> {
  await ensureCliWorkspaceReady(env, { log: (message) => process.stdout.write(message) });
  const daemonState = await readDaemonState(env);
  if (daemonState && (await probeDaemonHealth(daemonState.port, daemonState.token))) {
    const result = await fetchDaemonJson<{
      files: number;
      charCount: number;
      indexedAt: string;
      embeddingModel: string;
      embeddingMode: string;
    }>(daemonState, "/command", {
      method: "POST",
      body: JSON.stringify({ name: "reload_repo", args: {} }),
    });
    return {
      fileCount: result.files,
      charCount: result.charCount,
      indexedAt: result.indexedAt,
      embeddingModel: result.embeddingModel,
      embeddingMode: result.embeddingMode,
      refreshedViaDaemon: true,
    };
  }

  const index = openWorkspaceStore({
    repoRoot: REPO_ROOT,
    dbPath: getCliDbPath(env),
    env,
  });
  try {
    const result = await index.sync();
    return {
      fileCount: result.fileCount,
      charCount: result.charCount,
      indexedAt: result.indexedAt,
      embeddingModel: result.embeddingModel,
      embeddingMode: result.embeddingMode,
      refreshedViaDaemon: false,
    };
  } finally {
    index.close();
  }
}

async function showAuthStatus(env: NodeJS.ProcessEnv): Promise<void> {
  process.stdout.write(`${bullet("Checking available credentials...", "info")}\n`);
  // Probe all providers in parallel using auto mode so we see the full picture
  const probeEnv = { ...env, PULSEOS_OPENAI_AUTH_MODE: "auto", PULSEOS_CLAUDE_AUTH_MODE: "auto" };
  const [openai, claude, gemini] = await Promise.all([
    getModelCredentialStatus("openai", probeEnv).catch(() => ({
      ok: false,
      message: "Credential probe failed.",
      method: "none" as const,
      keyName: "",
    })),
    getModelCredentialStatus("claude", probeEnv).catch(() => ({
      ok: false,
      message: "Credential probe failed.",
      method: "none" as const,
      keyName: "",
    })),
    getModelCredentialStatus("gemini", probeEnv).catch(() => ({
      ok: false,
      message: "Credential probe failed.",
      method: "none" as const,
      keyName: "",
    })),
  ]);

  const row = (ok: boolean, label: string, msg: string): string =>
    `  ${ok ? tone("✓", "success") : tone("✗", "muted")}  ${bold(label.padEnd(10))}  ${dim(msg)}\n`;

  process.stdout.write(row(openai.ok, "OpenAI", openai.message));
  process.stdout.write(row(claude.ok, "Claude", claude.message));
  process.stdout.write(row(gemini.ok, "Gemini", gemini.message));
  process.stdout.write("\n");
}

async function createBootstrapProvider(
  rl: ReturnType<typeof createInterface>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BootstrapProvider> {
  while (true) {
    process.stdout.write(`\n${section("Model & Authentication Selection")}\n`);
    process.stdout.write("Please select your preferred AI model provider for bootstrapping:\n");
    process.stdout.write(`  ${bold("1")} - OpenAI (default: gpt-5.4)\n`);
    process.stdout.write(`  ${bold("2")} - Anthropic Claude (default: claude-opus-4-6)\n`);
    process.stdout.write(`  ${bold("3")} - Google Gemini (default: gemini-2.0-flash)\n`);
    
    const providerChoice = (await rl.question(`Select provider [1-3, default: 1]: `)).trim();
    const providerIndex = providerChoice === "" ? "1" : providerChoice;

    if (providerIndex === "1") {
      process.stdout.write(`\n${bold("OpenAI Authentication")}\n`);
      process.stdout.write("Please select your preferred authentication method:\n");
      process.stdout.write(`  ${bold("1")} - Local signed-in Codex CLI session (via \`codex login\`)\n`);
      process.stdout.write(`  ${bold("2")} - Direct API Key (via \`OPENAI_API_KEY\`)\n`);
      
      const authChoice = (await rl.question(`Select auth [1-2, default: 1]: `)).trim();
      const authIndex = authChoice === "" ? "1" : authChoice;
      
      if (authIndex === "1") {
        env.PULSEOS_OPENAI_AUTH_MODE = "codex_cli_session";
      } else if (authIndex === "2") {
        env.PULSEOS_OPENAI_AUTH_MODE = "api_key";
      } else {
        process.stdout.write(`${tone("Invalid choice, starting selection over.", "warning")}\n`);
        continue;
      }

      // Rebuild providers and validate
      const candidates = buildBootstrapProviders(env);
      const openaiProvider = candidates.find((c) => c.name === "openai");
      if (!openaiProvider) {
        process.stdout.write(`${tone("Error building OpenAI provider candidates.", "danger")}\n`);
        continue;
      }
      
      process.stdout.write(`${bullet(`Validating OpenAI access via ${env.PULSEOS_OPENAI_AUTH_MODE === "api_key" ? "API Key" : "Codex CLI"}...`, "info")}\n`);
      try {
        await openaiProvider.validate();
        return openaiProvider;
      } catch (error) {
        process.stdout.write(`\n${tone("OpenAI Validation Failed!", "danger")}\n`);
        process.stdout.write(`${bullet(error instanceof Error ? error.message : String(error), "danger")}\n`);
        const retry = await rl.question(`\nWould you like to try another provider/auth method? [y/n] `);
        if (retry.trim().toLowerCase() === "n") {
          throw error;
        }
        continue;
      }
    } else if (providerIndex === "2") {
      process.stdout.write(`\n${bold("Anthropic Claude Authentication")}\n`);
      process.stdout.write("Please select your preferred authentication method:\n");
      process.stdout.write(`  ${bold("1")} - Direct API Key (via \`ANTHROPIC_API_KEY\`)\n`);
      process.stdout.write(`  ${bold("2")} - Local signed-in Claude CLI session (via \`claude auth login\`)\n`);
      
      const authChoice = (await rl.question(`Select auth [1-2, default: 1]: `)).trim();
      const authIndex = authChoice === "" ? "1" : authChoice;
      
      if (authIndex === "1") {
        env.PULSEOS_CLAUDE_AUTH_MODE = "api_key";
      } else if (authIndex === "2") {
        env.PULSEOS_CLAUDE_AUTH_MODE = "claude_cli_session";
      } else {
        process.stdout.write(`${tone("Invalid choice, starting selection over.", "warning")}\n`);
        continue;
      }

      // Rebuild providers and validate
      const candidates = buildBootstrapProviders(env);
      const anthropicProvider = candidates.find((c) => c.name === "anthropic");
      if (!anthropicProvider) {
        process.stdout.write(`${tone("Error building Anthropic provider candidates.", "danger")}\n`);
        continue;
      }
      
      process.stdout.write(`${bullet(`Validating Claude access via ${env.PULSEOS_CLAUDE_AUTH_MODE === "api_key" ? "API Key" : "Claude CLI"}...`, "info")}\n`);
      try {
        await anthropicProvider.validate();
        return anthropicProvider;
      } catch (error) {
        process.stdout.write(`\n${tone("Anthropic Validation Failed!", "danger")}\n`);
        process.stdout.write(`${bullet(error instanceof Error ? error.message : String(error), "danger")}\n`);
        const retry = await rl.question(`\nWould you like to try another provider/auth method? [y/n] `);
        if (retry.trim().toLowerCase() === "n") {
          throw error;
        }
        continue;
      }
    } else if (providerIndex === "3") {
      process.stdout.write(`\n${bold("Google Gemini Authentication")}\n`);
      process.stdout.write(`${bullet("Gemini authentication is direct via API key.", "info")}\n`);
      
      // Rebuild providers and validate
      const candidates = buildBootstrapProviders(env);
      const geminiProvider = candidates.find((c) => c.name === "gemini");
      if (!geminiProvider) {
        process.stdout.write(`${tone("Error building Gemini provider candidates or key is missing. Add GEMINI_API_KEY/GOOGLE_API_KEY.", "danger")}\n`);
        const retry = await rl.question(`\nWould you like to try another provider/auth method? [y/n] `);
        if (retry.trim().toLowerCase() === "n") {
          throw new Error("Gemini API key is not configured.");
        }
        continue;
      }
      
      process.stdout.write(`${bullet("Validating Gemini access via API key...", "info")}\n`);
      try {
        await geminiProvider.validate();
        return geminiProvider;
      } catch (error) {
        process.stdout.write(`\n${tone("Gemini Validation Failed!", "danger")}\n`);
        process.stdout.write(`${bullet(error instanceof Error ? error.message : String(error), "danger")}\n`);
        const retry = await rl.question(`\nWould you like to try another provider/auth method? [y/n] `);
        if (retry.trim().toLowerCase() === "n") {
          throw error;
        }
        continue;
      }
    } else {
      process.stdout.write(`${tone("Invalid provider choice, please select 1, 2, or 3.", "warning")}\n`);
      continue;
    }
  }
}

function buildBootstrapProviders(env: NodeJS.ProcessEnv = process.env): BootstrapProvider[] {
  const providers: BootstrapProvider[] = [];
  const model = env.PULSEOS_BOOTSTRAP_OPENAI_MODEL?.trim() || "gpt-5.4";
  providers.push({
    name: "openai",
    model,
    async validate() {
      await validateOpenAiAccess(model, env, REPO_ROOT);
    },
    async fillTemplate({ systemPrompt, userPrompt, fallback }) {
      const response = await generateOpenAiText({
        systemPrompt,
        userPrompt,
        modelId: model,
        env,
        workingDirectory: REPO_ROOT,
      });
      return response.trim() || fallback;
    },
  });

  const anthropicModel = env.PULSEOS_BOOTSTRAP_ANTHROPIC_MODEL?.trim() || "claude-opus-4-6";
  providers.push({
    name: "anthropic",
    model: anthropicModel,
    async validate() {
      await validateClaudeAccess(anthropicModel, env, REPO_ROOT);
    },
    async fillTemplate({ systemPrompt, userPrompt, fallback }) {
      const response = await generateClaudeText({
        systemPrompt,
        userPrompt,
        modelId: anthropicModel,
        env,
        workingDirectory: REPO_ROOT,
      });
      return response.trim() || fallback;
    },
  });

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
      "Bootstrap could not find any usable model provider.\nAdd `OPENAI_API_KEY`, sign in with `codex login`, add `ANTHROPIC_API_KEY`, sign in with `claude auth login`, or configure `GEMINI_API_KEY` / `GOOGLE_API_KEY`, then run `npm run bootstrap` again.",
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `\n${section("Bootstrap Failed")}\n${kv("Error", error instanceof Error ? error.message : String(error), "danger")}\n${actionBlock("Best next action", [
        "Fix the issue above, then rerun `npm run bootstrap`.",
        "Use `npm run status` if you want a quick view of intake, auth, and daemon state.",
      ], "danger")}\n`,
    );
    process.exitCode = 1;
  }
}
