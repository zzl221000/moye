import { render } from "@solidjs/web";
import App from "./App";
import { ensureDocumentStyles, ensureRenderRuntime } from "./doc/runtime";
import "./styles/tokens.css";
import "./styles/shell.css";

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
  root.textContent = error instanceof Error ? error.message : "应用启动失败";
});
