import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ACME_SAMPLE_MEMORY_DIR, cleanupAcmeSampleCompanyMemory } from "./bootstrap.js";

test("cleanupAcmeSampleCompanyMemory removes only the disposable Acme sample folder", async () => {
  const repoRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "company-ops-bootstrap-cleanup-"));
  const sampleDir = path.join(repoRoot, ACME_SAMPLE_MEMORY_DIR);
  const companyMemoryDir = path.join(repoRoot, "000_Company_Memory");

  await fsp.mkdir(sampleDir, { recursive: true });
  await fsp.mkdir(companyMemoryDir, { recursive: true });
  await fsp.writeFile(path.join(sampleDir, "sample.md"), "# Acme Sample\n");
  await fsp.writeFile(path.join(companyMemoryDir, "real.md"), "# Real Company Memory\n");

  const removed = await cleanupAcmeSampleCompanyMemory(repoRoot);

  assert.equal(removed, true);
  assert.equal(fs.existsSync(sampleDir), false);
  assert.equal(fs.existsSync(path.join(companyMemoryDir, "real.md")), true);
});
