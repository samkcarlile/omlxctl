import { render, renderError } from "../render/index.ts";
import type { GlobalOpts } from "../cli.ts";
import { Omlx } from "../sdk.ts";
import { resolveModelId } from "./_resolve.ts";

interface LoadFlags {
  profile?: string;
}

function parseLoadFlags(args: string[]): { positional: string[]; flags: LoadFlags } {
  const positional: string[] = [];
  const flags: LoadFlags = {};
  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;
    if (arg === "--profile" || arg === "--profile=") {
      if (arg.includes("=") && arg.length > "--profile=".length) {
        flags.profile = arg.slice("--profile=".length);
      } else {
        i++;
        flags.profile = args[i];
      }
    } else if (arg.startsWith("--profile=")) {
      flags.profile = arg.slice("--profile=".length);
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
    i++;
  }
  return { positional, flags };
}

export async function loadCommand(args: string[], opts: GlobalOpts): Promise<void> {
  const { positional, flags } = parseLoadFlags(args);

  if (!positional[0]) {
    renderError(new Error("model id required"));
    process.exit(2);
  }

  const query = positional[0];

  let resolvedId: string;
  try {
    resolvedId = await resolveModelId(query, opts);
  } catch (err) {
    renderError(err);
    process.exit(1);
  }

  process.stderr.write(`Loading ${resolvedId}…\n`);

  try {
    const omlx = new Omlx({ baseUrl: opts.baseUrl, apiKey: opts.apiKey });
    const model = await omlx.loadModel(resolvedId, { profile: flags.profile });

    if (process.stdout.isTTY && !opts.json) {
      process.stdout.write(`${model.id}  loaded: ${model.loaded}\n`);
    } else {
      render(model);
    }
  } catch (err) {
    renderError(err);
    process.exit(1);
  }
}
