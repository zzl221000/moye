import { describe, expect, it } from "vitest";
import { renderExportDocument } from "../src/doc/render";
import longMarkdown from "./fixtures/long.md?raw";
import mixedMarkdown from "./fixtures/mixed.md?raw";
import simpleMarkdown from "./fixtures/simple.md?raw";

const FIXTURES = [
  { name: "simple", markdown: simpleMarkdown },
  { name: "mixed", markdown: mixedMarkdown },
  { name: "long", markdown: longMarkdown },
] as const;

describe("renderExportDocument", () => {
  for (const fixture of FIXTURES) {
    it(`snapshots the ${fixture.name} fixture`, () => {
      const document = renderExportDocument(fixture.markdown);

      expect(document.html).toMatchSnapshot();
    });
  }

  it("returns the root structure and default theme the preview and export share", () => {
    const document = renderExportDocument(simpleMarkdown);
    const template = window.document.createElement("template");
    template.innerHTML = document.html;
    const article = template.content.firstElementChild;

    expect(article).toBeInstanceOf(HTMLElement);
    expect(article?.classList.contains("pdf-doc")).toBe(true);
    expect(document.theme).toBe("paper");
    expect(document.background).toBe("#ffffff");
    expect(document.title).toBe("会议纪要");
    expect(document.css).toBe("");
  });

  it("is deterministic for the same markdown and options", () => {
    const first = renderExportDocument(mixedMarkdown);
    const second = renderExportDocument(mixedMarkdown);

    expect(second).toEqual(first);
  });
});
