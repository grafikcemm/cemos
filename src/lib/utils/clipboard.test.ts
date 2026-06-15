import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { copyToClipboard } from "./clipboard";

describe("copyToClipboard utility", () => {
  const originalNavigator = typeof navigator !== "undefined" ? navigator : undefined;
  const originalDocument = typeof document !== "undefined" ? document : undefined;
  const originalWindow = typeof window !== "undefined" ? window : undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        writable: true,
      });
    }
    if (originalDocument) {
      Object.defineProperty(globalThis, "document", {
        value: originalDocument,
        writable: true,
      });
    }
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        writable: true,
      });
    }
  });

  it("should return false if text is empty", async () => {
    const res = await copyToClipboard("");
    expect(res).toBe(false);
  });

  it("should use navigator.clipboard.writeText if available and successful", async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: {
        clipboard: {
          writeText: mockWriteText,
        },
      },
      writable: true,
      configurable: true,
    });

    const res = await copyToClipboard("hello text");
    expect(res).toBe(true);
    expect(mockWriteText).toHaveBeenCalledWith("hello text");
  });

  it("should fallback to document.execCommand if navigator.clipboard fails", async () => {
    const mockWriteText = vi.fn().mockRejectedValue(new Error("clipboard blocked"));
    Object.defineProperty(globalThis, "navigator", {
      value: {
        clipboard: {
          writeText: mockWriteText,
        },
      },
      writable: true,
      configurable: true,
    });

    const mockExecCommand = vi.fn().mockReturnValue(true);
    const mockAppendChild = vi.fn();
    const mockRemoveChild = vi.fn();
    const mockTextarea = {
      style: {},
      focus: vi.fn(),
      select: vi.fn(),
      value: "",
    };

    Object.defineProperty(globalThis, "document", {
      value: {
        createElement: vi.fn().mockReturnValue(mockTextarea),
        body: {
          appendChild: mockAppendChild,
          removeChild: mockRemoveChild,
        },
        execCommand: mockExecCommand,
      },
      writable: true,
      configurable: true,
    });

    const res = await copyToClipboard("hello text");
    expect(res).toBe(true);
    expect(mockWriteText).toHaveBeenCalledWith("hello text");
    expect(mockExecCommand).toHaveBeenCalledWith("copy");
    expect(mockTextarea.value).toBe("hello text");
  });

  it("should fallback to window.prompt if both navigator and execCommand fail", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      writable: true,
      configurable: true,
    });

    Object.defineProperty(globalThis, "document", {
      value: {
        createElement: vi.fn().mockImplementation(() => {
          throw new Error("createElement failed");
        }),
      },
      writable: true,
      configurable: true,
    });

    const mockPrompt = vi.fn().mockReturnValue("user response");
    Object.defineProperty(globalThis, "window", {
      value: {
        prompt: mockPrompt,
      },
      writable: true,
      configurable: true,
    });

    const res = await copyToClipboard("hello text");
    expect(res).toBe(true);
    expect(mockPrompt).toHaveBeenCalled();
  });
});
