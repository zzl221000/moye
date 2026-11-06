import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "../src/App";
import { OPTIONS_STORAGE_KEY } from "../src/doc/options";
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
      expect(name.readOnly).toBe(false);
    }

    expect(root.querySelectorAll(".topbar__actions button")).toHaveLength(4);
    expect(root.querySelector(".topbar")?.textContent).toContain("墨页");
    expect(
      root.querySelector('button[aria-label="打开"]')?.getAttribute("title"),
    ).toContain("Ctrl/⌘ O");
    expect(
      root.querySelector('button[aria-label="导出 PDF"]')?.getAttribute("title"),
    ).toContain("Ctrl/⌘ ⇧ E");

    const exportButton = root.querySelector('[data-action="export"]');
    expect(exportButton).toBeInstanceOf(HTMLButtonElement);
    expect(exportButton?.hasAttribute("disabled")).toBe(true);
  });

  it("renames the document through the writing session", async () => {
    seedDraft("# 文档\n", "初始.md");
    const root = mount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const name = root.querySelector<HTMLInputElement>(".doc-name");

    expect(name).not.toBeNull();
    if (!name) return;
    name.value = "季度报告";
    name.dispatchEvent(new Event("change", { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(name.value).toBe("季度报告.md");
    expect(root.querySelector(".statusbar")?.textContent).toContain(
      "季度报告.md",
    );
    expect(
      JSON.parse(localStorage.getItem("moye.draft.v1") ?? "{}"),
    ).toMatchObject({ name: "季度报告.md" });
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
    expect(status?.textContent).toContain("≈0 页");
  });

  it("restores a draft as a draft, not as a saved file", () => {
    seedDraft("# 草稿\n", "恢复.md");
    const root = mount();
    const status = root.querySelector(".statusbar");

    expect(status?.textContent).toContain("草稿");
    expect(status?.textContent).not.toContain("已保存");
  });

  it("keeps preview links out of the tab order because the projection is aria-hidden", async () => {
    seedDraft("[链接](https://example.com)\n", "链接.md");
    const root = mount();
    await Promise.resolve();

    const content = root.querySelector(".preview-paper__content");
    expect(content?.getAttribute("aria-hidden")).toBe("true");
    const link = content?.querySelector("a[href]");
    expect(link).toBeInstanceOf(HTMLAnchorElement);
    expect((link as HTMLAnchorElement).tabIndex).toBe(-1);
  });

  it("shows first-page bands from the resolved header and page number", async () => {
    seedDraft(mixedMarkdown, "bands.md");
    localStorage.setItem(
      OPTIONS_STORAGE_KEY,
      JSON.stringify({
        paper: "a4",
        margin: "36",
        title: "",
        footer: true,
        cover: false,
        h1Break: false,
        theme: "paper",
        background: "#ffffff",
        css: "",
      }),
    );
    const root = mount();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      root.querySelector('[data-preview-band="header"]')?.textContent?.trim(),
    ).toBe("混合结构基线");
    expect(
      root.querySelector('[data-preview-band="footer"]')?.textContent?.trim(),
    ).toBe("第 1 页");

    const cover = root.querySelector<HTMLInputElement>("#setting-cover");
    if (!cover) throw new Error("missing cover control");
    cover.checked = true;
    cover.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.querySelector('[data-preview-band="header"]')).toBeNull();
    expect(root.querySelector('[data-preview-band="footer"]')).toBeNull();
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

  it("offers paper, layout and document groups with labels only", () => {
    const root = mount();
    const panel = root.querySelector("#settings-dialog");

    expect(panel).toBeInstanceOf(HTMLDialogElement);
    expect(panel?.getAttribute("aria-labelledby")).toBe("settings-title");
    expect(
      Array.from(
        panel?.querySelectorAll(".settings-group__title") ?? [],
        (heading) => heading.textContent,
      ),
    ).toEqual(["纸张", "版式", "文档"]);

    expect(
      Array.from(
        panel?.querySelectorAll(
          ".settings-field__label, .settings-switch__label",
        ) ?? [],
        (label) => label.textContent,
      ),
    ).toEqual([
      "纸张",
      "页边距",
      "页眉标题",
      "页脚页码",
      "首页不显示页眉页脚",
      "每个一级标题另起一页",
      "文档主题",
      "页面背景",
      "细节 CSS",
      "压缩 PDF 体积",
    ]);

    const advanced = panel?.querySelector("details");
    expect(advanced?.querySelector("summary")?.textContent).toBe("高级");
    expect(advanced?.querySelector("#setting-custom-css")).not.toBeNull();
    expect(panel?.textContent).not.toContain("编辑模式");
    expect(panel?.textContent).not.toContain("同步滚动");
    expect(panel?.querySelectorAll("p")).toHaveLength(0);

    const trigger = root.querySelector('[data-action="settings"]');
    expect(trigger?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger?.getAttribute("aria-controls")).toBe("settings-dialog");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  });

  it("applies paper, margin, theme and H1 breaks to the preview and storage", async () => {
    localStorage.setItem(
      OPTIONS_STORAGE_KEY,
      JSON.stringify({
        paper: "a4",
        margin: "36",
        title: "",
        footer: true,
        cover: true,
        h1Break: false,
        theme: "paper",
        background: "#ffffff",
        css: "",
      }),
    );
    const root = mount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const preview = root.querySelector<HTMLElement>(".preview-paper");
    expect(preview?.style.getPropertyValue("--moye-preview-paper-width")).toBe(
      "794px",
    );

    const paper = root.querySelector<HTMLSelectElement>("#setting-paper");
    if (!paper) throw new Error("missing paper control");
    paper.value = "a4-landscape";
    paper.dispatchEvent(new Event("change", { bubbles: true }));

    const margin = root.querySelector<HTMLSelectElement>("#setting-margin");
    if (!margin) throw new Error("missing margin control");
    margin.value = "0";
    margin.dispatchEvent(new Event("change", { bubbles: true }));

    const theme = root.querySelector<HTMLSelectElement>("#setting-theme");
    if (!theme) throw new Error("missing theme control");
    theme.value = "editorial";
    theme.dispatchEvent(new Event("change", { bubbles: true }));

    const h1Break = root.querySelector<HTMLInputElement>("#setting-h1-break");
    if (!h1Break) throw new Error("missing H1 break control");
    h1Break.checked = true;
    h1Break.dispatchEvent(new Event("change", { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(preview?.style.getPropertyValue("--moye-preview-paper-width")).toBe(
      "1123px",
    );
    expect(preview?.style.getPropertyValue("--moye-preview-paper-height")).toBe(
      "794px",
    );
    expect(preview?.style.getPropertyValue("--moye-preview-paper-margin")).toBe(
      "0px",
    );
    expect(preview?.style.background).toBe("rgb(253, 251, 247)");
    expect(preview?.getAttribute("data-h1-break")).toBe("true");
    expect(root.querySelector("#docTheme")?.textContent).toContain(
      "--accent: #8a3b22",
    );

    const stored = JSON.parse(
      localStorage.getItem(OPTIONS_STORAGE_KEY) ?? "{}",
    ) as Record<string, unknown>;
    expect(stored).toMatchObject({
      paper: "a4-landscape",
      margin: "0",
      theme: "editorial",
      h1Break: true,
      background: "#fdfbf7",
    });
  });
});
