import { render } from "@solidjs/web";
import App from "./App";
import "./styles/tokens.css";
import "./styles/shell.css";

const root = document.getElementById("root");

if (!(root instanceof HTMLElement)) {
  throw new Error("Missing #root mount point");
}

render(() => <App />, root);
