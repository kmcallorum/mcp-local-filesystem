import * as fs from 'node:fs/promises';
import { validatePath } from '../config.js';

export interface StrReplaceResult {
  success: boolean;
  path?: string;
  matchLine?: number;
  preview?: string;
  description?: string;
  error?: string;
}

/**
 * Replaces a single occurrence of `oldStr` with `newStr` in a UTF-8 text file.
 *
 * Behavior:
 * - 0 matches → error, file unchanged
 * - 2+ matches → error with match count, file unchanged (caller must add context to disambiguate)
 * - exactly 1 match → replaced and written back
 * - non-UTF-8 (binary) file → rejected, suggest write_binary
 *
 * For full-file overwrites, use write_file. For binary files, use write_binary.
 */
export async function strReplace(
  filePath: string,
  oldStr: string,
  newStr: string,
  allowedDirectories: string[],
  description?: string
): Promise<StrReplaceResult> {
  try {
    const normalized = validatePath(filePath, allowedDirectories);

    const buffer = await fs.readFile(normalized);

    let content: string;
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      return {
        success: false,
        error:
          'File is not valid UTF-8 text. Use write_binary for binary files.',
      };
    }

    const firstIdx = content.indexOf(oldStr);
    if (firstIdx === -1) {
      return { success: false, error: 'old_str not found in file' };
    }

    const secondIdx = content.indexOf(oldStr, firstIdx + 1);
    if (secondIdx !== -1) {
      let count = 0;
      let from = 0;
      while (true) {
        const at = content.indexOf(oldStr, from);
        if (at === -1) break;
        count += 1;
        from = at + Math.max(oldStr.length, 1);
      }
      return {
        success: false,
        error: `old_str matches ${count} times, must be unique. Add surrounding context to disambiguate.`,
      };
    }

    const updated =
      content.slice(0, firstIdx) + newStr + content.slice(firstIdx + oldStr.length);

    await fs.writeFile(normalized, updated, 'utf-8');

    const matchLine = content.slice(0, firstIdx).split('\n').length;
    const updatedLines = updated.split('\n');
    const previewStart = Math.max(0, matchLine - 1 - 2);
    const previewEnd = Math.min(updatedLines.length, matchLine + 2);
    const preview = updatedLines
      .slice(previewStart, previewEnd)
      .map((line, i) => `${previewStart + i + 1}: ${line}`)
      .join('\n');

    return {
      success: true,
      path: normalized,
      matchLine,
      preview,
      ...(description ? { description } : {}),
    };
  } catch (err) {
    let message: string;
    if (err instanceof Error) {
      message = err.message;
    } else if (
      err &&
      typeof err === 'object' &&
      typeof (err as { message?: unknown }).message === 'string'
    ) {
      message = (err as { message: string }).message;
    } else {
      message = String(err) || 'Unknown error during str_replace.';
    }
    return { success: false, error: message };
  }
}
