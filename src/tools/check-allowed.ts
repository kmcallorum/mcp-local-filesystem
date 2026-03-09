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
