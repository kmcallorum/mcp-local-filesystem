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
