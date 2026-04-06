import { renderTemplate } from "./config.js";

/**
 * Strip control characters that can corrupt terminal output.
 * Preserves tabs (replaced with spaces) and normal printable text.
 * Also preserves ANSI escape sequences (e.g. from syntax highlighters).
 *
 * Strips C0 control chars (U+0000–U+001A, U+001C–U+001F) and DEL (U+007F),
 * but keeps ESC (U+001B) so ANSI color sequences survive.
 */
// Built dynamically so Biome's noControlCharactersInRegex doesn't fire.
const cc = String.fromCharCode;
const CONTROL_CHAR_RE = new RegExp(
  `[${cc(0)}-${cc(0x1a)}${cc(0x1c)}-${cc(0x1f)}${cc(0x7f)}]`,
  "g",
);

function stripControlChars(line: string): string {
  return line.replace(/\t/g, "    ").replace(CONTROL_CHAR_RE, "");
}

export interface PreviewResult {
  lines: string[];
  error: string | null;
}

export type ExecFunction = (
  command: string,
  args: string[],
  options: { timeout: number },
) => Promise<{ code: number; stdout: string; stderr: string }>;

/**
 * Run a preview command and return the output lines or error.
 */
export async function runPreviewCommand(
  exec: ExecFunction,
  template: string,
  selected: string,
): Promise<PreviewResult> {
  const rendered = renderTemplate(template, { selected: selected.trim() });

  const result = await exec("bash", ["-c", rendered], { timeout: 5000 });

  if (result.code !== 0) {
    return {
      lines: [],
      error:
        (result.stderr || result.stdout).trim() || `Exit code ${result.code}`,
    };
  }

  // Detect binary content (null bytes — the classic heuristic used by git/grep/file)
  if (result.stdout.includes("\0")) {
    return {
      lines: ["(binary file)"],
      error: null,
    };
  }

  const lines = result.stdout
    .split("\n")
    .map((l) => stripControlChars(l.trimEnd()))
    .filter((l) => l.length > 0);

  return {
    lines,
    error: null,
  };
}
