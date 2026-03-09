# mcp-local-filesystem

Minimal local MCP server that gives Claude Web direct write access to the local filesystem.

## Install

```bash
npm install
npm run build
```

## Configuration

Edit `config.json` to specify which directories the server can access:

```json
{
  "allowedDirectories": [
    "/Users/yourname/Projects",
    "/Users/yourname/Development"
  ]
}
```

- Paths outside `allowedDirectories` are rejected
- Empty array = no access (fail-safe)
- Missing `config.json` = server refuses to start

## Tools

| Tool | Description |
|------|-------------|
| `write_file` | Write content to a file (auto-creates directories) |
| `read_file` | Read file content |
| `list_directory` | List directory entries with metadata |
| `check_allowed` | Check if a path is within allowed directories |

## Claude Desktop Integration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "local-filesystem": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-local-filesystem/dist/index.js"],
      "env": {}
    }
  }
}
```

Replace `/absolute/path/to` with the actual path to this project.

## Development

```bash
npm run dev          # Watch mode
npm test             # Run tests
npm run inspector    # MCP Inspector for manual testing
```

## Troubleshooting

**Server won't start:** Check that `config.json` exists and contains valid JSON with an `allowedDirectories` array.

**"Access denied" errors:** The path you're trying to access is outside the directories listed in `config.json`. Add the directory or check for typos.

**Tools not showing in Claude:** Verify the path in `claude_desktop_config.json` points to `dist/index.js` (not `src/index.ts`). Run `npm run build` first.

**Changes to config.json not taking effect:** Restart the server — config is only loaded at startup.
