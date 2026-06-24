import { render, renderLine, renderError } from "../render/index.ts";
import type { GlobalOpts } from "../cli.ts";
import { Omlx } from "../sdk.ts";

export async function followCommand(
  args: string[],
  opts: GlobalOpts,
): Promise<void> {
  // Parse follow-specific flags from args, leaving the expression in remainder
  let intervalMs = 1000;
  let count: number | undefined;
  let timeoutMs: number | undefined;
  const exprParts: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--interval" && i + 1 < args.length) {
      intervalMs = parseInt(args[++i]!, 10);
    } else if (arg?.startsWith("--interval=")) {
      intervalMs = parseInt(arg.slice("--interval=".length), 10);
    } else if (arg === "--count" && i + 1 < args.length) {
      count = parseInt(args[++i]!, 10);
    } else if (arg?.startsWith("--count=")) {
      count = parseInt(arg.slice("--count=".length), 10);
    } else if (arg === "--timeout" && i + 1 < args.length) {
      timeoutMs = parseInt(args[++i]!, 10);
    } else if (arg?.startsWith("--timeout=")) {
      timeoutMs = parseInt(arg.slice("--timeout=".length), 10);
    } else if (arg !== undefined) {
      exprParts.push(arg);
    }
    i++;
  }

  const code = exprParts.join(" ").trim();
  if (!code) {
    process.stderr.write("follow: no expression provided\n");
    process.exit(2);
  }

  const { resolveConfig } = await import("../client/config.ts");
  const config = await resolveConfig({
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
  });

  const omlx = new Omlx(config);

  // Build eval function — same expression/statement dual-mode as exec
  type EvalFn = (omlx: Omlx) => Promise<unknown>;
  let evalFn: EvalFn;

  try {
    // eslint-disable-next-line no-new-func
    const raw = new Function(
      "omlx",
      `return (async (omlx) => { return (${code}); })(omlx);`,
    );
    // Probe once to validate expression mode (will throw on syntax error)
    evalFn = (o: Omlx) => raw(o) as Promise<unknown>;
  } catch {
    try {
      // eslint-disable-next-line no-new-func
      const raw = new Function(
        "omlx",
        `return (async (omlx) => { ${code} })(omlx);`,
      );
      evalFn = (o: Omlx) => raw(o) as Promise<unknown>;
    } catch (err) {
      renderError(err);
      process.exit(1);
    }
  }

  const ac = new AbortController();

  // Handle Ctrl-C
  process.on("SIGINT", () => {
    ac.abort();
    process.exit(0);
  });

  // Handle --timeout
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs !== undefined) {
    timeoutId = setTimeout(() => {
      ac.abort();
    }, timeoutMs);
  }

  const isTTY = process.stdout.isTTY;
  let changesSeen = 0;

  try {
    for await (const value of omlx.watch(
      (o) => evalFn!(o),
      { intervalMs, signal: ac.signal },
    )) {
      if (ac.signal.aborted) break;

      if (isTTY) {
        // Clear screen then render
        process.stdout.write("\x1B[2J\x1B[0f");
        if (typeof value === "string") {
          renderLine(value);
        } else {
          render(value);
        }
      } else {
        // Piped — emit JSONL
        process.stdout.write(
          JSON.stringify({ t: new Date().toISOString(), value }) + "\n",
        );
      }

      changesSeen++;
      if (count !== undefined && changesSeen >= count) {
        break;
      }
    }
  } catch (err) {
    if (!ac.signal.aborted) {
      renderError(err);
      process.exit(1);
    }
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
