import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "../src/App";
import { SPLIT_STORAGE_KEY } from "../src/shell/split";
import { countCharacters } from "../src/writing/count";
import { DRAFT_STORAGE_KEY } from "../src/writing/draft";
import mixedMarkdown from "./fixtures/mixed.md?raw";

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

function seedDraft(content: string, name = "草稿.md"): void {
  localStorage.setItem(
    DRAFT_STORAGE_KEY,
    JSON.stringify({ name, content, at: Date.now() }),
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  unmount();
});

describe("墨页 shell", () => {
  it("frames the workbench with a top bar, two panes and a status bar", () => {
    const root = mount();

    expect(root.querySelector("header.topbar")).not.toBeNull();
    expect(root.querySelector('main.workspace')).not.toBeNull();
    expect(root.querySelector('section[data-region="writing"]')).not.toBeNull();
    expect(root.querySelector('section[data-region="preview"]')).not.toBeNull();
    expect(root.querySelector("footer.statusbar")).not.toBeNull();
  });

  it("keeps the top bar to the document name and four actions", () => {
    const root = mount();
    const name = root.querySelector(".doc-name");

    expect(name).toBeInstanceOf(HTMLInputElement);
    if (name instanceof HTMLInputElement) {
      expect(name.value).toBe("未命名.md");
      expect(name.readOnly).toBe(true);
    }

    expect(root.querySelectorAll(".topbar__actions button")).toHaveLength(4);
    expect(root.querySelector(".topbar")?.textContent).toContain("墨页");

    const exportButton = root.querySelector('[data-action="export"]');
    expect(exportButton).toBeInstanceOf(HTMLButtonElement);
    expect(exportButton?.hasAttribute("disabled")).toBe(true);
  });

  it("opens on an empty writing surface with exactly two actions", () => {
    const root = mount();
    const labels = Array.from(
      root.querySelectorAll(".writing-empty button"),
      (button) => button.textContent?.trim(),
    );

    expect(labels).toEqual(["打开文件", "载入示例"]);
    expect(root.querySelector(".writing-bar")).toBeNull();
    expect(root.querySelector(".writing-host")?.hasAttribute("hidden")).toBe(
      true,
    );
  });

  it("reports save state, file name, characters and pages in the status bar", () => {
    const root = mount();
    const status = root.querySelector(".statusbar");

    expect(status?.textContent).toContain("未保存");
    expect(status?.textContent).toContain("未命名.md");
    expect(status?.textContent).toContain("0 字");
    expect(status?.textContent).toContain("0 页");
  });

  it("shows an A4-shaped paper in the preview pane", () => {
    const root = mount();

    expect(root.querySelector(".preview-paper")).not.toBeNull();
  });

  it("renders the restored draft into the preview through the shared seam", () => {
    seedDraft(mixedMarkdown, "mixed.md");
    const root = mount();
    const document = root.querySelector(".preview-paper .pdf-doc");

    expect(document?.querySelector("h1")?.textContent).toBe("混合结构基线");
    expect(document?.querySelector("table")).not.toBeNull();
    expect(document?.querySelector("img")?.getAttribute("src")).toBe(
      "assets/block.png",
    );
    expect(root.querySelector('[data-action="export"]')).not.toBeNull();
    expect(
      root.querySelector('[data-action="export"]')?.hasAttribute("disabled"),
    ).toBe(false);
  });

  it("counts the current document in the status bar", () => {
    seedDraft("# 标题\n\n中文 ABC", "计数.md");
    const root = mount();
    const status = root.querySelector(".statusbar");

    expect(status?.textContent).toContain("计数.md");
    expect(status?.textContent).toContain(
      `${countCharacters("# 标题\n\n中文 ABC")} 字`,
    );
  });

  it("exposes a keyboard-operable separator and remembers the split", async () => {
    const root = mount();
    const handle = root.querySelector<HTMLElement>('[role="separator"]');

    expect(handle).toBeInstanceOf(HTMLElement);
    expect(handle?.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle?.getAttribute("aria-valuemin")).toBe("30");
    expect(handle?.getAttribute("aria-valuemax")).toBe("70");
    expect(handle?.getAttribute("aria-valuenow")).toBe("50");
    expect(handle?.getAttribute("aria-controls")).toBe(
      "writing-pane preview-pane",
    );
    expect(handle?.tabIndex).toBe(0);

    handle?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handle?.getAttribute("aria-valuenow")).toBe("52");
    expect(localStorage.getItem(SPLIT_STORAGE_KEY)).toBe("0.52");

    unmount();
    const remounted = mount();
    expect(
      remounted
        .querySelector('[role="separator"]')
        ?.getAttribute("aria-valuenow"),
    ).toBe("52");
  });
});
