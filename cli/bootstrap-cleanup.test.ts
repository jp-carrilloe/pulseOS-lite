import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ACME_SAMPLE_MEMORY_DIR, hasAcmeSampleCompanyMemory } from "./bootstrap.js";

test("hasAcmeSampleCompanyMemory detects the public sample folder when present", async () => {
  const repoRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "company-ops-bootstrap-sample-"));
  const sampleDir = path.join(repoRoot, ACME_SAMPLE_MEMORY_DIR);

  await fsp.mkdir(sampleDir, { recursive: true });
  await fsp.writeFile(path.join(sampleDir, "sample.md"), "# Acme Sample\n");

  assert.equal(hasAcmeSampleCompanyMemory(repoRoot), true);
});

test("sample company memory can remain in the repo without bootstrap deleting it", async () => {
  const repoRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "company-ops-bootstrap-sample-"));
  const sampleDir = path.join(repoRoot, ACME_SAMPLE_MEMORY_DIR);
  const companyMemoryDir = path.join(repoRoot, "000_Company_Memory");

  await fsp.mkdir(sampleDir, { recursive: true });
  await fsp.mkdir(companyMemoryDir, { recursive: true });
  await fsp.writeFile(path.join(sampleDir, "sample.md"), "# Acme Sample\n");
  await fsp.writeFile(path.join(companyMemoryDir, "real.md"), "# Real Company Memory\n");

  assert.equal(hasAcmeSampleCompanyMemory(repoRoot), true);
  assert.equal(fs.existsSync(path.join(sampleDir, "sample.md")), true);
  assert.equal(fs.existsSync(path.join(companyMemoryDir, "real.md")), true);
});
