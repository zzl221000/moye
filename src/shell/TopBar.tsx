import { Show } from "solid-js";
import { BrandMark, ExportIcon, OpenIcon, SaveIcon, SettingsIcon } from "./icons";

type TopBarProps = {
  fileName: string;
  canExport: boolean;
  onOpen: () => void;
  onSave: () => void;
  onRename: (name: string) => void;
  onExport: () => void;
  onSettings: () => void;
  onSettingsButton: (button: HTMLButtonElement) => void;
  settingsOpen: boolean;
  exporting: boolean;
  /** 0–1 while pages render; null while the engine is still measuring. */
  exportProgress: number | null;
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
        title="文件名"
        spellcheck={false}
        aria-label="文件名"
        onChange={(event) => {
          props.onRename(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          event.currentTarget.blur();
        }}
      />

      <span class="topbar__spacer" aria-hidden="true" />

      <div class="topbar__actions">
        <button
          class="btn"
          type="button"
          aria-label="打开"
          title="打开（Ctrl/⌘ O）"
          aria-keyshortcuts="Control+O Meta+O"
          onClick={props.onOpen}
        >
          <OpenIcon />
          <span class="btn__label">打开</span>
        </button>

        <button
          class="btn"
          type="button"
          aria-label="保存"
          title="保存（Ctrl/⌘ S），另存为（Ctrl/⌘ ⇧ S）"
          aria-keyshortcuts="Control+S Meta+S Control+Shift+S Meta+Shift+S"
          onClick={props.onSave}
        >
          <SaveIcon />
          <span class="btn__label">保存</span>
        </button>

        <span class="topbar__rule" aria-hidden="true" />

        <button
          class="btn btn--primary"
          type="button"
          aria-label="导出 PDF"
          title="导出 PDF（Ctrl/⌘ ⇧ E）"
          aria-keyshortcuts="Control+Shift+E Meta+Shift+E"
          data-action="export"
          aria-busy={props.exporting ? "true" : "false"}
          disabled={props.exporting || !props.canExport}
          onClick={() => props.onExport()}
        >
          <ExportIcon />
          <span class="btn__label">导出 PDF</span>
        </button>

        <button
          class="btn btn--icon"
          type="button"
          data-action="settings"
          aria-label="设置"
          title="设置"
          aria-haspopup="dialog"
          aria-controls="settings-dialog"
          aria-expanded={props.settingsOpen ? "true" : "false"}
          ref={(button) => props.onSettingsButton(button)}
          onClick={props.onSettings}
        >
          <SettingsIcon />
        </button>
      </div>

      <Show when={props.exporting}>
        <div
          class="export-progress"
          role="progressbar"
          aria-label="导出进度"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={
            props.exportProgress === null
              ? undefined
              : Math.round(props.exportProgress * 100)
          }
          data-indeterminate={
            props.exportProgress === null ? "true" : undefined
          }
        >
          <span
            class="export-progress__bar"
            style={
              props.exportProgress === null
                ? undefined
                : { width: `${Math.round(props.exportProgress * 100)}%` }
            }
          />
        </div>
      </Show>
    </header>
  );
}
