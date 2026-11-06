import { BrandMark, ExportIcon, OpenIcon, SaveIcon, SettingsIcon } from "./icons";

type TopBarProps = {
  fileName: string;
  canExport: boolean;
  onOpen: () => void;
  onSave: () => void;
  onExport: () => void;
  exporting: boolean;
  exportError?: string | null;
};

export default function TopBar(props: TopBarProps) {
  return (
    <header class="topbar">
      <div class="brand">
        <span class="brand__mark" aria-hidden="true">
          <BrandMark />
        </span>
        <span class="brand__name">墨页</span>
      </div>

      <span class="topbar__rule" aria-hidden="true" />

      <input
        class="doc-name"
        type="text"
        value={props.fileName}
        readonly
        spellcheck={false}
        aria-label="文件名"
      />

      <span class="topbar__spacer" aria-hidden="true" />

      <div class="topbar__actions">
        <button class="btn" type="button" title="打开" onClick={props.onOpen}>
          <OpenIcon />
          <span class="btn__label">打开</span>
        </button>

        <button class="btn" type="button" title="保存" onClick={props.onSave}>
          <SaveIcon />
          <span class="btn__label">保存</span>
        </button>

        <span class="topbar__rule" aria-hidden="true" />

        <button
          class="btn btn--primary"
          type="button"
          title={props.exportError ?? "导出 PDF"}
          data-action="export"
          aria-busy={props.exporting ? "true" : "false"}
          disabled={props.exporting || !props.canExport}
          onClick={() => props.onExport()}
        >
          <ExportIcon />
          <span class="btn__label">导出 PDF</span>
        </button>

        <button class="btn btn--icon" type="button" aria-label="设置" title="设置">
          <SettingsIcon />
        </button>
      </div>

      {props.exportError ? (
        <span class="visually-hidden" role="alert">
          {props.exportError}
        </span>
      ) : null}
    </header>
  );
}
