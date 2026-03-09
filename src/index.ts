import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { writeFile } from './tools/write-file.js';
import { readFile } from './tools/read-file.js';
import { listDirectory } from './tools/list-directory.js';
import { checkAllowed } from './tools/check-allowed.js';

const config = loadConfig();
const allowedDirs = config.allowedDirectories;

const server = new McpServer({
  name: 'local-filesystem',
  version: '1.0.0',
});

server.tool(
  'write_file',
  'Write content to a file on the local filesystem. Auto-creates parent directories.',
  {
    path: z.string().describe('Absolute path to the file to write'),
    content: z.string().describe('Content to write to the file'),
  },
  async ({ path, content }) => {
    const result = await writeFile(path, content, allowedDirs);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'read_file',
  'Read the content of a file from the local filesystem.',
  {
    path: z.string().describe('Absolute path to the file to read'),
  },
  async ({ path }) => {
    const result = await readFile(path, allowedDirs);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'list_directory',
  'List the contents of a directory on the local filesystem.',
  {
    path: z.string().describe('Absolute path to the directory to list'),
  },
  async ({ path }) => {
    const result = await listDirectory(path, allowedDirs);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'check_allowed',
  'Check if a path is within the allowed directories. Does not require the path to exist.',
  {
    path: z.string().describe('Path to check'),
  },
  async ({ path }) => {
    const result = checkAllowed(path, allowedDirs);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal error starting MCP server:', err);
  process.exit(1);
});
