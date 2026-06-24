import { render, renderLine, renderError } from "../render/index.ts";
import type { GlobalOpts } from "../cli.ts";

import { Omlx } from "../sdk.ts";

export async function execCommand(
  args: string[],
  opts: GlobalOpts,
): Promise<void> {
  const code = args.join(" ").trim();
  if (!code) {
    process.stderr.write("exec: no expression provided\n");
    process.exit(2);
  }

  // Resolve config from opts overrides
  const { resolveConfig } = await import("../client/config.ts");
  const config = await resolveConfig({
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
  });

  const omlx = new Omlx(config);

  const print = (v: unknown): void => {
    if (typeof v === "string") renderLine(v);
    else render(v);
  };

  const json = (v: unknown): string => JSON.stringify(v, null, 2);

  // Try expression mode first (wrap in "return (<code>)")
  let fn: (...args: unknown[]) => Promise<unknown>;
  let result: unknown;

  try {
    // eslint-disable-next-line no-new-func
    fn = new Function(
      "omlx",
      "print",
      "json",
      `return (async (omlx, print, json) => { return (${code}); })(omlx, print, json);`,
    ) as (...args: unknown[]) => Promise<unknown>;
    result = await fn(omlx, print, json);
  } catch (expressionError) {
    // Fall back to statement mode
    try {
      // eslint-disable-next-line no-new-func
      fn = new Function(
        "omlx",
        "print",
        "json",
        `return (async (omlx, print, json) => { ${code} })(omlx, print, json);`,
      ) as (...args: unknown[]) => Promise<unknown>;
      result = await fn(omlx, print, json);
    } catch (statementError) {
      renderError(statementError);
      process.exit(1);
    }
  }

  if (result !== undefined) {
    if (typeof result === "string") {
      renderLine(result);
    } else {
      render(result);
    }
  }
}
