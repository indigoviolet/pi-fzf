import { describe, expect, it, vi } from "vitest";
import { runPreviewCommand } from "./preview.js";

describe("runPreviewCommand", () => {
  it("returns command output split by lines", async () => {
    const mockExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: "line1\nline2\nline3",
      stderr: "",
    });

    const result = await runPreviewCommand(
      mockExec,
      "echo {{selected}}",
      "test.txt",
    );

    expect(mockExec).toHaveBeenCalledWith("bash", ["-c", "echo test.txt"], {
      timeout: 5000,
    });
    expect(result).toEqual({
      lines: ["line1", "line2", "line3"],
      error: null,
    });
  });

  it("substitutes {{selected}} placeholder", async () => {
    const mockExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: "content",
      stderr: "",
    });

    await runPreviewCommand(mockExec, "cat {{selected}}", "path/to/file.ts");

    expect(mockExec).toHaveBeenCalledWith(
      "bash",
      ["-c", "cat path/to/file.ts"],
      { timeout: 5000 },
    );
  });

  it("trims whitespace from selected value", async () => {
    const mockExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: "ok",
      stderr: "",
    });

    await runPreviewCommand(mockExec, "cat {{selected}}", "  file.ts  ");

    expect(mockExec).toHaveBeenCalledWith("bash", ["-c", "cat file.ts"], {
      timeout: 5000,
    });
  });

  it("returns error when command fails", async () => {
    const mockExec = vi.fn().mockResolvedValue({
      code: 1,
      stdout: "",
      stderr: "file not found",
    });

    const result = await runPreviewCommand(
      mockExec,
      "cat {{selected}}",
      "missing.txt",
    );

    expect(result).toEqual({
      lines: [],
      error: "file not found",
    });
  });

  it("returns stdout as error when stderr is empty", async () => {
    const mockExec = vi.fn().mockResolvedValue({
      code: 1,
      stdout: "something went wrong",
      stderr: "",
    });

    const result = await runPreviewCommand(mockExec, "cmd", "arg");

    expect(result).toEqual({
      lines: [],
      error: "something went wrong",
    });
  });

  it("returns timeout error when command times out", async () => {
    const mockExec = vi.fn().mockResolvedValue({
      code: 124, // timeout exit code
      stdout: "",
      stderr: "command timed out",
    });

    const result = await runPreviewCommand(mockExec, "sleep 100", "arg");

    expect(result).toEqual({
      lines: [],
      error: "command timed out",
    });
  });

  it("returns empty lines array for empty output", async () => {
    const mockExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: "",
      stderr: "",
    });

    const result = await runPreviewCommand(mockExec, "true", "arg");

    expect(result).toEqual({
      lines: [],
      error: null,
    });
  });

  it("filters out empty lines from output", async () => {
    const mockExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: "line1\n\nline2\n\n",
      stderr: "",
    });

    const result = await runPreviewCommand(mockExec, "echo", "arg");

    expect(result).toEqual({
      lines: ["line1", "line2"],
      error: null,
    });
  });
});
