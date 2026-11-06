import { createSignal, onSettled, Show } from "solid-js";
import {
  WritingSession,
  type WritingState,
} from "../writing/session";
import InsertBar from "./InsertBar";

export interface WritingPaneProps {
  readonly hasDocument: boolean;
  readonly onState: (state: WritingState) => void;
  readonly onReady: (session: WritingSession | null) => void;
  readonly onExport: () => void;
}

export default function WritingPane(props: WritingPaneProps) {
  let host: HTMLDivElement | undefined;
  const [session, setSession] = createSignal<WritingSession | null>(null);

  onSettled(() => {
    const parent = host;
    if (!parent) return;
    const created = new WritingSession({
      host: parent,
      onState: props.onState,
      onExport: props.onExport,
    });
    setSession(created);
    props.onReady(created);
    return () => {
      props.onReady(null);
      setSession(null);
      created.destroy();
    };
  });

  return (
    <section
      id="writing-pane"
      class="writing-pane"
      data-region="writing"
      aria-label="写作面"
    >
      <Show when={props.hasDocument}>
        <InsertBar session={session} />
      </Show>

      <div class="writing-surface">
        <div class="writing-page">
          <div class="writing-host" ref={host} hidden={!props.hasDocument} />

          <Show when={!props.hasDocument}>
            <div class="writing-empty">
              <button
                class="btn writing-empty__action"
                type="button"
                onClick={() => {
                  void session()?.open();
                }}
              >
                打开文件
              </button>
              <button
                class="btn writing-empty__action"
                type="button"
                onClick={() => {
                  session()?.loadSample();
                }}
              >
                载入示例
              </button>
            </div>
          </Show>
        </div>
      </div>
    </section>
  );
}
