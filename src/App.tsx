import PreviewPane from "./shell/PreviewPane";
import StatusBar from "./shell/StatusBar";
import TopBar from "./shell/TopBar";
import WritingPane from "./shell/WritingPane";

const SHELL_FILE_NAME = "未命名.md";

export default function App() {
  return (
    <div class="app-shell">
      <TopBar fileName={SHELL_FILE_NAME} />

      <main class="workspace" aria-label="工作区">
        <WritingPane />
        <div class="workspace__splitter" aria-hidden="true" />
        <PreviewPane />
      </main>

      <StatusBar fileName={SHELL_FILE_NAME} words={0} pages={0} saveState="idle" />
    </div>
  );
}
