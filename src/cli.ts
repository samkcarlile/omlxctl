#!/usr/bin/env bun
import { setRenderFlags, renderLine, renderError } from "./render/index.ts";
import { helpCommand } from "./commands/help.ts";
import { execCommand } from "./commands/exec.ts";
import { statusCommand } from "./commands/status.ts";
import { modelsCommand } from "./commands/models.ts";
import { statsCommand } from "./commands/stats.ts";
import { restartCommand } from "./commands/restart.ts";
import { loadCommand } from "./commands/load.ts";
import { unloadCommand } from "./commands/unload.ts";
import { chatCommand } from "./commands/chat.ts";
import { followCommand } from "./commands/follow.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface GlobalOpts {
  json: boolean;
  noColor: boolean;
  yes: boolean;
  baseUrl?: string;
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv: string[]): {
  subcommand: string;
  subArgs: string[];
  opts: GlobalOpts;
} {
  const opts: GlobalOpts = {
    json: false,
    noColor: false,
    yes: false,
  };

  const positional: string[] = [];
  const subArgTokens: string[] = [];
  let i = 0;
  let subcommandSeen = false;

  while (i < argv.length) {
    const arg = argv[i];
    if (arg === undefined) break;

    // Once the subcommand is identified, pass everything else to subArgs as-is
    if (subcommandSeen) {
      subArgTokens.push(arg);
      i++;
      continue;
    }

    if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--no-color") {
      opts.noColor = true;
    } else if (arg === "--yes" || arg === "-y") {
      opts.yes = true;
    } else if (arg === "--base-url" || arg === "--base-url=") {
      if (arg.includes("=")) {
        opts.baseUrl = arg.split("=").slice(1).join("=");
      } else {
        i++;
        opts.baseUrl = argv[i];
      }
    } else if (arg.startsWith("--base-url=")) {
      opts.baseUrl = arg.slice("--base-url=".length);
    } else if (arg === "--api-key") {
      i++;
      opts.apiKey = argv[i];
    } else if (arg.startsWith("--api-key=")) {
      opts.apiKey = arg.slice("--api-key=".length);
    } else if (arg === "--help" || arg === "-h") {
      positional.unshift("help");
      subcommandSeen = true;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
      subcommandSeen = true;  // first non-flag = subcommand; everything after goes to subArgs
    }
    // Unknown flags before the subcommand are silently ignored
    i++;
  }

  const subcommand = positional[0] ?? "help";
  const subArgs = subArgTokens;

  return { subcommand, subArgs, opts };
}

// ---------------------------------------------------------------------------
// Stub helper
// ---------------------------------------------------------------------------
function comingSoon(name: string, phase: number): () => Promise<void> {
  return async () => {
    renderLine(`${name}: coming soon in phase ${phase}`);
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { subcommand, subArgs, opts } = parseArgs(argv);

  // Apply render flags globally before any output
  setRenderFlags(opts.json, opts.noColor);

  const subcommands: Record<string, () => Promise<void>> = {
    help: () => helpCommand(subArgs),
    status: () => statusCommand(opts),
    models: () => modelsCommand(subArgs, opts),
    stats: () => statsCommand(subArgs, opts),
    exec: () => execCommand(subArgs, opts),
    follow: () => followCommand(subArgs, opts),
    restart: () => restartCommand(opts),
    load: () => loadCommand(subArgs, opts),
    unload: () => unloadCommand(subArgs, opts),
    chat: () => chatCommand(subArgs, opts),
  };

  const handler = subcommands[subcommand];

  if (!handler) {
    process.stderr.write(`omlxctl: unknown subcommand '${subcommand}'\n`);
    process.stderr.write(`Run 'omlxctl help' for usage.\n`);
    process.exit(2);
  }

  try {
    await handler();
  } catch (err) {
    renderError(err);
    process.exit(1);
  }
}

main();
