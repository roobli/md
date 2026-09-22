#!/usr/bin/env node
import path from 'node:path';
import { startServe } from './server.js';

function printHelp(): void {
  console.log(`Usage: md serve <dir> [--port <n>] [--host <addr>]

  Thin local HTTP read-only folder browser for @roobli/md.

  Options:
    --port <n>     Port (default: 4321)
    --host <addr>  Bind address (default: 127.0.0.1).
                   Use 0.0.0.0 only when you explicitly want LAN access.
    -h, --help     Show this help

  Examples:
    md serve ./notes
    md serve ./docs --port 4173
    md serve . --host 0.0.0.0
`);
}

function parseArgs(argv: string[]): {
  dir: string | null;
  port: number | undefined;
  host: string | undefined;
  help: boolean;
  error: string | null;
} {
  const args = argv.slice(2);
  let dir: string | null = null;
  let port: number | undefined;
  let host: string | undefined;
  let help = false;
  let command: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '-h' || a === '--help') {
      help = true;
      continue;
    }
    if (a === '--port') {
      const v = args[++i];
      if (v === undefined || !/^\d+$/.test(v)) {
        return { dir: null, port: undefined, host: undefined, help: false, error: 'missing or invalid --port' };
      }
      port = Number(v);
      continue;
    }
    if (a.startsWith('--port=')) {
      const v = a.slice('--port='.length);
      if (!/^\d+$/.test(v)) {
        return { dir: null, port: undefined, host: undefined, help: false, error: 'invalid --port' };
      }
      port = Number(v);
      continue;
    }
    if (a === '--host') {
      const v = args[++i];
      if (v === undefined || v.length === 0) {
        return { dir: null, port: undefined, host: undefined, help: false, error: 'missing --host' };
      }
      host = v;
      continue;
    }
    if (a.startsWith('--host=')) {
      host = a.slice('--host='.length);
      continue;
    }
    if (a.startsWith('-')) {
      return { dir: null, port: undefined, host: undefined, help: false, error: `unknown option: ${a}` };
    }
    if (command === null) {
      command = a;
      continue;
    }
    if (dir === null) {
      dir = a;
      continue;
    }
    return { dir: null, port: undefined, host: undefined, help: false, error: `unexpected argument: ${a}` };
  }

  if (help) return { dir, port, host, help: true, error: null };

  if (command === null) {
    return { dir: null, port, host, help: false, error: 'missing command (try: md serve <dir>)' };
  }
  if (command !== 'serve') {
    return {
      dir: null,
      port,
      host,
      help: false,
      error: `unknown command: ${command} (only "serve" is supported)`,
    };
  }
  if (dir === null) {
    return { dir: null, port, host, help: false, error: 'missing <dir> (try: md serve ./folder)' };
  }
  return { dir, port, host, help: false, error: null };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);
  if (parsed.help) {
    printHelp();
    process.exit(0);
  }
  if (parsed.error || !parsed.dir) {
    console.error(`md: ${parsed.error ?? 'invalid arguments'}`);
    printHelp();
    process.exit(1);
  }

  const root = path.resolve(process.cwd(), parsed.dir);
  const serveOpts = {
    root,
    ...(parsed.port !== undefined ? { port: parsed.port } : {}),
    ...(parsed.host !== undefined ? { host: parsed.host } : {}),
  };

  try {
    await startServe(serveOpts);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
