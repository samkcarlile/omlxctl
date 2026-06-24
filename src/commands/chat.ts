import { renderLine, renderError } from "../render/index.ts";
import type { GlobalOpts } from "../cli.ts";
import { Omlx } from "../sdk.ts";

interface ChatFlags {
  system?: string;
  temp?: number;
  maxTokens?: number;
}

function parseChatArgs(rawArgs: string[]): { positional: string[]; flags: ChatFlags } {
  const positional: string[] = [];
  const flags: ChatFlags = {};
  let i = 0;

  while (i < rawArgs.length) {
    const arg = rawArgs[i]!;

    if (arg === "--system" || arg.startsWith("--system=")) {
      if (arg.includes("=")) {
        flags.system = arg.slice("--system=".length);
      } else {
        i++;
        flags.system = rawArgs[i];
      }
    } else if (arg === "--temp" || arg.startsWith("--temp=")) {
      if (arg.includes("=")) {
        flags.temp = parseFloat(arg.slice("--temp=".length));
      } else {
        i++;
        flags.temp = parseFloat(rawArgs[i] ?? "");
      }
    } else if (arg === "--max-tokens" || arg.startsWith("--max-tokens=")) {
      if (arg.includes("=")) {
        flags.maxTokens = parseInt(arg.slice("--max-tokens=".length), 10);
      } else {
        i++;
        flags.maxTokens = parseInt(rawArgs[i] ?? "", 10);
      }
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
    i++;
  }

  return { positional, flags };
}

export async function chatCommand(args: string[], opts: GlobalOpts): Promise<void> {
  const { positional, flags } = parseChatArgs(args);

  const model = positional[0];
  const prompt = positional.slice(1).join(" ");

  if (!model || !prompt) {
    renderError(new Error("usage: omlxctl chat <model> <prompt...> [--system <text>] [--temp <n>] [--max-tokens <n>]"));
    process.exit(2);
  }

  try {
    const omlx = new Omlx({ baseUrl: opts.baseUrl, apiKey: opts.apiKey });
    const response = await omlx.chat(model, prompt, {
      system: flags.system,
      temperature: flags.temp,
      maxTokens: flags.maxTokens,
    });
    renderLine(response);
  } catch (err) {
    renderError(err);
    process.exit(1);
  }
}
