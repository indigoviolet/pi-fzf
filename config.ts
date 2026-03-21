import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

// --- Types ---

export type SelectorPlacement = "overlay" | "aboveEditor" | "belowEditor";

export interface FzfSecondaryActionBash {
  type: "bash";
  command: string;
}

export interface FzfSecondaryActionEvent {
  type: "event";
  event: string;
  args: Record<string, string>;
}

export type FzfSecondaryAction =
  | FzfSecondaryActionBash
  | FzfSecondaryActionEvent;

export interface FzfCacheConfig {
  /** bkt TTL duration (e.g. "5m", "10m") */
  ttl: string;
  /** Duration after which the result is refreshed in the background (e.g. "2m") */
  stale?: string;
  /** Include cwd in the cache key (default: true) */
  cwd?: boolean;
}

export interface FzfCommandConfig {
  /** Bash command that outputs candidates, one per line */
  list: string;
  /** Template string pasted to editor on select (supports {{selected}} and extract groups) */
  action: string;
  /** Regex with named capture groups to extract fields from selected line */
  extract?: string;
  /** Secondary action triggered by alt+enter (bash command or event) */
  secondaryAction?: FzfSecondaryAction;
  /** Optional keyboard shortcut (e.g. "ctrl+shift+f") */
  shortcut?: string;
  /** Optional preview command (receives {{selected}} placeholder) */
  preview?: string;
  /** Where the selector should render (default: "overlay") */
  placement?: SelectorPlacement;
  /** Hide selector header/title line (defaults to false) */
  hideHeader?: boolean;
  /** Cache list output via bkt */
  cache?: FzfCacheConfig;
}

export interface FzfSettingsConfig {
  /** Keybinding for scrolling preview up (default: "shift+up") */
  previewScrollUp?: string;
  /** Keybinding for scrolling preview down (default: "shift+down") */
  previewScrollDown?: string;
  /** Number of lines to scroll at a time (default: 5) */
  previewScrollLines?: number;
  /** Optional shortcut that opens a picker of commands without explicit shortcuts */
  unboundCommandsShortcut?: string;
  /** Placement for the unbound-commands picker (default: "belowEditor") */
  unboundCommandsPlacement?: SelectorPlacement;
  /** Keybinding for secondary action (default: "alt+enter") */
  secondaryActionKey?: string;
}

export interface FzfConfig {
  /** Default placement for selector widgets (can be overridden per command) */
  defaultPlacement?: SelectorPlacement;
  commands: Record<string, FzfCommandConfig>;
  settings?: FzfSettingsConfig;
}

// --- Normalized types (resolved after parsing) ---

export interface ResolvedCommand {
  name: string;
  list: string;
  /** Template string pasted to editor on select */
  action: string;
  /** Regex with named capture groups to extract fields from selected line */
  extract?: string;
  /** Secondary action triggered by alt+enter */
  secondaryAction?: FzfSecondaryAction;
  /** Optional keyboard shortcut (e.g. "ctrl+shift+f") */
  shortcut?: string;
  /** Optional preview command (receives {{selected}} placeholder) */
  preview?: string;
  /** Where the selector widget should render */
  placement: SelectorPlacement;
  /** Hide selector header/title line */
  hideHeader: boolean;
  /** Cache list output via bkt */
  cache?: FzfCacheConfig;
}

export interface FzfSettings {
  /** Keybinding for scrolling preview up */
  previewScrollUp: string;
  /** Keybinding for scrolling preview down */
  previewScrollDown: string;
  /** Number of lines to scroll at a time */
  previewScrollLines: number;
  /** Optional shortcut that opens a picker of commands without explicit shortcuts */
  unboundCommandsShortcut?: string;
  /** Placement for the unbound-commands picker */
  unboundCommandsPlacement: SelectorPlacement;
  /** Keybinding for secondary action */
  secondaryActionKey: string;
}

const DEFAULT_SETTINGS: FzfSettings = {
  previewScrollUp: "shift+up",
  previewScrollDown: "shift+down",
  previewScrollLines: 5,
  unboundCommandsShortcut: "ctrl+/",
  unboundCommandsPlacement: "belowEditor",
  secondaryActionKey: "alt+enter",
};

// --- Config loading ---

