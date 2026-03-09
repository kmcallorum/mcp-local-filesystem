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
