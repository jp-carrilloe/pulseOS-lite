import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";

export const LOCAL_INTAKE_DIR = "001_Data_Souces/Data_Souces_Folder";
export const REFERENCE_DIR = "001_Data_Souces/Data_Sources_References";
export const LEGACY_LOCAL_INTAKE_DIR = "001_Source_Intake/Data_Souces_Folder";
export const LEGACY_REFERENCE_DIR = "001_Source_Intake/Data_Sources_References";
const SUPPORTED_EXTENSIONS = new Set([".md", ".txt", ".json", ".csv"]);
const SKIP_DIRS = new Set(["node_modules"]);
const MAX_EXCERPT_LENGTH = 1600;
const MAX_SUMMARY_LENGTH = 260;

export interface ExternalReferenceNote {
  notePath: string;
  path: string | null;
  owner: string | null;
  contents: string | null;
  usageNotes: string | null;
  constraints: string | null;
  valid: boolean;
}

export interface IntakeSource {
  sourceType: "local_intake" | "external_reference";
  path: string;
  relativePath: string;
  text: string;
  summary: string;
  reference?: ExternalReferenceNote;
}

export interface IntakeReport {
  companyName: string;
  localSources: IntakeSource[];
  externalSources: IntakeSource[];
  parsedReferences: ExternalReferenceNote[];
  warnings: string[];
}

export async function collectBootstrapIntake(repoRoot: string, companyName: string): Promise<IntakeReport> {
  const warnings: string[] = [];
  const localSources = await collectFirstAvailableLocalSources(repoRoot, warnings);
  const parsedReferences = await collectFirstAvailableReferenceNotes(repoRoot, warnings);
  const externalSources: IntakeSource[] = [];

  for (const reference of parsedReferences) {
    if (!reference.valid || !reference.path) continue;
    const gathered = await collectSupportedFiles(reference.path, "external_reference", warnings, repoRoot, reference);
    externalSources.push(...gathered);
  }

  return {
    companyName,
    localSources,
    externalSources,
    parsedReferences,
    warnings,
  };
}

async function collectFirstAvailableLocalSources(repoRoot: string, warnings: string[]): Promise<IntakeSource[]> {
  const primaryRoot = path.join(repoRoot, LOCAL_INTAKE_DIR);
  const legacyRoot = path.join(repoRoot, LEGACY_LOCAL_INTAKE_DIR);
  const primarySources = await collectSupportedFiles(primaryRoot, "local_intake", warnings, repoRoot);
  if (primarySources.length > 0 || !fs.existsSync(legacyRoot)) return primarySources;
  return collectSupportedFiles(legacyRoot, "local_intake", warnings, repoRoot);
}

async function collectFirstAvailableReferenceNotes(repoRoot: string, warnings: string[]): Promise<ExternalReferenceNote[]> {
  const primaryRoot = path.join(repoRoot, REFERENCE_DIR);
  const legacyRoot = path.join(repoRoot, LEGACY_REFERENCE_DIR);
  const primaryReferences = await collectReferenceNotes(primaryRoot, repoRoot, warnings);
  if (primaryReferences.length > 0 || !fs.existsSync(legacyRoot)) return primaryReferences;
  return collectReferenceNotes(legacyRoot, repoRoot, warnings);
}

async function collectSupportedFiles(
  rootDir: string,
  sourceType: IntakeSource["sourceType"],
  warnings: string[],
  repoRoot: string,
  reference?: ExternalReferenceNote,
): Promise<IntakeSource[]> {
  if (!fs.existsSync(rootDir)) return [];

  const results: IntakeSource[] = [];

  async function walk(currentDir: string) {
    let entries;
    try {
      entries = await fsp.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      warnings.push(`Could not read directory: ${currentDir} (${error instanceof Error ? error.message : String(error)})`);
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (shouldIgnoreIntakeFile(entry.name)) continue;

      const extension = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(extension)) continue;

      try {
        const text = await fsp.readFile(fullPath, "utf8");
        const normalizedText = normalizeText(text);
        if (!normalizedText) continue;
        results.push({
          sourceType,
          path: fullPath,
          relativePath: toDisplayPath(fullPath, repoRoot),
          text: normalizedText.slice(0, MAX_EXCERPT_LENGTH),
          summary: summarizeSource(fullPath, normalizedText),
          reference,
        });
      } catch (error) {
        warnings.push(`Could not read file: ${fullPath} (${error instanceof Error ? error.message : String(error)})`);
      }
    }
  }

  await walk(rootDir);
  results.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return results;
}

