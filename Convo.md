# mcp-local-filesystem — Full Build Conversation (2026-03-09)

---

## Kevin: `.`

### Claude:
What do you need?

---

## Kevin: `read AGENTS.md`

### Claude:
Found `AGENTS.md` at `/Users/kmcallorum/Projects/mcp-local-filesystem/AGENTS.md` and read the full file.

**Summary of AGENTS.md:**

A local MCP server spec for giving Claude Web direct filesystem write access — eliminating the download-move step.

- **Status:** All 5 phases Not Started
- **The 4 tools:** `write_file`, `read_file`, `list_directory`, `check_allowed` — all gated behind path validation against `allowedDirectories` in `config.json`
- **Key constraints:** stdio-only transport, under 30MB RAM, no network exposure, path validation is non-negotiable security

Current workflow (manual):
```
Claude Web generates file → download → move to project dir → Jr. reads
```

Target workflow (automated):
```
Claude Web generates file → MCP server writes directly → Jr. reads
```

**5 Phases defined:**
1. Project scaffold
2. Config loading and path validation
3. Tool implementations
4. MCP server wiring
5. README and integration guide

Asked: "Want to start building Phase 1?"

---

## Kevin: `Build it`

### Claude:
Checked existing project directory — clean slate, only `AGENTS.md` exists.

Built all 5 phases in one pass. Here's everything that was created:

---

### Phase 1: Project Scaffold

#### `package.json`
```json
{
  "name": "mcp-local-filesystem",
  "version": "1.0.0",
  "description": "Minimal local MCP server for direct filesystem access from Claude Web",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "node --experimental-vm-modules node_modules/.bin/jest",
    "inspector": "npx @modelcontextprotocol/inspector node dist/index.js"
  },
  "keywords": ["mcp", "filesystem", "claude"],
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1"
  },
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/node": "^22.15.3",
    "jest": "^29.7.0",
    "ts-jest": "^29.3.4",
    "typescript": "^5.8.3"
  }
}
```

#### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

#### `jest.config.js`
```js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^(\\.\\.?/.*)\\.js$': '$1',
  },
};
```

> Note: `moduleNameMapper` was added after the first test run failed — Jest couldn't resolve `.js` extension imports required by Node16 module resolution. The mapper strips `.js` so ts-jest can find the `.ts` source files.

#### `config.json`
```json
{
  "allowedDirectories": [
    "/Users/kmcallorum/Projects"
  ]
}
```

---

### Phase 2: Config Loading and Path Validation

#### `src/config.ts`
```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Config {
  allowedDirectories: string[];
}

/**
 * Loads and validates the configuration from config.json.
 * Resolves relative paths from the config.json location.
 * Throws if config.json is missing, invalid, or has no allowedDirectories key.
 */
export function loadConfig(configPath?: string): Config {
  const resolvedPath = configPath ?? path.resolve(__dirname, '..', 'config.json');

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Configuration file not found: config.json. Server cannot start without it.`);
  }

  let raw: string;
  try {
    raw = fs.readFileSync(resolvedPath, 'utf-8');
  } catch {
    throw new Error(`Failed to read configuration file.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Configuration file contains invalid JSON.`);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('allowedDirectories' in parsed)
  ) {
    throw new Error(`Configuration file must contain an "allowedDirectories" array.`);
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.allowedDirectories)) {
    throw new Error(`"allowedDirectories" must be an array.`);
  }

  const configDir = path.dirname(resolvedPath);
  const allowedDirectories: string[] = obj.allowedDirectories.map((dir: unknown) => {
    if (typeof dir !== 'string') {
      throw new Error(`Each entry in "allowedDirectories" must be a string.`);
    }
    return path.resolve(configDir, dir);
  });

  return { allowedDirectories };
}

/**
 * Normalizes a path by resolving it to an absolute path.
 * Does NOT check existence — just normalizes for comparison.
 */
export function normalizePath(inputPath: string): string {
  return path.resolve(inputPath);
}

/**
 * Checks whether a normalized path falls within one of the allowed directories.
 * Uses string prefix comparison after normalization.
 */
export function isPathAllowed(inputPath: string, allowedDirectories: string[]): boolean {
  const normalized = normalizePath(inputPath);

  if (allowedDirectories.length === 0) {
    return false;
  }

  return allowedDirectories.some((dir) => {
    const normalizedDir = normalizePath(dir);
    return normalized === normalizedDir || normalized.startsWith(normalizedDir + path.sep);
  });
}

