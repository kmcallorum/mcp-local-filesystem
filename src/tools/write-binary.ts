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
