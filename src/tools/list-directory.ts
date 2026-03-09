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