/**
 * Validates a path against allowed directories.
 * Returns the normalized path if allowed, throws if not.
 */
export function validatePath(inputPath: string, allowedDirectories: string[]): string {
  const normalized = normalizePath(inputPath);

  if (!isPathAllowed(normalized, allowedDirectories)) {
    throw new Error(`Access denied: path is outside allowed directories.`);
  }

  return normalized;
}
```

---

### Phase 3: Tool Implementations

#### `src/tools/write-file.ts`
```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { validatePath } from '../config.js';

export interface WriteFileResult {
  success: boolean;
  path?: string;
  bytesWritten?: number;
  error?: string;
}

/**
 * Writes content to a file at the specified path.
 * Auto-creates parent directories if they do not exist.
 * Overwrites existing files without warning.
 */
export async function writeFile(
  filePath: string,
  content: string,
  allowedDirectories: string[]
): Promise<WriteFileResult> {
  try {
    const normalized = validatePath(filePath, allowedDirectories);
    const dir = path.dirname(normalized);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(normalized, content, 'utf-8');

    const stats = await fs.stat(normalized);
    return {
      success: true,
      path: normalized,
      bytesWritten: stats.size,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during write.',
    };
  }
}
```

#### `src/tools/read-file.ts`
```typescript
import * as fs from 'node:fs/promises';
import { validatePath } from '../config.js';

export interface ReadFileResult {
  success: boolean;
  content?: string;
  path?: string;
  error?: string;
}

/**
 * Reads the content of a file at the specified path.
 */
export async function readFile(
  filePath: string,
  allowedDirectories: string[]
): Promise<ReadFileResult> {
  try {
    const normalized = validatePath(filePath, allowedDirectories);
    const content = await fs.readFile(normalized, 'utf-8');

    return {
      success: true,
      content,
      path: normalized,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during read.',
    };
  }
}
```

#### `src/tools/list-directory.ts`
```typescript
import * as fs from 'node:fs/promises';
import { validatePath } from '../config.js';

export interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
}

export interface ListDirectoryResult {
  success: boolean;
  path?: string;
  entries?: DirectoryEntry[];
  error?: string;
}

/**
 * Lists the contents of a directory at the specified path.
 * Returns entries with name, type, size, and modified date.
 */
export async function listDirectory(
  dirPath: string,
  allowedDirectories: string[]
): Promise<ListDirectoryResult> {
  try {
    const normalized = validatePath(dirPath, allowedDirectories);
    const dirents = await fs.readdir(normalized, { withFileTypes: true });

    const entries: DirectoryEntry[] = [];
    for (const dirent of dirents) {
      const fullPath = `${normalized}/${dirent.name}`;
      try {
        const stats = await fs.stat(fullPath);
        entries.push({
          name: dirent.name,
          type: dirent.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime.toISOString(),
        });
      } catch {
        // Skip entries we can't stat (broken symlinks, permission issues)
      }
    }

    return {
      success: true,
      path: normalized,
      entries,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during directory listing.',
    };
  }
}
```

#### `src/tools/check-allowed.ts`
```typescript
import { normalizePath, isPathAllowed } from '../config.js';

export interface CheckAllowedResult {
  allowed: boolean;
  normalizedPath: string;
}

/**
 * Checks whether a path is within the allowed directories.
 * Does NOT require the path to exist — just validates the location.
 * Never errors — always returns a result.
 */
