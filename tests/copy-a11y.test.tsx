import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { exportDocumentToPdf } from "../src/doc/export";
import { DRAFT_STORAGE_KEY } from "../src/writing/draft";
import mixedMarkdown from "./fixtures/mixed.md?raw";

// The export states are exercised without loading the dompdf runtime.
vi.mock("../src/doc/export", () => ({
  exportDocumentToPdf: vi.fn(() => Promise.reject(new Error("boom"))),
}));

const exportMock = vi.mocked(exportDocumentToPdf);

/**
 * Copy is enforced by shape, not by an allowlist of today's strings:
 *
 * 1. Visible explanatory sentences are deleted. The vocabulary and sentence
 *    punctuation below catch shortcut hints, feature descriptions and
 *    "how it works" prose without freezing individual labels.
 * 2. State and error text stay, but must be one actionable sentence. Errors
 *    carry an action marker (请) and no terminal punctuation.
 * 3. Auxiliary text (title, aria-label, comments, visually hidden nodes) is
 *    out of scope for the visible-copy scan.
 */
const EXPLANATORY_PATTERNS = [
  {
    rule: "shortcut hint",
    pattern: /(?:Ctrl|⌘|Cmd|Command|快捷键|shortcut)/i,
  },
  {
    rule: "feature description",
    pattern:
      /(?:支持|用于|可以|能够|只需|即可|无需|自动|不会|帮助|让你|帮你|以便)/,
  },
  {
    rule: "explanation",
    pattern:
      /(?:因为|所以|例如|比如|也就是|意味着|工作原理|使用方法|操作步骤|步骤如下|首先|然后|接着)/,
  },
  {
    rule: "sentence punctuation",
    pattern: /[。！？]/,
  },
] as const;

/** Labels and values are short; a longer visible string is a prose smell. */
const MAX_VISIBLE_TEXT_LENGTH = 24;

/** Placeholders may be examples, never instructions or explanations. */
const PLACEHOLDER_INSTRUCTION =
  /(?:请输入|例如|比如|如：|支持|用于|可以|能够|说明|提示|注意|请先|在此)/;
const EXAMPLE_VALUE =
  /^(?:https?:\/\/\S+|[^\s@]+@[^\s@]+\.[^\s@]+|[\p{L}\p{N}._/-]{1,20})$/u;

/** User document content and user values are not interface copy. */
const COPY_EXCLUSIONS =
  "script, style, .visually-hidden, [hidden], [aria-hidden='true'], " +
  ".preview-paper__content, .writing-host, .statusbar__file";
/** The preview is the user's document projection, not app chrome. */
const DOCUMENT_CONTENT = ".preview-paper__content";

let dispose: (() => void) | undefined;

function mount(): HTMLElement {
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => <App />, root);
  return root;
}

function unmount(): void {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
}

function seedDraft(content: string, name = "a11y.md"): void {
  localStorage.setItem(
    DRAFT_STORAGE_KEY,
    JSON.stringify({ name, content, at: Date.now() }),
  );
}

function tick(): Promise<void> {
  return new Promise((resolveTick) => setTimeout(resolveTick, 0));
}

function describeElement(element: Element): string {
  const id = element.id ? `#${element.id}` : "";
  const classes = [...element.classList].map((name) => `.${name}`).join("");
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

function visibleTexts(root: HTMLElement): Array<{ text: string; where: string }> {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: Array<{ text: string; where: string }> = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    const text = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!parent || text === "") continue;
    if (parent.closest(COPY_EXCLUSIONS)) continue;
    found.push({ text, where: describeElement(parent) });
  }
  return found;
}

/** Text of a label with any embedded control and its options removed. */
function labelText(label: HTMLLabelElement): string {
  const clone = label.cloneNode(true) as HTMLLabelElement;
  for (const control of clone.querySelectorAll(
    "input, select, textarea, button, option",
  )) {
    control.remove();
  }
  return clone.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function formControlName(control: HTMLElement): string {
  const labelledBy = control.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }

  const ariaLabel = control.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLSelectElement ||
    control instanceof HTMLTextAreaElement
  ) {
    const labels = Array.from(control.labels ?? []);
    const text = labels.map(labelText).filter(Boolean).join(" ");
    if (text) return text;
  }

  return "";
}

function accessibleName(element: HTMLElement): string {
  const ariaLabel = element.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement
  ) {
    const labels = Array.from(element.labels ?? []);
    const text = labels.map(labelText).filter(Boolean).join(" ");
    if (text) return text;
  }

  const visible = visibleTexts(element)
    .map(({ text }) => text)
    .join(" ")
    .trim();
  if (visible) return visible;

  return element.getAttribute("title")?.trim() ?? "";
}

function expectOneActionableSentence(text: string, where: string): void {
  expect(text.length, `${where}: empty error`).toBeGreaterThan(0);
  expect(
    text.length,
    `${where}: error is longer than one sentence (${JSON.stringify(text)})`,
  ).toBeLessThanOrEqual(MAX_VISIBLE_TEXT_LENGTH);
  expect(text, `${where}: error has terminal punctuation`).not.toMatch(
    /[。！？]/,
  );
  expect(text, `${where}: error has no action`).toContain("请");
  for (const { rule, pattern } of EXPLANATORY_PATTERNS) {
    expect(
      pattern.test(text),
      `${where}: ${rule} in error ${JSON.stringify(text)}`,
    ).toBe(false);
  }
}

