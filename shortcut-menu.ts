import type { ResolvedCommand } from "./config.js";

const DEFAULT_SUMMARY_LENGTH = 60;

export interface ShortcutMenuEntry {
  command: ResolvedCommand;
  label: string;
}

export function getUnboundCommands(
  commands: ResolvedCommand[],
): ResolvedCommand[] {
  return commands.filter((cmd) => !cmd.shortcut);
}

export function findCommandByShortcut(
  commands: ResolvedCommand[],
  shortcut: string,
): ResolvedCommand | undefined {
  return commands.find((cmd) => cmd.shortcut === shortcut);
}

export function summarizeCommandList(
  list: string,
  maxLength = DEFAULT_SUMMARY_LENGTH,
): string {
  const collapsed = list.replace(/\s+/g, " ").trim();
  if (!collapsed) return "(no list command)";
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function formatShortcutMenuLabel(cmd: ResolvedCommand): string {
  return `${cmd.name} — ${summarizeCommandList(cmd.list)}`;
}

export function buildShortcutMenuEntries(
  commands: ResolvedCommand[],
): ShortcutMenuEntry[] {
  return getUnboundCommands(commands).map((command) => ({
    command,
    label: formatShortcutMenuLabel(command),
  }));
}
