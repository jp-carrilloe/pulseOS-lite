import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildBootstrapEvidenceBlock,
  collectBootstrapIntake,
  parseReferenceNote,
} from "./bootstrap-intake.js";

async function createTempRepo() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "company-ops-bootstrap-"));
  await fsp.mkdir(path.join(root, "001_Data_Souces", "Data_Souces_Folder"), { recursive: true });
  await fsp.mkdir(path.join(root, "001_Data_Souces", "Data_Sources_References"), { recursive: true });
  await fsp.mkdir(path.join(root, "001_Source_Intake", "Data_Souces_Folder"), { recursive: true });
  await fsp.mkdir(path.join(root, "001_Source_Intake", "Data_Sources_References"), { recursive: true });
  await fsp.mkdir(path.join(root, "external-kb"), { recursive: true });
  return root;
}

test("collectBootstrapIntake reads local intake files from the active intake folder", async () => {
  const repoRoot = await createTempRepo();
  await fsp.writeFile(
    path.join(repoRoot, "001_Data_Souces", "Data_Souces_Folder", "founder-notes.md"),
    "# Founder Notes\n\nWe sell AI operating systems for B2B companies.",
  );

  const report = await collectBootstrapIntake(repoRoot, "PulseOS");
  assert.equal(report.localSources.length, 1);
  assert.equal(report.externalSources.length, 0);
  assert.match(report.localSources[0]!.summary, /founder-notes\.md/i);
});

test("collectBootstrapIntake falls back to legacy source intake when active intake is empty", async () => {
  const repoRoot = await createTempRepo();
  await fsp.writeFile(
    path.join(repoRoot, "001_Source_Intake", "Data_Souces_Folder", "legacy-notes.md"),
    "# Legacy Notes\n\nWe sell AI operating systems for B2B companies.",
  );

  const report = await collectBootstrapIntake(repoRoot, "PulseOS");
  assert.equal(report.localSources.length, 1);
  assert.match(report.localSources[0]!.relativePath, /001_Source_Intake/);
});

test("collectBootstrapIntake ignores helper README files in intake folders", async () => {
  const repoRoot = await createTempRepo();
  await fsp.mkdir(path.join(repoRoot, "001_Source_Intake", "Data_Souces_Folder", "Example_Helper_Folder"), {
    recursive: true,
  });
  await fsp.writeFile(
    path.join(
      repoRoot,
      "001_Source_Intake",
      "Data_Souces_Folder",
      "Example_Helper_Folder",
      "README_Example_Helper_Folder.md",
    ),
    "# Example Helper Folder\n\nThis is only a helper README and should not count as intake material.",
  );
  await fsp.writeFile(
    path.join(repoRoot, "001_Source_Intake", "Data_Sources_References", "README_Data_Sources_References.md"),
    "# Data Sources References\n\nCreate one Markdown file per external folder reference.",
  );

  const report = await collectBootstrapIntake(repoRoot, "PulseOS");
  assert.equal(report.localSources.length, 0);
  assert.equal(report.externalSources.length, 0);
  assert.equal(report.parsedReferences.length, 0);
});

test("collectBootstrapIntake parses reference notes and ingests external folders", async () => {
  const repoRoot = await createTempRepo();
  await fsp.writeFile(
    path.join(repoRoot, "external-kb", "sales.txt"),
    "Primary customer is founders of B2B SaaS teams with complex go-to-market motion.",
  );
  await fsp.writeFile(
    path.join(repoRoot, "001_Data_Souces", "Data_Sources_References", "kb-reference.md"),
    `# External KB

- Path: \`${path.join(repoRoot, "external-kb")}\`
- Owner: \`Founders\`
- Contents: Sales and GTM notes
- Usage Notes: Use these files to infer company positioning
- Constraints: Internal only
`,
  );

  const report = await collectBootstrapIntake(repoRoot, "PulseOS");
  assert.equal(report.parsedReferences.length, 1);
  assert.equal(report.externalSources.length, 1);
  assert.equal(report.externalSources[0]!.reference?.owner, "Founders");
});

test("collectBootstrapIntake warns on malformed or missing references without crashing", async () => {
  const repoRoot = await createTempRepo();
  await fsp.writeFile(
    path.join(repoRoot, "001_Data_Souces", "Data_Sources_References", "bad-reference.md"),
    "# Broken Ref\n\n- Owner: `Ops`\n",
  );
  await fsp.writeFile(
    path.join(repoRoot, "001_Data_Souces", "Data_Sources_References", "missing-reference.md"),
    "# Missing Ref\n\n- Path: `/tmp/does-not-exist-bootstrap-ref`\n",
  );

  const report = await collectBootstrapIntake(repoRoot, "PulseOS");
  assert.equal(report.parsedReferences.length, 2);
  assert.equal(report.externalSources.length, 0);
  assert.ok(report.warnings.some((warning) => warning.includes("Skipped malformed reference note")));
  assert.ok(report.warnings.some((warning) => warning.includes("Referenced folder does not exist")));
});

test("buildBootstrapEvidenceBlock includes company name, warnings, and relevant excerpts", async () => {
  const repoRoot = await createTempRepo();
  await fsp.writeFile(
    path.join(repoRoot, "001_Data_Souces", "Data_Souces_Folder", "pricing.md"),
    "# Pricing\n\nOur pricing uses annual retainers and premium strategy consulting.",
  );
  const report = await collectBootstrapIntake(repoRoot, "PulseOS");
  const block = buildBootstrapEvidenceBlock(report, "000_Company_Memory/102_Corporate_Strategy_and_Foundation/102.5_Pricing_Analysis.md");

  assert.match(block, /Company Name:\*\* PulseOS/);
  assert.match(block, /Relevant Source Excerpts/);
  assert.match(block, /pricing uses annual retainers/i);
});

test("parseReferenceNote reads the documented markdown fields", () => {
  const note = parseReferenceNote(
    `# Example

- Path: \`/tmp/example-folder\`
- Owner: \`Ops\`
- Contents: Working docs
- Usage Notes: Read everything
- Constraints: Ignore secrets
`,
    "001_Source_Intake/Data_Sources_References/example.md",
  );

  assert.equal(note.valid, true);
  assert.equal(note.owner, "Ops");
  assert.equal(note.contents, "Working docs");
  assert.equal(note.usageNotes, "Read everything");
  assert.equal(note.constraints, "Ignore secrets");
});
