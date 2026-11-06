import type { SaveState } from "../writing/session";

export type { SaveState };

type StatusBarProps = {
  fileName: string;
  words: number;
  pages: number;
  saveState: SaveState;
};

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "未保存",
  saved: "已保存",
  dirty: "未保存",
  error: "保存失败",
};

export default function StatusBar(props: StatusBarProps) {
  return (
    <footer class="statusbar" aria-label="状态栏">
      <span class="statusbar__group">
        <span class="statusbar__dot" data-state={props.saveState} aria-hidden="true" />
        <span>{SAVE_LABEL[props.saveState]}</span>
      </span>

      <span class="statusbar__rule" aria-hidden="true" />

      <span class="statusbar__file">{props.fileName}</span>

      <span class="statusbar__spacer" aria-hidden="true" />

      <span class="statusbar__meta">{props.words} 字</span>
      <span class="statusbar__meta">{props.pages} 页</span>
    </footer>
  );
}
