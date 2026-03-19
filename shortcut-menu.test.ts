import { describe, expect, it } from "vitest";
import type { ResolvedCommand } from "./config.js";
import {
  buildShortcutMenuEntries,
  findCommandByShortcut,
  formatShortcutMenuLabel,
  getUnboundCommands,
  summarizeCommandList,
} from "./shortcut-menu.js";

function makeCommand(
  name: string,
  overrides: Partial<ResolvedCommand> = {},
): ResolvedCommand {
  return {
    name,
    list: `echo ${name}`,
    action: {
      type: "editor",
      template: "{{selected}}",
      output: "notify",
    },
    placement: "overlay",
    hideHeader: false,
    ...overrides,
  };
}

describe("shortcut menu helpers", () => {
  it("filters to commands without explicit shortcuts", () => {
    const commands = [
      makeCommand("file", { shortcut: "@" }),
      makeCommand("sym"),
      makeCommand("issue"),
    ];

    expect(getUnboundCommands(commands).map((cmd) => cmd.name)).toEqual([
      "sym",
      "issue",
    ]);
  });

  it("finds shortcut conflicts by exact shortcut string", () => {
    const commands = [
      makeCommand("file", { shortcut: "ctrl+f" }),
      makeCommand("sym"),
    ];

    expect(findCommandByShortcut(commands, "ctrl+f")?.name).toBe("file");
    expect(findCommandByShortcut(commands, "ctrl+shift+f")).toBeUndefined();
  });

  it("collapses multi-line list commands into a single summary", () => {
    const summary = summarizeCommandList(
      `ctags -R \\\n      --languages=TypeScript \\\n      -f - .`,
    );

    expect(summary).toBe("ctags -R \\ --languages=TypeScript \\ -f - .");
  });

  it("truncates long list summaries", () => {
    const summary = summarizeCommandList("x".repeat(80), 20);
    expect(summary).toBe("xxxxxxxxxxxxxxxxxxx…");
  });

  it("formats labels as name plus summary", () => {
    const command = makeCommand("file", {
      list: "fd --type f --max-depth 4",
    });

    expect(formatShortcutMenuLabel(command)).toBe(
      "file — fd --type f --max-depth 4",
    );
  });

  it("builds menu entries for only unbound commands", () => {
    const entries = buildShortcutMenuEntries([
      makeCommand("file", { shortcut: "@" }),
      makeCommand("sym", { list: "ctags -R --languages=TypeScript -f - ." }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      label: "sym — ctags -R --languages=TypeScript -f - .",
      command: { name: "sym" },
    });
  });
});
