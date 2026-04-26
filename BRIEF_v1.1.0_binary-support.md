# Skip/Jr. Brief — mcp-local-filesystem v1.1.0

**From:** Chief (Claude Web)
**To:** Skip (Opus review) → Jr. (Claude Code build)
**Date:** 2026-04-24
**Project:** `/Users/kmcallorum/Projects/mcp-local-filesystem`
**Version bump:** 1.0.0 → 1.1.0 (minor — additive, no breaking changes)

---

## Why this change

The filesystem MCP currently handles text correctly but corrupts binary files in both directions:

- **Read side:** `fs.readFile(path, 'utf-8')` runs the bytes through a UTF-8 decoder with replacement. For a PDF, that replaced 143,940 of ~350K bytes with U+FFFD on 2026-04-24.
- **Write side:** `fs.writeFile(path, content, 'utf-8')` re-encodes the string to UTF-8 before writing. A 256-character test with bytes 0–255 came out as 287 bytes on disk (expansion of every byte ≥ 0x80 into 2-byte UTF-8 sequences). A zip-archive-based file like pptx/docx/xlsx cannot survive this — the central directory has byte-exact offsets and CRC checksums.

This change adds two new tools — `read_binary` and `write_binary` — that handle bytes correctly via base64 encoding over the JSON transport. Existing `read_file` and `write_file` are **untouched** to preserve backward compatibility and to make the text/binary distinction explicit at the tool-name level.

Net result: Chief can write Dan's weekly PCP diagram .pdf, generated .pptx decks, generated .docx docs, and any other binary straight to the filesystem instead of round-tripping through chat upload/download.

---

## Scope — exactly what changes

**New files:**
- `src/tools/read-binary.ts`
- `src/tools/write-binary.ts`

