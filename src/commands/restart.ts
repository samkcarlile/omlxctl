import readline from "node:readline";
import { render, renderError, renderLine } from "../render/index.ts";
import type { GlobalOpts } from "../cli.ts";
import { Omlx } from "../sdk.ts";

async function confirmRestart(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });
    rl.question("Restart server? [y/N] ", (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve(a === "y" || a === "yes");
    });
  });
}

export async function restartCommand(opts: GlobalOpts): Promise<void> {
  if (process.stdout.isTTY && !opts.yes) {
    const ok = await confirmRestart();
    if (!ok) {
      renderLine("Aborted.");
      return;
    }
  }

  process.stderr.write("Restarting…\n");

  try {
    const omlx = new Omlx({ baseUrl: opts.baseUrl, apiKey: opts.apiKey });
    await omlx.restart();

    if (process.stdout.isTTY && !opts.json) {
      renderLine("Server restarted.");
    } else {
      render({ status: "restarted" });
    }
  } catch (err) {
    renderError(err);
    process.exit(1);
  }
}
