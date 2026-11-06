import { render } from "@solidjs/web";
import App from "./App";
import { ensureDocumentStyles, ensureRenderRuntime } from "./doc/runtime";
import "./styles/tokens.css";
import "./styles/shell.css";
import "./styles/settings.css";
import "./styles/writing.css";

const root = document.getElementById("root");

if (!(root instanceof HTMLElement)) {
  throw new Error("Missing #root mount point");
}

async function bootstrap(mount: HTMLElement): Promise<void> {
  await Promise.all([ensureDocumentStyles(), ensureRenderRuntime()]);
  render(() => <App />, mount);
}

bootstrap(root).catch((error: unknown) => {
  console.error(error);
  root.textContent = "应用启动失败，请刷新页面";
});
