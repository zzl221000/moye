import { CodeBlockIcon, ImageIcon, LinkIcon, TableIcon } from "./icons";

export default function WritingPane() {
  return (
    <section class="writing-pane" data-region="writing" aria-label="写作面">
      <div class="writing-bar" role="toolbar" aria-label="插入">
        <button class="icon-btn" type="button" aria-label="插入链接" title="插入链接">
          <LinkIcon />
        </button>
        <button class="icon-btn" type="button" aria-label="插入图片" title="插入图片">
          <ImageIcon />
        </button>
        <button class="icon-btn" type="button" aria-label="插入表格" title="插入表格">
          <TableIcon />
        </button>
        <button class="icon-btn" type="button" aria-label="插入代码块" title="插入代码块">
          <CodeBlockIcon />
        </button>
      </div>

      <div class="writing-surface">
        <div class="writing-page">
          <span class="writing-caret" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
