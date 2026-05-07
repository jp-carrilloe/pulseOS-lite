import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EventEmitter } from "node:events";

import {
  ACME_SAMPLE_MEMORY_DIR,
  getBootstrapChatHandoffCommand,
  handoffBootstrapToChat,
  hasAcmeSampleCompanyMemory,
} from "./bootstrap.js";

test("hasAcmeSampleCompanyMemory detects the public sample folder when present", async () => {
  const repoRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "pulseos-lite-bootstrap-sample-"));
  const sampleDir = path.join(repoRoot, ACME_SAMPLE_MEMORY_DIR);

  await fsp.mkdir(sampleDir, { recursive: true });
  await fsp.writeFile(path.join(sampleDir, "sample.md"), "# Acme Sample\n");

  assert.equal(hasAcmeSampleCompanyMemory(repoRoot), true);
});

test("sample company memory can remain in the repo without bootstrap deleting it", async () => {
  const repoRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "pulseos-lite-bootstrap-sample-"));
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

test("bootstrap handoff command targets the chat entrypoint", () => {
  const handoff = getBootstrapChatHandoffCommand();
  assert.equal(handoff.command, process.execPath);
  assert.match(handoff.cwd, /\/cli$/);
  assert.deepEqual(handoff.args.slice(0, 3), ["--import", "tsx/esm", handoff.args[2]]);
  assert.equal(handoff.args[3], "chat");
  assert.match(handoff.args[2] ?? "", /cli\/index\.ts$/);
});

test("bootstrap can hand off into chat when intake is missing", async () => {
  let called = false;
  let receivedCommand = "";
  let receivedArgs: readonly string[] = [];
  let receivedOptions: { cwd: string; env: NodeJS.ProcessEnv; stdio: "inherit" } | null = null;

  const exitCode = await handoffBootstrapToChat({ PULSEOS_OPENAI_AUTH_MODE: "auto" }, (command, args, options) => {
    called = true;
    receivedCommand = command;
    receivedArgs = args;
    receivedOptions = options;

    const child = new EventEmitter() as any;
    process.nextTick(() => child.emit("exit", 0));
    return child;
  });

  assert.equal(called, true);
  assert.equal(exitCode, 0);
  assert.equal(receivedCommand, process.execPath);
  assert.equal(receivedArgs[0], "--import");
  assert.equal(receivedArgs[1], "tsx/esm");
  assert.equal(receivedArgs[3], "chat");
  assert.match(receivedOptions?.cwd ?? "", /\/cli$/);
  assert.equal(receivedOptions?.stdio, "inherit");
  assert.equal(receivedOptions?.env.PULSEOS_OPENAI_AUTH_MODE, "auto");
});
