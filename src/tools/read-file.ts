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
