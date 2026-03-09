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