function loadConfigFile(path: string): FzfConfig | null {
  if (!existsSync(path)) return null;
  try {
    const content = readFileSync(path, "utf-8");
    const parsed = parseYaml(content);
    if (parsed && typeof parsed === "object" && parsed.commands) {
      return parsed as FzfConfig;
    }
    return null;
  } catch (err) {
    console.error(`pi-fzf: Failed to load config from ${path}: ${err}`);
    return null;
  }
}

/**
 * Load and merge fzf configs from global and project-local locations.
 * Project-local commands override global commands with the same name.
 */
export function loadFzfConfig(cwd: string): ResolvedCommand[] {
  const globalPath = join(homedir(), ".pi", "agent", "fzf.yaml");
  const projectPath = join(cwd, ".pi", "fzf.yaml");

  const globalConfig = loadConfigFile(globalPath);
  const projectConfig = loadConfigFile(projectPath);

  // Merge: project overrides global for same-named commands
  const merged: Record<string, FzfCommandConfig> = {
    ...(globalConfig?.commands ?? {}),
    ...(projectConfig?.commands ?? {}),
  };

  // Placement precedence: command > project default > global default > hard default
  const defaultPlacement: SelectorPlacement =
    projectConfig?.defaultPlacement ??
    globalConfig?.defaultPlacement ??
    "overlay";

  return Object.entries(merged).map(([name, cmd]) => ({
    name,
    list: cmd.list,
    action: cmd.action,
    extract: cmd.extract,
    secondaryAction: cmd.secondaryAction,
    shortcut: cmd.shortcut,
    preview: cmd.preview,
    placement: cmd.placement ?? defaultPlacement,
    hideHeader: cmd.hideHeader ?? false,
    cache: cmd.cache,
  }));
}

/**
 * Load fzf settings from global and project-local configs.
 * Project-local settings override global settings.
 */
export function loadFzfSettings(cwd: string): FzfSettings {
  const globalPath = join(homedir(), ".pi", "agent", "fzf.yaml");
  const projectPath = join(cwd, ".pi", "fzf.yaml");

  const globalConfig = loadConfigFile(globalPath);
  const projectConfig = loadConfigFile(projectPath);

  // Merge settings: project overrides global
  const globalSettings = globalConfig?.settings ?? {};
  const projectSettings = projectConfig?.settings ?? {};

  return {
    previewScrollUp:
      projectSettings.previewScrollUp ??
      globalSettings.previewScrollUp ??
      DEFAULT_SETTINGS.previewScrollUp,
    previewScrollDown:
      projectSettings.previewScrollDown ??
      globalSettings.previewScrollDown ??
      DEFAULT_SETTINGS.previewScrollDown,
    previewScrollLines:
      projectSettings.previewScrollLines ??
      globalSettings.previewScrollLines ??
      DEFAULT_SETTINGS.previewScrollLines,
    unboundCommandsShortcut:
      projectSettings.unboundCommandsShortcut ??
      globalSettings.unboundCommandsShortcut ??
      DEFAULT_SETTINGS.unboundCommandsShortcut,
    unboundCommandsPlacement:
      projectSettings.unboundCommandsPlacement ??
      globalSettings.unboundCommandsPlacement ??
      DEFAULT_SETTINGS.unboundCommandsPlacement,
    secondaryActionKey:
      projectSettings.secondaryActionKey ??
      globalSettings.secondaryActionKey ??
      DEFAULT_SETTINGS.secondaryActionKey,
  };
}

/**
 * Extract named fields from a selected line using a regex pattern.
 * Always includes `selected` (the full raw line).
 * Named capture groups become additional fields.
 */
export function extractFields(
  selected: string,
  pattern?: string,
): Record<string, string> {
  const fields: Record<string, string> = { selected: selected.trim() };
  if (!pattern) return fields;

  const match = new RegExp(pattern).exec(selected);
  if (match?.groups) {
    for (const [key, value] of Object.entries(match.groups)) {
      if (value !== undefined) {
        fields[key] = value;
      }
    }
  }
  return fields;
}

/**
 * Replace {{placeholder}} references in a template with field values.
 * Unmatched placeholders are left as-is.
 */
export function renderTemplate(
  template: string,
  fields: Record<string, string>,
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (match, key) => fields[key] ?? match,
  );
}
