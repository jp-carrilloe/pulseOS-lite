import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

test("mcp server initialize handshake does not write warnings to stderr", async () => {
  const child = spawn("node", ["--import", "tsx/esm", "mcp-server.ts"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  const stderrChunks: Buffer[] = [];
  let stdout = "";

  child.stderr.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });

  const responsePromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for initialize response from mcp-server.ts"));
    }, 5_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      const separatorIndex = stdout.indexOf("\r\n\r\n");
      if (separatorIndex === -1) return;
      const header = stdout.slice(0, separatorIndex);
      const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!contentLengthMatch) return;
      const contentLength = Number(contentLengthMatch[1]);
      const messageStart = separatorIndex + 4;
      if (stdout.length < messageStart + contentLength) return;
      clearTimeout(timeout);
      resolve(stdout.slice(0, messageStart + contentLength));
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  const initializeMessage = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "pulseos-lite-test",
        version: "0.0.0",
      },
    },
  });

  child.stdin.write(`Content-Length: ${Buffer.byteLength(initializeMessage)}\r\n\r\n${initializeMessage}`);

  try {
    const response = await responsePromise;
    assert.match(response, /"protocolVersion":"2024-11-05"/);
    assert.equal(Buffer.concat(stderrChunks).toString("utf8"), "");
  } finally {
    child.kill("SIGTERM");
  }
});
