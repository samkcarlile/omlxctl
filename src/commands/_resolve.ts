import readline from "node:readline";
import { renderError, renderLine } from "../render/index.ts";
import type { GlobalOpts } from "../cli.ts";
import { Omlx } from "../sdk.ts";

/**
 * Prompt user on stderr / stdin. Returns true if user answered y/yes.
 */
export async function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes");
    });
  });
}

/**
 * Resolves a model id query against the server model list.
 * - Exact match: returns immediately.
 * - Substring match (case-insensitive): confirms on TTY unless opts.yes.
 * - 0 matches: writes error + exits 1.
 * - >1 matches: writes error + exits 1.
 */
export async function resolveModelId(query: string, opts: GlobalOpts): Promise<string> {
  const omlx = new Omlx({ baseUrl: opts.baseUrl, apiKey: opts.apiKey });
  const models = await omlx.models();

  // Exact match first
  const exact = models.find((m) => m.id === query);
  if (exact) return exact.id;

  // Fuzzy (substring, case-insensitive)
  const lower = query.toLowerCase();
  const matches = models.filter((m) => m.id.toLowerCase().includes(lower));

  if (matches.length === 0) {
    renderError(new Error(`no model matches '${query}'`));
    process.exit(1);
  }

  if (matches.length > 1) {
    const ids = matches.map((m) => m.id).join(", ");
    renderError(new Error(`ambiguous: matches ${ids}`));
    process.exit(1);
  }

  const resolved = matches[0]!.id;

  // Single fuzzy match — confirm unless piped or --yes
  if (process.stdout.isTTY && !opts.yes) {
    const ok = await confirm(`Load '${resolved}'? [y/N] `);
    if (!ok) {
      renderLine("Aborted.");
      process.exit(0);
    }
  }

  return resolved;
}
