import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stringify as stringifyYaml } from "yaml";
import {
  extractFields,
  loadFzfConfig,
  loadFzfSettings,
  renderTemplate,
} from "./config.js";

describe("renderTemplate", () => {
  it("replaces {{selected}} placeholder", () => {
    expect(renderTemplate("Read {{selected}}", { selected: "foo.ts" })).toBe(
      "Read foo.ts",
    );
  });

  it("replaces multiple occurrences", () => {
    expect(
      renderTemplate("{{selected}} and {{selected}}", { selected: "x" }),
    ).toBe("x and x");
  });

  it("replaces named placeholders from extract groups", () => {
    expect(
      renderTemplate("{{name}} (@{{path}}:{{line}})", {
        selected: "foo  src/bar.ts:42",
        name: "foo",
        path: "src/bar.ts",
        line: "42",
      }),
    ).toBe("foo (@src/bar.ts:42)");
  });

  it("leaves unmatched placeholders as-is", () => {
    expect(
      renderTemplate("{{name}} {{unknown}}", {
        selected: "test",
        name: "foo",
      }),
    ).toBe("foo {{unknown}}");
  });

  it("returns template unchanged if no placeholder", () => {
    expect(renderTemplate("no placeholder", { selected: "ignored" })).toBe(
      "no placeholder",
    );
  });
});

describe("extractFields", () => {
  it("returns selected when no pattern", () => {
    const fields = extractFields("hello world");
    expect(fields).toEqual({ selected: "hello world" });
  });

  it("trims selected value", () => {
    const fields = extractFields("  hello  ");
    expect(fields).toEqual({ selected: "hello" });
  });

  it("extracts named capture groups", () => {
    const fields = extractFields(
      "MyClass.myMethod  src/foo.ts:42",
      "^(?<name>.+?)  (?<path>[^:]+):(?<line>\\d+)$",
    );
    expect(fields).toEqual({
      selected: "MyClass.myMethod  src/foo.ts:42",
      name: "MyClass.myMethod",
      path: "src/foo.ts",
      line: "42",
    });
  });

  it("extracts partial match", () => {
    const fields = extractFields(
      "OPEN  #123  Fix bug  @user",
      "#(?<number>\\d+)",
    );
    expect(fields).toEqual({
      selected: "OPEN  #123  Fix bug  @user",
      number: "123",
    });
  });

  it("returns only selected when pattern does not match", () => {
    const fields = extractFields("no match here", "^(?<num>\\d+)$");
    expect(fields).toEqual({ selected: "no match here" });
  });

  it("returns only selected when pattern has no named groups", () => {
    const fields = extractFields("abc123", "(\\d+)");
    expect(fields).toEqual({ selected: "abc123" });
  });
});

