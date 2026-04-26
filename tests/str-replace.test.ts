import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { strReplace } from '../src/tools/str-replace';

let tmpDir: string;
let allowed: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-strreplace-test-'));
  allowed = [tmpDir];
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('str_replace', () => {
  it('happy path: replaces a single unique match and writes back', async () => {
    const filePath = path.join(tmpDir, 'agents.md');
    fs.writeFileSync(
      filePath,
      '# AGENTS.md\n**Last Updated:** 2026-04-22\n\nbody\n'
    );

    const result = await strReplace(
      filePath,
      '**Last Updated:** 2026-04-22',
      '**Last Updated:** 2026-04-26',
      allowed
    );

    expect(result.success).toBe(true);
    expect(result.path).toBe(filePath);
    expect(result.matchLine).toBe(2);
    expect(result.preview).toContain('2026-04-26');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(
      '# AGENTS.md\n**Last Updated:** 2026-04-26\n\nbody\n'
    );
  });

  it('not found: returns clear error and leaves file unchanged', async () => {
    const filePath = path.join(tmpDir, 'note.txt');
    const original = 'hello world\n';
    fs.writeFileSync(filePath, original);

    const result = await strReplace(filePath, 'goodbye', 'hi', allowed);

    expect(result.success).toBe(false);
    expect(result.error).toBe('old_str not found in file');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(original);
  });

  it('ambiguous: errors with match count and leaves file unchanged', async () => {
    const filePath = path.join(tmpDir, 'paragraph.txt');
    const original =
      'the quick brown fox jumps over the lazy dog and the cat watches.\n';
    fs.writeFileSync(filePath, original);

    const result = await strReplace(filePath, 'the', 'THE', allowed);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/old_str matches \d+ times, must be unique/);
    expect(result.error).toContain('3'); // "the" appears 3 times
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(original);
  });

  it('empty new_str: deletes the matched substring', async () => {
    const filePath = path.join(tmpDir, 'delete.txt');
    fs.writeFileSync(filePath, 'keep this\nDELETE-ME\nkeep this too\n');

    const result = await strReplace(filePath, 'DELETE-ME\n', '', allowed);

    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(
      'keep this\nkeep this too\n'
    );
  });

  it('rejects paths outside allowed root', async () => {
    const result = await strReplace('/etc/hosts', 'localhost', 'example', allowed);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Access denied');
  });

  it('returns clear error when file does not exist', async () => {
    const filePath = path.join(tmpDir, 'does-not-exist.txt');

    const result = await strReplace(filePath, 'anything', 'else', allowed);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/ENOENT|no such file/i);
  });

  it('rejects non-UTF-8 (binary) files with a write_binary hint', async () => {
    const filePath = path.join(tmpDir, 'binary.bin');
    // Bytes that are not valid UTF-8: 0xFF 0xFE 0xFD
    fs.writeFileSync(filePath, Buffer.from([0xff, 0xfe, 0xfd, 0x00, 0xff]));

    const result = await strReplace(filePath, 'anything', 'else', allowed);

    expect(result.success).toBe(false);
    expect(result.error).toContain('write_binary');
  });

  it('passes through optional description on success', async () => {
    const filePath = path.join(tmpDir, 'desc.txt');
    fs.writeFileSync(filePath, 'foo\nbar\nbaz\n');

    const result = await strReplace(
      filePath,
      'bar',
      'qux',
      allowed,
      'rename bar -> qux for test'
    );

    expect(result.success).toBe(true);
    expect(result.description).toBe('rename bar -> qux for test');
  });
});
