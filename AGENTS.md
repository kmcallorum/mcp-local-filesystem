# Repository Guidelines — mcp-local-filesystem

## Project Purpose
A minimal local MCP (Model Context Protocol) server that gives Claude Web direct 
write access to the local filesystem. The goal is to eliminate the manual 
download-move step in the AI workflow pipeline described in "Behind the Steel Door."

Current workflow (manual):
  Claude Web generates file → download → move to project dir → Jr. reads

Target workflow (automated):
  Claude Web generates file → MCP server writes directly → Jr. reads

Single purpose. Minimal footprint. Maximum reliability.
Must run comfortably alongside K3s gateway, Digital Ocean bridge, 
Claude Web browser session, and Jr. terminal on a Mac Mini.

## Project Structure
- src/index.ts             — main MCP server entry point (McpServer + stdio transport)
- src/config.ts            — allowed directories loader, path normalization, validation
- src/tools/               — individual tool implementations
  - write-file.ts          — write content to local path (auto-mkdir)
  - read-file.ts           — read file content
  - list-directory.ts      — list directory contents with metadata
  - check-allowed.ts       — verify path is within allowed directories (never throws)
- config.json              — allowed directories configuration
- dist/                    — compiled TypeScript output
- tests/                   — test suite
  - config.test.ts         — 22 unit tests for config/path validation
  - tools.test.ts          — 16 integration tests for all tools
- jest.config.js           — Jest config with Node16 .js extension mapping
- package.json             — project config and scripts
- tsconfig.json            — TypeScript strict mode, Node16 modules
- README.md                — install, config, Claude Desktop integration, troubleshooting
- Convo.md                 — full build conversation log
- AGENTS.md                — this file

## Build, Test, and Development Commands
- npm install          — install dependencies
- npm run build        — compile TypeScript to dist/
- npm run dev          — watch mode for development
- npm test             — run full test suite
- npm run inspector    — launch MCP Inspector for manual testing
  (runs: npx @modelcontextprotocol/inspector node dist/index.js)

## Constraints

### Resource Footprint
- Target memory: under 30MB RAM at idle
- Target CPU: negligible when not handling requests
- No background polling, no file watchers, no scheduled tasks
- Startup time under 500ms

### Security — NON-NEGOTIABLE
- ALL file operations must validate path against allowedDirectories BEFORE executing
- Normalize all paths before comparison (resolve ../, symlinks, etc.)
- Reject any path outside allowedDirectories with a clear error
- Never expose filesystem paths outside allowedDirectories in error messages
- No shell execution. No eval. No dynamic requires.

### Transport
- stdio ONLY — local process, no HTTP server, no open ports
- No network exposure of any kind

### Dependencies
- @modelcontextprotocol/sdk — MCP protocol implementation
- No other runtime dependencies
- devDependencies for TypeScript compilation and testing only

## Coding Style & Naming Conventions
- TypeScript strict mode enabled
- 2-space indentation
- kebab-case for filenames
- PascalCase for classes and interfaces
- camelCase for functions and variables
- Async/await for all I/O operations
- Explicit return types on all exported functions
- JSDoc comments on all exported functions and tool definitions

## Tools to Implement

### write_file
- Parameters: path (string), content (string)
- Validates path against allowedDirectories
- Auto-creates parent directories if they do not exist
- Overwrites existing files without warning (by design — Claude Web is authoritative)
- Returns: { success: true, path: string, bytesWritten: number }
- Error: { success: false, error: string } — never expose full system paths in errors

### read_file  
- Parameters: path (string)
- Validates path against allowedDirectories
- Returns file content as string
- Returns: { success: true, content: string, path: string }
- Error: { success: false, error: string }

### list_directory
- Parameters: path (string)
- Validates path against allowedDirectories
- Returns entries with name, type (file/directory), size, modified date
- Returns: { success: true, path: string, entries: Entry[] }
- Error: { success: false, error: string }

### check_allowed
- Parameters: path (string)
- Does NOT require path to exist — just checks if it would be allowed
- Returns: { allowed: boolean, normalizedPath: string }
- Never errors — always returns a result

### read_binary
- Parameters: path (string)
- Validates path against allowedDirectories
- Reads file as raw bytes, returns content base64-encoded
- For binary files: pdf, docx, pptx, xlsx, png, jpg, zip, compiled/encoded formats
- Returns: { success: true, content: string (base64), path: string, bytesRead: number }
- Error: { success: false, error: string }

