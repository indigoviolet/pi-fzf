import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import type { FzfSecondaryAction } from "./config.js";
import { renderTemplate } from "./config.js";

/**
 * Execute the primary action: render the template and paste to editor.
 */
export function executePrimaryAction(
  actionTemplate: string,
  fields: Record<string, string>,
  ctx: ExtensionCommandContext,
): void {
  const rendered = renderTemplate(actionTemplate, fields);
  ctx.ui.pasteToEditor(rendered);
}

/**
 * Execute a secondary action (bash command or event emission).
 */
export async function executeSecondaryAction(
  action: FzfSecondaryAction,
  fields: Record<string, string>,
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<void> {
  switch (action.type) {
    case "bash": {
      const command = renderTemplate(action.command, fields);
      const result = await pi.exec("bash", ["-c", command]);
      if (result.code !== 0) {
        const error = (result.stderr || result.stdout).trim();
        ctx.ui.notify(`✗ Exit ${result.code}: ${error.slice(0, 100)}`, "error");
      } else {
        const output = result.stdout.trim();
        ctx.ui.notify(output ? `✓ ${output.slice(0, 100)}` : "✓ Done", "info");
      }
      break;
    }

    case "event": {
      const renderedArgs: Record<string, string> = {};
      for (const [key, value] of Object.entries(action.args)) {
        renderedArgs[key] = renderTemplate(value, fields);
      }
      pi.events.emit(action.event, { ...renderedArgs, cwd: ctx.cwd });
      break;
    }
  }
}