async function collectReferenceNotes(referenceRoot: string, repoRoot: string, warnings: string[]): Promise<ExternalReferenceNote[]> {
  if (!fs.existsSync(referenceRoot)) return [];
  const entries = await fsp.readdir(referenceRoot, { withFileTypes: true });
  const notes: ExternalReferenceNote[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    if (shouldIgnoreIntakeFile(entry.name)) continue;
    const fullPath = path.join(referenceRoot, entry.name);
    try {
      const content = await fsp.readFile(fullPath, "utf8");
      const note = parseReferenceNote(content, toDisplayPath(fullPath, repoRoot));
      if (!note.valid) {
        warnings.push(`Skipped malformed reference note: ${note.notePath}. Add a valid \`Path:\` field to use it.`);
        notes.push(note);
        continue;
      }
      if (!fs.existsSync(note.path!)) {
        warnings.push(`Referenced folder does not exist: ${note.path} (from ${note.notePath})`);
      }
      notes.push(note);
    } catch (error) {
      warnings.push(`Could not read reference note: ${fullPath} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  notes.sort((left, right) => left.notePath.localeCompare(right.notePath));
  return notes;
}

export function parseReferenceNote(content: string, notePath: string): ExternalReferenceNote {
  const readField = (field: string) => {
    const match = content.match(new RegExp(`^-\\s*${escapeRegex(field)}:\\s*(.+)$`, "im"))?.[1]?.trim() ?? null;
    if (!match) return null;
    return stripTicks(match);
  };

  const resolvedPath = readField("Path");
  return {
    notePath,
    path: resolvedPath ? path.resolve(resolvedPath) : null,
    owner: readField("Owner"),
    contents: readField("Contents"),
    usageNotes: readField("Usage Notes"),
    constraints: readField("Constraints"),
    valid: Boolean(resolvedPath),
  };
}

export function buildBootstrapEvidenceBlock(
  report: IntakeReport,
  templatePath?: string,
  maxSources = 8,
): string {
  const allSources = [...report.localSources, ...report.externalSources];
  const selectedSources = templatePath ? rankRelevantSources(allSources, templatePath).slice(0, maxSources) : allSources.slice(0, maxSources);

  const lines = [
    "## Intake Evidence",
    "",
    `- **Company Name:** ${report.companyName}`,
    `- **Local Intake Files:** ${report.localSources.length}`,
    `- **External Reference Files:** ${report.externalSources.length}`,
  ];

  if (report.warnings.length > 0) {
    lines.push(`- **Intake Warnings:** ${report.warnings.length}`);
  }

  lines.push("", "### Consolidated Intake Summary", "");

  if (allSources.length === 0) {
    lines.push("No usable intake sources were found.");
  } else {
    for (const source of allSources.slice(0, 12)) {
      lines.push(`- ${source.summary}`);
    }
  }

  if (selectedSources.length > 0) {
    lines.push("", "### Relevant Source Excerpts", "");
    for (const source of selectedSources) {
      lines.push(`#### ${source.relativePath}`);
      lines.push(`- Source Type: ${source.sourceType}`);
      if (source.reference?.owner) lines.push(`- Reference Owner: ${source.reference.owner}`);
      if (source.reference?.constraints) lines.push(`- Constraints: ${source.reference.constraints}`);
      lines.push(`- Summary: ${source.summary}`);
      lines.push("");
      lines.push(source.text);
      lines.push("");
    }
  }

  if (report.warnings.length > 0) {
    lines.push("### Intake Warnings", "");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

function rankRelevantSources(sources: IntakeSource[], templatePath: string): IntakeSource[] {
  const templateTokens = new Set(tokenize(templatePath));
  return [...sources].sort((left, right) => scoreSource(right, templateTokens) - scoreSource(left, templateTokens));
}

function scoreSource(source: IntakeSource, templateTokens: Set<string>): number {
  const sourceTokens = tokenize(`${source.relativePath} ${source.summary} ${source.text.slice(0, 300)}`);
  let score = 0;
  for (const token of sourceTokens) {
    if (templateTokens.has(token)) score += 1;
  }
  return score;
}

function tokenize(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9@]+/g) ?? [];
}

function summarizeSource(filePath: string, text: string): string {
  const firstLine = normalizeText(text.split("\n").find((line) => line.trim()) ?? "");
  const base = `${path.basename(filePath)}: ${firstLine || "Supporting company material."}`;
  return base.slice(0, MAX_SUMMARY_LENGTH);
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

function toDisplayPath(fullPath: string, repoRoot: string): string {
  const relative = path.relative(repoRoot, fullPath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.replaceAll(path.sep, "/");
  }
  return fullPath;
}

function stripTicks(value: string): string {
  return value.replace(/^`|`$/g, "").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldIgnoreIntakeFile(fileName: string): boolean {
  if (fileName === ".gitkeep") return true;
  return /^README(?:[_-].*)?\.md$/i.test(fileName);
}