describe("loadFzfConfig", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `pi-fzf-test-${Date.now()}`);
    mkdirSync(join(testDir, ".pi"), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  function writeProjectConfig(config: object) {
    writeFileSync(join(testDir, ".pi", "fzf.yaml"), stringifyYaml(config));
  }

  it("loads commands from project config", () => {
    writeProjectConfig({
      commands: {
        test: { list: "ls", action: "Read {{selected}}" },
      },
    });

    const result = loadFzfConfig(testDir);
    const testCmd = result.find((c) => c.name === "test");

    expect(testCmd).toBeDefined();
    expect(testCmd).toMatchObject({
      name: "test",
      list: "ls",
      action: "Read {{selected}}",
    });
  });

  it("loads extract pattern", () => {
    writeProjectConfig({
      commands: {
        test: {
          list: "ls",
          action: "{{name}}",
          extract: "^(?<name>.+)$",
        },
      },
    });

    const result = loadFzfConfig(testDir);
    const testCmd = result.find((c) => c.name === "test");

    expect(testCmd?.extract).toBe("^(?<name>.+)$");
  });

  it("loads bash secondary action", () => {
    writeProjectConfig({
      commands: {
        test: {
          list: "ls",
          action: "{{selected}}",
          secondaryAction: {
            type: "bash",
            command: "open {{selected}}",
          },
        },
      },
    });

    const result = loadFzfConfig(testDir);
    const testCmd = result.find((c) => c.name === "test");

    expect(testCmd?.secondaryAction).toEqual({
      type: "bash",
      command: "open {{selected}}",
    });
  });

  it("loads event secondary action", () => {
    writeProjectConfig({
      commands: {
        test: {
          list: "ls",
          action: "{{selected}}",
          secondaryAction: {
            type: "event",
            event: "external-editor:open",
            args: { path: "{{selected}}" },
          },
        },
      },
    });

    const result = loadFzfConfig(testDir);
    const testCmd = result.find((c) => c.name === "test");

    expect(testCmd?.secondaryAction).toEqual({
      type: "event",
      event: "external-editor:open",
      args: { path: "{{selected}}" },
    });
  });

  it("loads multiple commands", () => {
    writeProjectConfig({
      commands: {
        foo: { list: "ls -a", action: "{{selected}}" },
        bar: { list: "git branch", action: "{{selected}}" },
      },
    });

    const result = loadFzfConfig(testDir);
    const names = result.map((c) => c.name);

    expect(names).toContain("foo");
    expect(names).toContain("bar");
  });

  it("handles invalid YAML gracefully", () => {
    writeFileSync(join(testDir, ".pi", "fzf.yaml"), "{{invalid yaml");

    // Should not throw, just skip invalid config
    const result = loadFzfConfig(testDir);
    expect(Array.isArray(result)).toBe(true);
  });

  it("handles missing commands key", () => {
    writeProjectConfig({ notCommands: {} });

    const result = loadFzfConfig(testDir);
    // Should not throw, may return global config only
    expect(Array.isArray(result)).toBe(true);
  });

  it("loads shortcut when specified", () => {
    writeProjectConfig({
      commands: {
        test: {
          list: "ls",
          action: "Read {{selected}}",
          shortcut: "ctrl+shift+f",
        },
      },
    });

    const result = loadFzfConfig(testDir);
    const testCmd = result.find((c) => c.name === "test");

    expect(testCmd).toBeDefined();
    expect(testCmd?.shortcut).toBe("ctrl+shift+f");
  });

  it("shortcut is undefined when not specified", () => {
    writeProjectConfig({
      commands: {
        test: { list: "ls", action: "Read {{selected}}" },
      },
    });

    const result = loadFzfConfig(testDir);
    const testCmd = result.find((c) => c.name === "test");

    expect(testCmd).toBeDefined();
    expect(testCmd?.shortcut).toBeUndefined();
  });

  it("loads preview command when specified", () => {
    writeProjectConfig({
      commands: {
        file: {
          list: "fd --type f",
          action: "Read {{selected}}",
          preview: "bat {{selected}}",
        },
      },
    });

    const result = loadFzfConfig(testDir);
    const fileCmd = result.find((c) => c.name === "file");

    expect(fileCmd).toBeDefined();
    expect(fileCmd?.preview).toBe("bat {{selected}}");
  });

  it("preview is undefined when not specified", () => {
    writeProjectConfig({
      commands: {
        test: { list: "ls", action: "Read {{selected}}" },
      },
    });

    const result = loadFzfConfig(testDir);
    const testCmd = result.find((c) => c.name === "test");

    expect(testCmd).toBeDefined();
    expect(testCmd?.preview).toBeUndefined();
  });

  it("loads selector placement when specified", () => {
    writeProjectConfig({
      commands: {
        test: {
          list: "ls",
          action: "Read {{selected}}",
          placement: "belowEditor",
        },
      },
    });

    const result = loadFzfConfig(testDir);
    const testCmd = result.find((c) => c.name === "test");

    expect(testCmd).toBeDefined();
    expect(testCmd?.placement).toBe("belowEditor");
  });

  it("defaults selector placement to overlay", () => {
    writeProjectConfig({
      commands: {
        test: {
          list: "ls",
          action: "Read {{selected}}",
        },
      },
    });

    const result = loadFzfConfig(testDir);
    const testCmd = result.find((c) => c.name === "test");

    expect(testCmd).toBeDefined();
    expect(testCmd?.placement).toBe("overlay");
  });

  it("supports explicit overlay placement", () => {
    writeProjectConfig({
      commands: {
        test: {
          list: "ls",
          action: "Read {{selected}}",
          placement: "overlay",
        },
      },
    });

    const result = loadFzfConfig(testDir);
    const testCmd = result.find((c) => c.name === "test");

    expect(testCmd).toBeDefined();
    expect(testCmd?.placement).toBe("overlay");
  });

  it("uses top-level defaultPlacement when command placement is omitted", () => {
    writeProjectConfig({
      defaultPlacement: "belowEditor",
      commands: {
        test: {
          list: "ls",
          action: "Read {{selected}}",
        },
      },
    });

    const result = loadFzfConfig(testDir);
    const testCmd = result.find((c) => c.name === "test");

    expect(testCmd).toBeDefined();
    expect(testCmd?.placement).toBe("belowEditor");
  });

  it("command placement overrides top-level defaultPlacement", () => {
    writeProjectConfig({
      defaultPlacement: "belowEditor",
      commands: {
        test: {
          list: "ls",
          action: "Read {{selected}}",
          placement: "aboveEditor",
        },
      },
    });

    const result = loadFzfConfig(testDir);
    const testCmd = result.find((c) => c.name === "test");

    expect(testCmd).toBeDefined();
    expect(testCmd?.placement).toBe("aboveEditor");
  });

  it("loads hideHeader when specified", () => {
    writeProjectConfig({
      commands: {
        test: {
          list: "ls",
          action: "Read {{selected}}",
          hideHeader: true,
        },
      },
    });

    const result = loadFzfConfig(testDir);
    const testCmd = result.find((c) => c.name === "test");

    expect(testCmd).toBeDefined();
    expect(testCmd?.hideHeader).toBe(true);
  });

  it("defaults hideHeader to false", () => {
    writeProjectConfig({
      commands: {
        test: {
          list: "ls",
          action: "Read {{selected}}",
        },
      },
    });

    const result = loadFzfConfig(testDir);
    const testCmd = result.find((c) => c.name === "test");

    expect(testCmd).toBeDefined();
    expect(testCmd?.hideHeader).toBe(false);
  });
});