export function checkAllowed(
  filePath: string,
  allowedDirectories: string[]
): CheckAllowedResult {
  const normalizedPath = normalizePath(filePath);
  const allowed = isPathAllowed(normalizedPath, allowedDirectories);

  return {
    allowed,
    normalizedPath,
  };
}
```

---

### Phase 4: MCP Server Wiring

#### `src/index.ts`
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { writeFile } from './tools/write-file.js';
import { readFile } from './tools/read-file.js';
import { listDirectory } from './tools/list-directory.js';
import { checkAllowed } from './tools/check-allowed.js';

const config = loadConfig();
const allowedDirs = config.allowedDirectories;

const server = new McpServer({
  name: 'local-filesystem',
  version: '1.0.0',
});

server.tool(
  'write_file',
  'Write content to a file on the local filesystem. Auto-creates parent directories.',
  {
    path: z.string().describe('Absolute path to the file to write'),
    content: z.string().describe('Content to write to the file'),
  },
  async ({ path, content }) => {
    const result = await writeFile(path, content, allowedDirs);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'read_file',
  'Read the content of a file from the local filesystem.',
  {
    path: z.string().describe('Absolute path to the file to read'),
  },
  async ({ path }) => {
    const result = await readFile(path, allowedDirs);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'list_directory',
  'List the contents of a directory on the local filesystem.',
  {
    path: z.string().describe('Absolute path to the directory to list'),
  },
  async ({ path }) => {
    const result = await listDirectory(path, allowedDirs);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'check_allowed',
  'Check if a path is within the allowed directories. Does not require the path to exist.',
  {
    path: z.string().describe('Path to check'),
  },
  async ({ path }) => {
    const result = checkAllowed(path, allowedDirs);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal error starting MCP server:', err);
  process.exit(1);
});
```

---

### Phase 5: Tests

#### `tests/config.test.ts` (22 tests)

Tests for:
- `normalizePath` — resolves relative paths, `..` segments, absolute paths
- `isPathAllowed` — inside/outside allowed dirs, exact match, nested subdirs, prefix attacks (`/ProjectsExtra`), root path, empty allowed list, `..` traversal, multiple allowed dirs
- `validatePath` — returns normalized when allowed, throws on denied, throws on empty list
- `loadConfig` — valid config, relative path resolution, missing file, invalid JSON, missing key, wrong type, empty array

#### `tests/tools.test.ts` (16 tests)

Tests for:
- `write_file` — successful write, auto-create parent dirs, overwrite existing, reject outside allowed, reject empty allowed
- `read_file` — read existing, error on non-existent, reject outside allowed
- `list_directory` — list contents with metadata, error on non-existent, reject outside allowed
- `check_allowed` — allowed paths, denied paths, non-existent paths, never throws, path normalization

---

### Build & Test Results

**`npm install`** — 357 packages installed, 0 vulnerabilities

**`npm run build`** — Clean TypeScript compile, no errors

**`npm test`** — First run:
```
FAIL tests/tools.test.ts
  Cannot find module '../config.js' from 'src/tools/write-file.ts'
PASS tests/config.test.ts
```

**Fix:** Added `moduleNameMapper` to `jest.config.js`:
```js
moduleNameMapper: {
  '^(\\.\\.?/.*)\\.js$': '$1',
},
```

**`npm test`** — Second run:
```
PASS tests/config.test.ts
PASS tests/tools.test.ts

Test Suites: 2 passed, 2 total
Tests:       38 passed, 38 total
Time:        1.545 s
```

---

### AGENTS.md Phase Log Updated

All 5 phases marked `[x]` Complete.

---

### Claude's closing summary:

> **What's shipped:**
> - `src/config.ts` — config loading, path normalization, validation
> - `src/tools/` — write_file, read_file, list_directory, check_allowed
> - `src/index.ts` — MCP server wiring with stdio transport
> - `tests/` — 38 tests, all passing
> - `config.json` — pointed at `/Users/kmcallorum/Projects`
> - `README.md` — install, config, Claude Desktop integration, troubleshooting
>
> **Next step:** Add to Claude Desktop config:
> ```json
> {
>   "mcpServers": {
>     "local-filesystem": {
>       "command": "node",
>       "args": ["/Users/kmcallorum/Projects/mcp-local-filesystem/dist/index.js"]
>     }
>   }
> }
> ```

Asked: "Want me to do that, or want to test with `npm run inspector` first?"

---

## Kevin: `test with npm run inspector`

### Claude:
Launched MCP Inspector in background. Confirmed ports listening:
- **localhost:6274** — Inspector UI
- **localhost:6277** — Inspector proxy

> Inspector is running. Open your browser to http://localhost:6274 — you'll see all 4 tools listed and can test them interactively.

---

## Kevin: `save Session to session.md`

### Claude:
Saved session summary to `~/.claude/projects/-Users-kmcallorum-Projects-mcp-local-filesystem/memory/session.md`

---

## Kevin: `save entire detailed conversation to "Convo.md" all your work as well as the prompts and my comments`

### Claude:
Saved this file.
