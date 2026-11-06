import type { SaveState } from "../writing/session";

export type { SaveState };

type StatusBarProps = {
  fileName: string;
  /** Non-whitespace characters in the current Markdown source. */
  characters: number;
  /** Page count from the current dompdf snapshot, or an estimate when absent. */
  pages: number;
  /** True only while `pages` came from a current snapshot. */
  pagesExact: boolean;
  saveState: SaveState;
  /** One actionable sentence; cleared by the shell when an export retries. */
  exportError?: string | null;
};

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "未保存",
  saved: "已保存",
  dirty: "未保存",
  error: "保存失败，请重试",
};

export default function StatusBar(props: StatusBarProps) {
  return (
    <footer class="statusbar" aria-label="状态栏">
      <span class="statusbar__group" role="status">
        <span class="statusbar__dot" data-state={props.saveState} aria-hidden="true" />
        <span>{SAVE_LABEL[props.saveState]}</span>
      </span>

      <span class="statusbar__rule" aria-hidden="true" />

      <span class="statusbar__file">{props.fileName}</span>

      {props.exportError ? (
        <span class="statusbar__error" role="alert">
          {props.exportError}
        </span>
      ) : null}

      <span class="statusbar__spacer" aria-hidden="true" />

      <span class="statusbar__meta">{props.characters} 字</span>
      <span class="statusbar__meta">
        {props.pagesExact ? `${props.pages} 页` : `≈${props.pages} 页`}
      </span>
    </footer>
  );
}
