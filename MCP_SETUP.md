# 🔌 How to Call the PulseOS Lite MCP Server

PulseOS Lite provides an MCP (Model Context Protocol) server—named **pulseos-lite-mcp**—that allows external AI assistants like Claude Desktop, Cursor (Codex), Claude Code, Gemini agent workflows, and others to interact with your local PulseOS knowledge base and repository status.

By connecting this MCP server, your AI assistants can:
- Read the repository status and index health
- Retrieve semantic context from the company brain
- Get rebuild advice or trigger index rebuilds manually

---

## 1. Setup for Claude Code (Terminal)

For Claude Code running in your terminal, configure it to launch the local MCP server from this repo with:

```bash
cd cli
node --import tsx/esm mcp-server.ts
```

Do not use `npm run mcp` as the MCP command in clients that rely on `stdio`. `npm` prints extra banner lines before the protocol stream, which can break MCP handshakes.

If your MCP client reliably honors `cwd`, you can point it at the repo-local CLI process directly:

```json
{
  "mcpServers": {
    "pulseos-lite-mcp": {
      "command": "node",
      "args": ["--import", "tsx/esm", "mcp-server.ts"],
      "cwd": "/absolute/path/to/PulseOS Lite Open Source/cli"
    }
  }
}
```

If your MCP client ignores `cwd`, launches from `/`, or shows `Cannot find package 'tsx' imported from /`, use the repo wrapper script instead. It resolves the local `tsx` loader by absolute path before starting the server:

```json
{
  "mcpServers": {
    "pulseos-lite-mcp": {
      "command": "/bin/zsh",
      "args": ["/absolute/path/to/PulseOS Lite Open Source/.codex/pulseos-lite-mcp-launch.sh"]
    }
  }
}
```

---

## 2. Setup in Claude Desktop

To connect the Claude Desktop app to the PulseOS Lite MCP server:

1. Open your Claude Desktop configuration file.
   - **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
2. Add an `mcpServers` section (or update your existing one) that starts the repo-local MCP server from `cli/`.

**Example `claude_desktop_config.json`:**
```json
{
  "mcpServers": {
    "pulseos-lite-mcp": {
      "command": "/bin/zsh",
      "args": ["/absolute/path/to/PulseOS Lite Open Source/.codex/pulseos-lite-mcp-launch.sh"]
    }
  }
}
```
3. Restart Claude Desktop completely. You should now see the `pulseos-lite-mcp` tools available in your chat attachment (hammer) menu.

---

## 3. Setup in Cursor (Codex) / Cline

If you are using Cursor, Cline, or another VS Code-based MCP client to interact with this repository:

**For Cursor / Cline / Roo / VS Code-based MCP clients:**
1. Open your MCP Settings in Cursor.
   - Go to **Cursor Settings** > **Features** > **MCP Servers**
   - Click **+ Add new MCP server**
2. Configure the server:
   - **Name**: `pulseos-lite-mcp`
   - **Type**: `command`
   - **Command**: `/bin/zsh`
   - **Args**: `/absolute/path/to/PulseOS Lite Open Source/.codex/pulseos-lite-mcp-launch.sh`
   - **Working directory**: leave blank unless your MCP client requires one
3. Click **Save** and verify the connection is green (active).
4. The MCP tools (e.g., `retrieve_context`, `repo_status`) will now be available when using the agent or Cursor Composer.

---

## 4. Setup in Gemini / Generic Agent Workflows

If you are building custom Agent workflows (e.g., LangChain, Make.com, or custom Python scripts using the Gemini API) and want them to query the PulseOS brain:

1. You must use an MCP-compatible client SDK.
2. Configure the client to spawn the MCP server as a subprocess using `stdio` transport.

**Example in Node.js:**
```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "/bin/zsh",
  args: ["/absolute/path/to/PulseOS Lite Open Source/.codex/pulseos-lite-mcp-launch.sh"]
});

const client = new Client({ name: "gemini-workflow-client", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);

const response = await client.callTool({
  name: "retrieve_context",
  arguments: { query: "What is our GTM strategy?" }
});
```

---

## Troubleshooting
- **No Tools Showing Up**: Ensure CLI dependencies are installed (`cd cli && npm install`).
- **`Cannot find package 'tsx' imported from /`**: Your MCP client started the server from the wrong directory or ignored `cwd`. Switch that client to the wrapper script shown above.
- **Paths**: If you move the repo, update the MCP client config so the wrapper script or `cwd` still points to this repo.
- **Graph Relationships Missing or New Docs Not Showing**: The MCP retrieval layer depends on the same SQLite index as the graph UI. If document links seem missing, or if newly added Markdown files in `000_Company_Memory` do not appear, run `cd cli && npm run index`, use `/reload` inside chat, or click `Rebuild index` / `Rebuild graph/index` in the graph UI. A browser refresh only reloads the last indexed SQLite snapshot.