### write_binary
- Parameters: path (string), content (base64-encoded string)
- Validates path against allowedDirectories
- Decodes base64 input and writes raw bytes
- Auto-creates parent directories
- For binary files: pdf, docx, pptx, xlsx, png, jpg, zip, compiled/encoded formats
- Returns: { success: true, path: string, bytesWritten: number }
- Error: { success: false, error: string }

## Configuration

config.json format:
{
  "allowedDirectories": [
    "/Users/kmcallorum/Projects"
  ]
}

Current config.json points to: /Users/kmcallorum/Projects

- Loaded at startup, not watched for changes (restart to reload)
- Relative paths in config are resolved from config.json location
- Empty allowedDirectories array means NO paths are allowed (fail safe)
- Missing config.json = server refuses to start with clear error message

## Testing Guidelines
- Unit tests for path validation logic (the most critical component)
- Integration test for each tool with valid and invalid paths
- Test auto-directory creation on write_file
- Test that paths outside allowedDirectories are rejected at every tool
- Test config loading with missing file, empty array, invalid JSON
- All tests must pass before considering any phase complete
- Use npm test — do not skip tests

## Claude Desktop Integration

Add to ~/Library/Application\ Support/Claude/claude_desktop_config.json:

{
  "mcpServers": {
    "local-filesystem": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-local-filesystem/dist/index.js"],
      "env": {}
    }
  }
}

README must include exact instructions for this integration step.

## Commit Guidelines
- Conventional commits: feat:, fix:, chore:, test:, docs:
- Present tense, under 72 characters
- One logical change per commit
- Tests must pass before committing

## Definition of Done
Each phase is complete when:
1. Code compiles without TypeScript errors
2. All tests pass (npm test)
3. MCP Inspector confirms tool availability and correct behavior
4. AGENTS.md phase log updated to reflect completion

## Phase Log (updated by Jr. as work progresses)

- [x] Phase 1: Project scaffold
      Setup TypeScript project, package.json, tsconfig.json, directory structure.
      Install @modelcontextprotocol/sdk. Verify npm run build produces clean output.
      Status: Complete

- [x] Phase 2: Config loading and path validation
      Implement config.ts — load allowedDirectories from config.json.
      Implement path normalization and validation logic.
      Unit tests for all validation edge cases.
      Status: Complete — 22 unit tests passing

- [x] Phase 3: Tool implementations
      Implement write_file, read_file, list_directory, check_allowed.
      Each tool calls path validation before any filesystem operation.
      Integration tests for each tool.
      Status: Complete — 16 integration tests passing

- [x] Phase 4: MCP server wiring
      Wire all tools into the MCP server in index.ts.
      Verify with MCP Inspector — all four tools visible and functional.
      Test write_file from a simulated Claude Web call.
      Status: Complete — all tools wired via McpServer with zod schemas

- [x] Phase 5: README and integration guide
      Complete README with installation, configuration, and Claude Desktop
      integration instructions. Include example config.json.
      Include troubleshooting section for common issues.
      Status: Complete

- [x] Phase 6: Binary file support (v1.1.0)
      Add read_binary and write_binary tools for byte-exact preservation
      of pdf/docx/pptx/png/zip/etc. via base64 encoding.
      Existing read_file/write_file unchanged for backward compatibility.
      Tests: round-trip all 256 byte values, preserve zip magic bytes,
      reject out-of-scope paths, auto-mkdir on write.
      Status: Complete — built by Jr. on 2026-04-24 from Chief's brief.

## Current State (2026-04-24 — v1.1.0)
- 6 tools complete: read_file, write_file, list_directory, check_allowed, read_binary, write_binary
- 44 tests passing (22 config + 16 tools + 6 binary round-trip)
- Clean TypeScript compile, zero errors
- Wired into Claude Desktop config
- Binary path preserves bytes losslessly via base64 encoding

## Remaining Steps
- [ ] Wire into Claude Desktop claude_desktop_config.json
- [ ] Initialize git repo and make initial commit
- [ ] Verify end-to-end: Claude Web writes file via MCP → Jr. reads it
- [ ] Update "Behind the Steel Door" Chapter 3 with working solution

## Notes
- This project is documented in "Behind the Steel Door: A Workflow for AI"
  Chapter 3 Addendum A. The AGENTS.md itself is the live example of the
  methodology — designed in Claude Web, handed to Jr. to build.
- Built in a single session by Claude Code (Jr.) from the AGENTS.md spec.
- Key implementation detail: jest.config.js requires moduleNameMapper to
  strip .js extensions for ts-jest compatibility with Node16 module resolution.
- Target platform: Mac Mini (Apple Silicon), macOS, Node.js 18+