type TokenMap = ReadonlyMap<string, string>;

function readTokens(): TokenMap {
  const css = readFileSync(
    resolve(process.cwd(), "src/styles/tokens.css"),
    "utf8",
  );
  const tokens = new Map<string, string>();
  const declaration = /--([a-z0-9-]+)\s*:\s*([^;]+);/g;
  for (const match of css.matchAll(declaration)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) {
      tokens.set(`--${name}`, value.trim().replace(/\s+/g, " "));
    }
  }
  return tokens;
}

function resolveToken(tokens: TokenMap, name: string): string {
  const value = tokens.get(name);
  if (!value) throw new Error(`missing token ${name}`);
  const reference = /^var\((--[a-z0-9-]+)\)$/.exec(value);
  return reference?.[1] ? resolveToken(tokens, reference[1]) : value;
}

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`expected a six-digit hex color, got ${hex}`);
  }
  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * (channels[0] ?? 0) +
    0.7152 * (channels[1] ?? 0) +
    0.0722 * (channels[2] ?? 0)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

describe("visible copy", () => {
  it("keeps the workbench to labels, values and one-line states", () => {
    seedDraft(mixedMarkdown);
    const root = mount();

    const texts = visibleTexts(root);
    expect(texts.length).toBeGreaterThan(10);

    for (const { text, where } of texts) {
      expect(
        text.length,
        `${where} is too long to be a label: ${JSON.stringify(text)}`,
      ).toBeLessThanOrEqual(MAX_VISIBLE_TEXT_LENGTH);
      for (const { rule, pattern } of EXPLANATORY_PATTERNS) {
        expect(
          pattern.test(text),
          `${where} contains a ${rule}: ${JSON.stringify(text)}`,
        ).toBe(false);
      }
    }
  });

  it("leaves the empty writing surface with exactly two actions", () => {
    const root = mount();
    const pane = root.querySelector<HTMLElement>('[data-region="writing"]');
    const empty = pane?.querySelector<HTMLElement>(".writing-empty");

    expect(empty).not.toBeNull();
    expect(root.querySelector(".writing-bar")).toBeNull();
    expect(root.querySelector(".writing-host")?.hasAttribute("hidden")).toBe(
      true,
    );

    const actions = Array.from(empty?.children ?? []);
    expect(actions).toHaveLength(2);
    expect(actions.every((action) => action.tagName === "BUTTON")).toBe(true);
    expect(
      actions.map((action) => action.textContent?.replace(/\s+/g, "")),
    ).toEqual(["打开文件", "载入示例"]);

    expect(
      visibleTexts(pane ?? root).map(({ text }) => text),
      "the empty writing surface contains prose besides its two actions",
    ).toEqual(["打开文件", "载入示例"]);
  });

  it("shows every error as one actionable sentence", async () => {
    seedDraft(mixedMarkdown);
    const root = mount();
    const dialog = root.querySelector<HTMLDialogElement>("#insert-link-dialog");
    const form = dialog?.querySelector("form");
    const input = dialog?.querySelector<HTMLInputElement>("#insert-link-url");

    expect(form).not.toBeNull();
    expect(input).not.toBeNull();

    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();

    const emptyError = dialog?.querySelector<HTMLElement>("#insert-link-error");
    expect(emptyError?.textContent?.trim()).toBe("请输入链接地址");
    expectOneActionableSentence(emptyError?.textContent ?? "", "link dialog");
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(input?.getAttribute("aria-describedby")).toBe("insert-link-error");

    if (input) {
      input.value = "javascript:alert(1)";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    // Solid 2 stages signal writes inside one interaction; let them commit
    // before the next submit reads the URL.
    await tick();
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();

    const invalidError = dialog?.querySelector<HTMLElement>("#insert-link-error");
    expect(invalidError?.textContent?.trim()).toBe("请输入有效的链接地址");
    expectOneActionableSentence(invalidError?.textContent ?? "", "link dialog");
  });
});

describe("accessibility", () => {
  it("gives every button a readable name", () => {
    seedDraft(mixedMarkdown);
    const root = mount();
    const buttons = Array.from(root.querySelectorAll("button")).filter(
      (button) => !button.closest(DOCUMENT_CONTENT),
    );

    expect(buttons.length).toBeGreaterThan(4);
    for (const button of buttons) {
      const name = accessibleName(button);
      expect(name, `${describeElement(button)} has no accessible name`).not.toBe(
        "",
      );
      if (visibleTexts(button).length === 0) {
        expect(
          button.getAttribute("aria-label") ??
            button.getAttribute("aria-labelledby"),
          `${describeElement(button)} is icon-only and needs aria-label or aria-labelledby`,
        ).toBeTruthy();
      }
    }
  });

  it("labels every form control", () => {
    seedDraft(mixedMarkdown);
    const root = mount();
    const controls = Array.from(
      root.querySelectorAll<HTMLElement>("input, select, textarea"),
    ).filter((control) => !control.closest(DOCUMENT_CONTENT));

    expect(controls.length).toBeGreaterThan(10);
    for (const control of controls) {
      expect(
        formControlName(control),
        `${describeElement(control)} has no label`,
      ).not.toBe("");
    }
  });

  it("advertises the link dialog from its trigger", () => {
    seedDraft(mixedMarkdown);
    const root = mount();
    const trigger = root.querySelector<HTMLButtonElement>(
      'button[aria-label="插入链接"]',
    );

    expect(trigger?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger?.getAttribute("aria-controls")).toBe("insert-link-dialog");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector("#insert-link-dialog")).not.toBeNull();
  });

  it("uses only example values as placeholders", () => {
    seedDraft(mixedMarkdown);
    const root = mount();
    const placeholders = Array.from(root.querySelectorAll<HTMLElement>("[placeholder]"));

    for (const element of placeholders) {
      const value = element.getAttribute("placeholder")?.trim() ?? "";
      const where = describeElement(element);
      expect(value, `${where} has an empty placeholder`).not.toBe("");
      expect(value, `${where} explains instead of giving an example`).not.toMatch(
        PLACEHOLDER_INSTRUCTION,
      );
      expect(value, `${where} is not an example value`).toMatch(EXAMPLE_VALUE);
    }
  });

  it("keeps muted text at WCAG AA contrast on every paper surface", () => {
    const tokens = readTokens();
    const text = resolveToken(tokens, "--moye-color-text-tertiary");
    const surfaces = [
      "--moye-color-surface-page",
      "--moye-color-surface-writing",
      "--moye-color-surface-chrome",
      "--moye-color-surface-subtle",
      "--moye-color-surface-canvas",
    ] as const;

    for (const surface of surfaces) {
      const ratio = contrastRatio(text, resolveToken(tokens, surface));
      expect(
        ratio,
        `muted text ${text} on ${surface} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps a keyboard focus ring on the writing surface", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/styles/writing.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.cm-content:focus-visible\s*\{[^}]*outline:\s*var\(--moye-focus-ring-width\)/s,
    );
  });

  it("shows a failed export as one visible actionable sentence", async () => {
    seedDraft(mixedMarkdown);
    const root = mount();
    const button = root.querySelector<HTMLButtonElement>('[data-action="export"]');
    expect(button?.hasAttribute("disabled")).toBe(false);

    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    button?.click();
    await tick();
    await tick();

    const alert = root.querySelector<HTMLElement>(".statusbar [role='alert']");
    expect(alert?.textContent?.trim()).toBe("导出失败，请重试");
    expect(alert?.closest(".visually-hidden")).toBeNull();
    expectOneActionableSentence(alert?.textContent ?? "", "export alert");
    expect(alert?.textContent).not.toContain("boom");
    expect(button?.title).toBe("导出 PDF（Ctrl/⌘ ⇧ E）");
    expect(
      errorLog.mock.calls.some(
        ([value]) => value instanceof Error && value.message === "boom",
      ),
      "the technical cause must stay in the console",
    ).toBe(true);
    errorLog.mockRestore();

    // A retry clears the sentence before it can fail or succeed again.
    exportMock.mockImplementationOnce(async () => ({
      blob: new Blob(),
      pages: 1,
      fileName: "mixed.pdf",
    }));
    button?.click();
    await tick();
    await tick();
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it("starts an export from the keyboard shortcut", async () => {
    seedDraft(mixedMarkdown);
    const root = mount();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "e",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await tick();
    await tick();

    expect(
      root.querySelector<HTMLElement>(".statusbar [role='alert']")
        ?.textContent,
    ).toBe("导出失败，请重试");
    expect(
      errorLog.mock.calls.some(
        ([value]) => value instanceof Error && value.message === "boom",
      ),
    ).toBe(true);
    errorLog.mockRestore();
  });

  it("shows real page progress while exporting", async () => {
    seedDraft(mixedMarkdown);
    const root = mount();
    const control: { finish?: () => void } = {};

    exportMock.mockImplementationOnce(
      (_document, _settings, onProgress) =>
        new Promise((resolveResult) => {
          onProgress?.({
            stage: "rendering",
            currentPage: 1,
            totalPages: 4,
          });
          control.finish = () => {
            resolveResult({
              blob: new Blob(),
              pages: 4,
              fileName: "mixed.pdf",
            });
          };
        }),
    );

    root.querySelector<HTMLButtonElement>('[data-action="export"]')?.click();
    await tick();

    const bar = root.querySelector<HTMLElement>('[role="progressbar"]');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute("aria-label")).toBe("导出进度");
    expect(bar?.getAttribute("aria-valuenow")).toBe("25");
    expect(bar?.closest(".topbar")).not.toBeNull();

    control.finish?.();
    await tick();
    await tick();
    expect(root.querySelector('[role="progressbar"]')).toBeNull();
  });
});