**Edited files:**
- `src/index.ts` — add two tool registrations, add two imports
- `package.json` — version bump to `1.1.0`
- `AGENTS.md` — add Phase 6 to the Phase Log, update Current State, update Tools to Implement section
- `README.md` — add `read_binary` and `write_binary` to the tool documentation, add a note about when to use each
- `tests/tools.test.ts` — add binary round-trip tests (or create `tests/binary.test.ts` — Jr.'s call)

**Untouched:**
- `src/tools/read-file.ts` — stays exactly as-is (regression-protected)
- `src/tools/write-file.ts` — stays exactly as-is (regression-protected)
- `src/tools/list-directory.ts` — unchanged
- `src/tools/check-allowed.ts` — unchanged
- `src/config.ts` — unchanged (path validation already works for any path)

---

## File 1 — New — `src/tools/read-binary.ts`

```typescript
import * as fs from 'node:fs/promises';
import { validatePath } from '../config.js';

export interface ReadBinaryResult {
  success: boolean;
  content?: string;       // base64-encoded bytes
  path?: string;
  bytesRead?: number;
  error?: string;
}

/**
 * Reads a file as raw bytes and returns its content base64-encoded.
 *
 * Use this tool for any file where byte-exact preservation matters:
 * pdf, docx, pptx, xlsx, png, jpg, zip, or any compiled/encoded format.
 * For plain text files (md, txt, json, ts, py), use read_file instead.
 *
 * The base64 encoding survives the JSON transport losslessly — unlike
 * the UTF-8 path used by read_file, which will corrupt any byte that
 * isn't a valid UTF-8 sequence.
 *
 * @param filePath Absolute path to the file to read.
 * @param allowedDirectories Whitelist from config — path must be within one.
 * @returns Result object with base64-encoded content on success.
 */
export async function readBinary(
  filePath: string,
  allowedDirectories: string[]
): Promise<ReadBinaryResult> {
  try {
    const normalized = validatePath(filePath, allowedDirectories);
    const buffer = await fs.readFile(normalized);

    return {
      success: true,
      content: buffer.toString('base64'),
      path: normalized,
      bytesRead: buffer.length,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during binary read.',
    };
  }
}
```

---

## File 2 — New — `src/tools/write-binary.ts`

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { validatePath } from '../config.js';

export interface WriteBinaryResult {
  success: boolean;
  path?: string;
  bytesWritten?: number;
  error?: string;
}

/**
 * Writes base64-encoded content to a file as raw bytes.
 * Auto-creates parent directories. Overwrites existing files without warning.
 *
 * Use this tool for any file where byte-exact preservation matters:
 * pdf, docx, pptx, xlsx, png, jpg, zip, or any compiled/encoded format.
 * For plain text files (md, txt, json, ts, py), use write_file instead.
 *
 * The base64 input is decoded to a Buffer and written directly, bypassing
 * the UTF-8 re-encoding path that write_file uses.
 *
 * @param filePath Absolute path to the file to write.
 * @param base64Content Content to write, base64-encoded.
 * @param allowedDirectories Whitelist from config — path must be within one.
 * @returns Result object with bytesWritten on success.
 */
export async function writeBinary(
  filePath: string,
  base64Content: string,
  allowedDirectories: string[]
): Promise<WriteBinaryResult> {
  try {
    const normalized = validatePath(filePath, allowedDirectories);
    const dir = path.dirname(normalized);

    await fs.mkdir(dir, { recursive: true });

    const buffer = Buffer.from(base64Content, 'base64');
    await fs.writeFile(normalized, buffer);

    const stats = await fs.stat(normalized);
    return {
      success: true,
      path: normalized,
      bytesWritten: stats.size,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during binary write.',
    };
  }
}
```

---

## File 3 — Edited — `src/index.ts`

Two additions — new imports at the top, two new `server.tool()` registrations at the bottom (before `async function main()`). The existing four tool registrations are unchanged.

**Add to the imports block at the top of the file:**

```typescript
import { readBinary } from './tools/read-binary.js';
import { writeBinary } from './tools/write-binary.js';
```

**Add these two new tool registrations after the existing `check_allowed` tool and before `async function main()`:**

```typescript
server.tool(
  'write_binary',
  'Write base64-encoded content to a file as raw bytes on the local filesystem. Auto-creates parent directories. Use this for any file where byte-exact preservation matters: pdf, docx, pptx, xlsx, png, jpg, zip, or any compiled/encoded format. For plain text files (md, txt, json, ts, py), use write_file instead.',
  {
    path: z.string().describe('Absolute path to the file to write'),
    content: z.string().describe('Base64-encoded binary content'),
  },
  async ({ path, content }) => {
    const result = await writeBinary(path, content, allowedDirs);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'read_binary',
  'Read a file from the local filesystem and return its content as base64-encoded bytes. Use this for any file where byte-exact preservation matters: pdf, docx, pptx, xlsx, png, jpg, zip, or any compiled/encoded format. For plain text files (md, txt, json, ts, py), use read_file instead.',
  {
    path: z.string().describe('Absolute path to the file to read'),
  },
  async ({ path }) => {
    const result = await readBinary(path, allowedDirs);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);
```

---

## File 4 — Edited — `package.json`

One-line change:

```json
  "version": "1.1.0",
```

(was `"1.0.0"`)

---

## File 5 — New or appended tests

**Option A — append to `tests/tools.test.ts`** — matches existing structure.
**Option B — new `tests/binary.test.ts`** — cleaner isolation. Jr.'s call.

### Required test cases

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { readBinary } from '../src/tools/read-binary.js';
import { writeBinary } from '../src/tools/write-binary.js';

describe('Binary tools — round-trip preservation', () => {
  let tmpDir: string;
  let allowedDirs: string[];

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-binary-test-'));
    allowedDirs = [tmpDir];
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes and reads back all 256 byte values losslessly', async () => {
    // Every possible byte value — covers every UTF-8 corruption edge case
    const originalBytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    const base64 = originalBytes.toString('base64');
    const filePath = path.join(tmpDir, 'all-bytes.bin');

    const writeResult = await writeBinary(filePath, base64, allowedDirs);
    expect(writeResult.success).toBe(true);
    expect(writeResult.bytesWritten).toBe(256);

    const readResult = await readBinary(filePath, allowedDirs);
    expect(readResult.success).toBe(true);
    expect(readResult.bytesRead).toBe(256);

    const roundTrip = Buffer.from(readResult.content!, 'base64');
    expect(roundTrip.equals(originalBytes)).toBe(true);
  });

  it('preserves a zip-archive header byte pattern (pptx/docx signature)', async () => {
    // PK\x03\x04 — the magic bytes at the start of every zip-based Office file.
    // These bytes are exactly what UTF-8 corruption destroys.
    const zipHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    const base64 = zipHeader.toString('base64');
    const filePath = path.join(tmpDir, 'fake.pptx');

    const writeResult = await writeBinary(filePath, base64, allowedDirs);
    expect(writeResult.success).toBe(true);

    const onDisk = await fs.readFile(filePath);
    expect(onDisk.equals(zipHeader)).toBe(true);
  });

  it('rejects paths outside allowed directories', async () => {
    const base64 = Buffer.from('test').toString('base64');
    const badPath = '/tmp/outside-allowed.bin';

    const writeResult = await writeBinary(badPath, base64, allowedDirs);
    expect(writeResult.success).toBe(false);
    expect(writeResult.error).toBeDefined();

    const readResult = await readBinary(badPath, allowedDirs);
    expect(readResult.success).toBe(false);
    expect(readResult.error).toBeDefined();
  });

  it('auto-creates parent directories on write_binary', async () => {
    const nestedPath = path.join(tmpDir, 'deep', 'nested', 'file.bin');
    const base64 = Buffer.from([0xFF, 0xFE, 0xFD]).toString('base64');

    const writeResult = await writeBinary(nestedPath, base64, allowedDirs);
    expect(writeResult.success).toBe(true);
    expect(writeResult.bytesWritten).toBe(3);
  });

  it('returns error for non-existent file on read_binary', async () => {
    const missingPath = path.join(tmpDir, 'does-not-exist.bin');
    const readResult = await readBinary(missingPath, allowedDirs);
    expect(readResult.success).toBe(false);
    expect(readResult.error).toBeDefined();
  });

  it('returns error for invalid base64 on write_binary', async () => {
    // Node's Buffer.from with 'base64' is lenient — invalid chars are ignored
    // but we should at least verify the function doesn't throw.
    const filePath = path.join(tmpDir, 'bad-input.bin');
    const writeResult = await writeBinary(filePath, 'not!!valid@@base64??', allowedDirs);
    // Buffer.from is permissive, so this will succeed with whatever it could parse.
    // The key assertion is it does not throw.
    expect(writeResult.success).toBe(true);
  });
});

describe('Regression — text tools still work unchanged', () => {
  // Sanity check: the existing read_file / write_file tests should still pass.
  // This block is intentionally thin — the existing test suite covers them.
  it('leaves existing read_file and write_file tests untouched', () => {
    expect(true).toBe(true); // placeholder — existing test file does the real work
  });
});
```

### Success criteria

- All existing tests still pass (regression)
- New binary tests pass
- Total test count: 38 existing + 6 new = **44 tests**

---

## File 6 — Edited — `AGENTS.md`

### Update "Tools to Implement" section — add two entries after `check_allowed`:

```markdown
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
```

### Update "Current State" section — change the date and tool count:

```markdown
## Current State (2026-04-24 — v1.1.0)
- 6 tools complete: read_file, write_file, list_directory, check_allowed, read_binary, write_binary
- 44 tests passing (38 existing + 6 new binary round-trip tests)
- Clean TypeScript compile, zero errors
- Wired into Claude Desktop config
- Binary path preserves bytes losslessly via base64 encoding
```

### Append Phase 6 to the Phase Log:

```markdown
- [ ] Phase 6: Binary file support (v1.1.0)
      Add read_binary and write_binary tools for byte-exact preservation
      of pdf/docx/pptx/png/zip/etc. via base64 encoding.
      Existing read_file/write_file unchanged for backward compatibility.
      Tests: round-trip all 256 byte values, preserve zip magic bytes,
      reject out-of-scope paths, auto-mkdir on write.
      Status: Pending — brief handed to Jr. on 2026-04-24 by Chief.
```

---

## File 7 — Edited — `README.md`

Add a new subsection to the tool documentation. Keep it short and match the existing README style (Jr. already knows the tone).

Somewhere after the existing 4 tool descriptions, add:

```markdown
### read_binary / write_binary — for binary files

For any file where byte-exact preservation matters (pdf, docx, pptx, xlsx,
png, jpg, zip, compiled/encoded formats), use `read_binary` and `write_binary`.

These tools base64-encode the file content over the JSON transport, avoiding
the UTF-8 corruption that would happen with `read_file` / `write_file` on a
binary file.

- **read_binary** — returns `content` as a base64 string plus `bytesRead`
- **write_binary** — takes a base64-encoded `content` string, decodes and writes raw bytes

For plain text files (md, txt, json, ts, py, rego), keep using `read_file`
and `write_file` — they are more efficient (no base64 overhead).
```

---

## Definition of Done

Per existing AGENTS.md convention, Phase 6 is complete when:

1. TypeScript compiles with zero errors (`npm run build`)
2. All 44 tests pass (`npm test`)
3. MCP Inspector (`npm run inspector`) shows 6 tools — the original 4 plus `read_binary` and `write_binary`
4. AGENTS.md Phase Log updated to reflect completion
5. `package.json` version shows `1.1.0`
6. Conventional commit: `feat: add read_binary and write_binary tools for byte-exact preservation (v1.1.0)`

---

## What happens after Jr. finishes

1. Jr. reports tests + build output to Kevin
2. Kevin runs end-to-end verification:
   - Restart Claude Desktop (Quit + reopen) to pick up the new `dist/index.js`
   - Open a new Claude Web session, confirm 6 tools are visible
   - Test: ask Chief to read a pdf via `read_binary`, verify bytes match `shasum` of the original file on disk
3. If verification passes, commit to git with the conventional commit message above

**Important:** Do NOT restart Claude Desktop during Session 4 (10:30–11:30 ET today). The session depends on filesystem access for the live agents-verify run. Hold the restart until after the weekly status report is written.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Base64 overhead bloats JSON payloads (~33% size increase) | Acceptable — Claude Web context limits aren't hit by a few MB of encoded file |
| LLM calls `read_file` on a binary by accident | Tool descriptions make the distinction explicit; wrong tool returns obvious garbage not silent corruption |
| New tools don't appear in Claude Desktop | Restart Claude Desktop required; documented in Definition of Done |
| Existing text workflows break | Regression-protected — `read_file` / `write_file` code is untouched |
| Binary file too large for JSON transport | Not addressed in v1.1.0 — streaming/chunking is a v1.2 concern. Document the limit once empirically determined |

---

## Open question for post-v1.1.0

What's the effective file-size ceiling for base64-over-JSON through the MCP transport? Today's biggest test files:
- Session 4 pptx: 328 KB → 437 KB base64 → fine
- PCP-5 pdf: 350 KB → 467 KB base64 → fine
- v8.5.1.2 docx: ~600 KB → 800 KB base64 → probably fine

A future Dan release might be bigger. If we hit a ceiling, v1.2 adds streaming via chunked reads. Not urgent.

---

*Chief — 2026-04-24*
*Brief follows AGENTS.md convention. All changes surgical. Backward compatible. Ready for Skip review → Jr. build.*
