import { describe, expect, it } from "vitest";
import {
  buildCodeBlockInsertion,
  buildTableInsertion,
  fenceFor,
  IMAGE_PLACEHOLDER_URL,
  MAX_INLINE_IMAGE_BYTES,
  planImageInsertion,
  TABLE_TEMPLATE,
} from "../src/writing/insert";

describe("table insertion plan", () => {
  it("defaults to three columns and two body rows", () => {
    const plan = buildTableInsertion({ before: "", after: "", selected: "" });

    expect(plan.text).toBe(
      [
        "| 列 1 | 列 2 | 列 3 |",
        "| --- | --- | --- |",
        "|  |  |  |",
        "|  |  |  |",
      ].join("\n"),
    );
    expect(plan.text.slice(plan.selection.from, plan.selection.to)).toBe("列 1");
  });

  it("builds the chosen shape with one header, separator and body row each", () => {
    const plan = buildTableInsertion(
      { before: "", after: "", selected: "" },
      4,
      3,
    );
    const lines = plan.text.split("\n");

    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe("| 列 1 | 列 2 | 列 3 | 列 4 |");
    expect(lines[1]).toBe("| --- | --- | --- | --- |");
    expect(lines.slice(2)).toEqual([
      "|  |  |  |  |",
      "|  |  |  |  |",
      "|  |  |  |  |",
    ]);
    expect(plan.text.slice(plan.selection.from, plan.selection.to)).toBe("列 1");
  });

  it("clamps both directions to one through eight", () => {
    const small = buildTableInsertion(
      { before: "", after: "", selected: "" },
      0,
      0,
    );
    const large = buildTableInsertion(
      { before: "", after: "", selected: "" },
      99,
      99,
    );

    expect(small.text).toBe("| 列 1 |\n| --- |\n|  |");
    expect(large.text.split("\n")).toHaveLength(10);
    expect(large.text.split("\n")[0]).toBe(
      "| 列 1 | 列 2 | 列 3 | 列 4 | 列 5 | 列 6 | 列 7 | 列 8 |",
    );
    const emptyRows = large.text
      .split("\n")
      .filter((line) => line === "|  |  |  |  |  |  |  |  |");
    expect(emptyRows).toHaveLength(8);
  });

  it("keeps the first header label selected for immediate renaming", () => {
    const plan = buildTableInsertion(
      { before: "前文", after: "后文", selected: "" },
      5,
      4,
    );

    expect(plan.text.slice(plan.selection.from, plan.selection.to)).toBe("列 1");
    expect(plan.text.indexOf("列 1")).toBe(plan.selection.from);
  });

  it("replaces a non-empty selection and separates it from surrounding prose", () => {
    const plan = buildTableInsertion({
      before: "前文",
      after: "后文",
      selected: "旧内容",
    });

    expect(plan.text).toBe(`\n\n${TABLE_TEMPLATE}\n\n`);
    expect(plan.text).not.toContain("旧内容");
    expect(plan.selection).toEqual({ from: 4, to: 7 });
  });

  it("does not add blank lines that already exist", () => {
    const plan = buildTableInsertion({
      before: "前文\n\n",
      after: "\n\n后文",
      selected: "",
    });

    expect(plan.text).toBe(TABLE_TEMPLATE);
  });

  it("adds the missing half of a blank line on either side", () => {
    const plan = buildTableInsertion({
      before: "前文\n",
      after: "\n后文",
      selected: "",
    });

    expect(plan.text).toBe(`\n${TABLE_TEMPLATE}\n`);
  });
});

describe("code block insertion plan", () => {
  it("inserts an empty fence with the caret on its body line", () => {
    const plan = buildCodeBlockInsertion({
      before: "",
      after: "",
      selected: "",
    });

    expect(plan.text).toBe("```\n\n```");
    expect(plan.selection).toEqual({ from: 4, to: 4 });
  });

  it("wraps the selection and grows the fence beyond embedded runs", () => {
    const plan = buildCodeBlockInsertion({
      before: "",
      after: "",
      selected: "a\n```\nb",
    });

    expect(plan.text).toBe("````\na\n```\nb\n````");
    expect(plan.selection).toEqual({ from: 5, to: 5 });
  });

  it("separates the fence from surrounding prose", () => {
    const plan = buildCodeBlockInsertion({
      before: "前文",
      after: "后文",
      selected: "代码",
    });

    expect(plan.text).toBe("\n\n```\n代码\n```\n\n");
    expect(plan.selection).toEqual({ from: 6, to: 6 });
  });

  it("keeps a trailing newline inside the selection without doubling it", () => {
    const plan = buildCodeBlockInsertion({
      before: "",
      after: "",
      selected: "一\n二\n",
    });

    expect(plan.text).toBe("```\n一\n二\n```");
  });

  it("uses at least three backticks for content without runs", () => {
    expect(fenceFor("plain")).toBe("```");
    expect(fenceFor("a ` b")).toBe("```");
    expect(fenceFor("a ```` b")).toBe("`````");
  });
});

describe("image insertion plan", () => {
  it("inlines a supported image below the size limit", () => {
    const dataUrl = "data:image/png;base64,AAAA";

    expect(
      planImageInsertion(
        { name: "图 表.png", type: "image/png", size: 512 },
        dataUrl,
      ),
    ).toEqual({ alt: "图 表", url: dataUrl, inline: true });
  });

  it("infers a supported type from the file extension", () => {
    const dataUrl = "data:image/jpeg;base64,AAAA";

    expect(
      planImageInsertion({ name: "photo.JPG", type: "", size: 10 }, dataUrl),
    ).toEqual({ alt: "photo", url: dataUrl, inline: true });
  });

  it("falls back to a placeholder above the size limit", () => {
    const plan = planImageInsertion(
      {
        name: "大图.png",
        type: "image/png",
        size: MAX_INLINE_IMAGE_BYTES + 1,
      },
      "data:image/png;base64,AAAA",
    );

    expect(plan).toEqual({
      alt: "大图",
      url: IMAGE_PLACEHOLDER_URL,
      inline: false,
    });
  });

  it("falls back to a placeholder for unsupported, empty or mismatched files", () => {
    const svg = planImageInsertion(
      { name: "图.svg", type: "image/svg+xml", size: 10 },
      "data:image/svg+xml;base64,AAAA",
    );
    const empty = planImageInsertion(
      { name: "空.png", type: "image/png", size: 0 },
      "data:image/png;base64,AAAA",
    );
    const mismatch = planImageInsertion(
      { name: "图.png", type: "image/png", size: 10 },
      "data:image/gif;base64,AAAA",
    );

    expect(svg.inline).toBe(false);
    expect(empty.inline).toBe(false);
    expect(mismatch.inline).toBe(false);
    expect(svg.url).toBe(IMAGE_PLACEHOLDER_URL);
    expect(empty.url).toBe(IMAGE_PLACEHOLDER_URL);
    expect(mismatch.url).toBe(IMAGE_PLACEHOLDER_URL);
  });
});