describe("loadFzfSettings", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `pi-fzf-settings-test-${Date.now()}`);
    mkdirSync(join(testDir, ".pi"), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  function writeProjectConfig(config: object) {
    writeFileSync(join(testDir, ".pi", "fzf.yaml"), stringifyYaml(config));
  }

  it("returns default settings when no config exists", () => {
    const settings = loadFzfSettings(testDir);

    expect(settings.previewScrollUp).toBe("shift+up");
    expect(settings.previewScrollDown).toBe("shift+down");
    expect(settings.previewScrollLines).toBe(5);
    expect(settings.unboundCommandsShortcut).toBe("ctrl+/");
    expect(settings.unboundCommandsPlacement).toBe("belowEditor");
    expect(settings.secondaryActionKey).toBe("alt+enter");
  });

  it("loads custom keybindings from settings", () => {
    writeProjectConfig({
      commands: {},
      settings: {
        previewScrollUp: "alt+k",
        previewScrollDown: "alt+j",
      },
    });

    const settings = loadFzfSettings(testDir);

    expect(settings.previewScrollUp).toBe("alt+k");
    expect(settings.previewScrollDown).toBe("alt+j");
  });

  it("loads custom scroll lines from settings", () => {
    writeProjectConfig({
      commands: {},
      settings: {
        previewScrollLines: 10,
      },
    });

    const settings = loadFzfSettings(testDir);

    expect(settings.previewScrollLines).toBe(10);
  });

  it("loads custom secondary action key from settings", () => {
    writeProjectConfig({
      commands: {},
      settings: {
        secondaryActionKey: "ctrl+o",
      },
    });

    const settings = loadFzfSettings(testDir);

    expect(settings.secondaryActionKey).toBe("ctrl+o");
  });

  it("loads unbound command shortcut from settings", () => {
    writeProjectConfig({
      commands: {},
      settings: {
        unboundCommandsShortcut: "ctrl+/",
      },
    });

    const settings = loadFzfSettings(testDir);

    expect(settings.unboundCommandsShortcut).toBe("ctrl+/");
  });

  it("loads unbound command placement from settings", () => {
    writeProjectConfig({
      commands: {},
      settings: {
        unboundCommandsPlacement: "aboveEditor",
      },
    });

    const settings = loadFzfSettings(testDir);

    expect(settings.unboundCommandsPlacement).toBe("aboveEditor");
  });

  it("uses defaults for missing settings values", () => {
    writeProjectConfig({
      commands: {},
      settings: {
        previewScrollUp: "alt+p",
        // previewScrollDown and previewScrollLines not specified
      },
    });

    const settings = loadFzfSettings(testDir);

    expect(settings.previewScrollUp).toBe("alt+p");
    expect(settings.previewScrollDown).toBe("shift+down"); // default
    expect(settings.previewScrollLines).toBe(5); // default
  });

  it("handles empty settings object", () => {
    writeProjectConfig({
      commands: {},
      settings: {},
    });

    const settings = loadFzfSettings(testDir);

    expect(settings.previewScrollUp).toBe("shift+up");
    expect(settings.previewScrollDown).toBe("shift+down");
    expect(settings.previewScrollLines).toBe(5);
    expect(settings.unboundCommandsShortcut).toBe("ctrl+/");
    expect(settings.unboundCommandsPlacement).toBe("belowEditor");
    expect(settings.secondaryActionKey).toBe("alt+enter");
  });
});
