import { OmlxApiError } from "../types/errors.ts";

// ---------------------------------------------------------------------------
// Flag state — set by cli.ts before any render call
// ---------------------------------------------------------------------------
let _jsonFlag = false;
let _noColorFlag = false;

export function setRenderFlags(json: boolean, noColor: boolean): void {
  _jsonFlag = json;
  _noColorFlag = noColor;
}

// ---------------------------------------------------------------------------
// Output mode
// ---------------------------------------------------------------------------
export const isJson: boolean = !process.stdout.isTTY;
export const noColor: boolean =
  !process.stdout.isTTY || !!process.env["NO_COLOR"];

// Effective values (incorporate runtime flags set after module load)
function effectiveJson(): boolean {
  return _jsonFlag || !process.stdout.isTTY;
}
function effectiveNoColor(): boolean {
  return _noColorFlag || !!process.env["NO_COLOR"] || !process.stdout.isTTY;
}

// ---------------------------------------------------------------------------
// ANSI color helpers
// ---------------------------------------------------------------------------
const ESC = "\x1b";
function ansi(code: string, s: string): string {
  if (effectiveNoColor()) return s;
  return `${ESC}[${code}m${s}${ESC}[0m`;
}

export const c = {
  bold: (s: string) => ansi("1", s),
  dim: (s: string) => ansi("2", s),
  green: (s: string) => ansi("32", s),
  yellow: (s: string) => ansi("33", s),
  red: (s: string) => ansi("31", s),
  cyan: (s: string) => ansi("36", s),
  blue: (s: string) => ansi("34", s),
};

// ---------------------------------------------------------------------------
// Render functions
// ---------------------------------------------------------------------------
export function renderJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

export function renderPretty(value: unknown): void {
  if (effectiveNoColor()) {
    process.stdout.write(JSON.stringify(value, null, 2) + "\n");
    return;
  }
  // Colorize JSON output with ANSI
  const raw = JSON.stringify(value, null, 2);
  const colored = raw
    .replace(/"([^"]+)":/g, (_, k: string) => c.cyan(`"${k}"`) + ":")
    .replace(/: "([^"]*)"/g, (_, v: string) => `: ${c.green(`"${v}"`)}`)
    .replace(/: (true|false)/g, (_, v: string) => `: ${c.yellow(v)}`)
    .replace(/: (null)/g, (_, v: string) => `: ${c.dim(v)}`)
    .replace(/: (-?\d+(?:\.\d+)?)/g, (_, v: string) => `: ${c.blue(v)}`);
  process.stdout.write(colored + "\n");
}

export function render(value: unknown): void {
  if (effectiveJson()) {
    renderJson(value);
  } else {
    renderPretty(value);
  }
}

export function renderLine(line: string): void {
  process.stdout.write(line + "\n");
}

// ---------------------------------------------------------------------------
// Visible-width helpers (strip ANSI when measuring/padding)
// ---------------------------------------------------------------------------
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function visibleWidth(s: string): number {
  return s.replace(ANSI_RE, "").length;
}

/** Left-pad/truncate to a target *visible* width, preserving ANSI codes. */
function padTo(s: string, width: number, align: "left" | "right" = "left"): string {
  const w = visibleWidth(s);
  if (w >= width) return s;
  const fill = " ".repeat(width - w);
  return align === "right" ? fill + s : s + fill;
}

/** Truncate to a max visible width with an ellipsis. ANSI-unaware (use on plain text). */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
/** 413548 -> "413,548" */
export function commas(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Compact magnitude: 413548 -> "413K", 1_300_000 -> "1.3M" */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(Math.round(n));
}

/** Bytes -> "4.2 GB", "512 MB", "1.3 TB". */
export function bytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} TB`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`;
  return `${n} B`;
}

/** Seconds -> "2d 3h 14m" / "42m 30s" / "12s". Max two units. */
export function duration(s: number): string {
  s = Math.max(0, Math.floor(s));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** ISO timestamp -> "2h ago", "3d ago", "just now", or "never" for null. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "never";
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------
type BarColor = "green" | "yellow" | "red";

/** ASCII progress bar; auto-colored green→yellow→red by fill %. */
export function bar(used: number, max: number, width = 20): string {
  const pct = max > 0 ? Math.min(1, Math.max(0, used / max)) : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const color: BarColor = pct > 0.8 ? "red" : pct >= 0.5 ? "yellow" : "green";
  const body = c[color]("█".repeat(filled)) + c.dim("░".repeat(empty));
  return `[${body}]`;
}

/** A colored inline status token, e.g. "● loaded" in green. */
export function badge(
  text: string,
  color: "green" | "yellow" | "red" | "blue" | "dim",
): string {
  return c[color](`● ${text}`);
}

/** Bold dim uppercase section header followed by indented lines + trailing blank. */
export function section(title: string, lines: string[]): void {
  renderLine("  " + c.bold(c.cyan(title.toUpperCase())));
  for (const l of lines) renderLine("    " + l);
  renderLine("");
}

/** Aligned "label  value" pairs; label dim, value bold/white. */
export function kv(
  pairs: [string, string][],
  opts?: { indent?: number; labelWidth?: number },
): void {
  const indent = " ".repeat(opts?.indent ?? 4);
  const labelW =
    opts?.labelWidth ?? Math.max(0, ...pairs.map(([k]) => k.length));
  for (const [k, v] of pairs) {
    renderLine(`${indent}${c.dim(padTo(k, labelW))}  ${v}`);
  }
}

/** Left-aligned auto-padded text table with an optional bold header row. */
export function table(
  rows: string[][],
  opts?: { header?: string[]; gap?: number; indent?: number },
): void {
  const indent = " ".repeat(opts?.indent ?? 2);
  const gap = " ".repeat(opts?.gap ?? 2);
  const all = opts?.header ? [opts.header, ...rows] : rows;
  const cols = Math.max(0, ...all.map((r) => r.length));
  const widths: number[] = [];
  for (let i = 0; i < cols; i++) {
    widths[i] = Math.max(0, ...all.map((r) => visibleWidth(r[i] ?? "")));
  }
  const fmt = (cells: string[]): string =>
    indent +
    cells.map((cell, i) => padTo(cell ?? "", widths[i] ?? 0)).join(gap).trimEnd();

  if (opts?.header) {
    renderLine(c.bold(c.dim(fmt(opts.header))));
    const totalW =
      widths.reduce((a, b) => a + b, 0) + gap.length * Math.max(0, cols - 1);
    renderLine(c.dim(indent + "─".repeat(totalW)));
  }
  for (const r of rows) renderLine(fmt(r));
}

export function renderError(err: unknown): void {
  if (err instanceof OmlxApiError) {
    const msg = {
      error: true,
      status: err.status,
      path: err.path,
      detail: err.detail,
    };
    process.stderr.write(JSON.stringify(msg) + "\n");
  } else if (err instanceof Error) {
    process.stderr.write(c.red(`error: ${err.message}`) + "\n");
  } else {
    process.stderr.write(c.red(`error: ${String(err)}`) + "\n");
  }
}
