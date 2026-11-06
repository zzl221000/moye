import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "../src/App";

let dispose: (() => void) | undefined;

function mount(): HTMLElement {
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => <App />, root);
  return root;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
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

  it("reports save state, file name, words and pages in the status bar", () => {
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

  it("renders the fixed mixed fixture into the preview through the shared seam", () => {
    const root = mount();
    const document = root.querySelector(".preview-paper .pdf-doc");

    expect(document?.querySelector("h1")?.textContent).toBe("混合结构基线");
    expect(document?.querySelector("table")).not.toBeNull();
    expect(document?.querySelector("img")?.getAttribute("src")).toBe("assets/block.png");
    expect(root.querySelector('[data-action="export"]')).not.toBeNull();
  });
});
