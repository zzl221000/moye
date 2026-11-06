import { isSafeDestination } from "@quirekit/msfe-core";
import { createEffect, createSignal, Show } from "solid-js";
import type { WritingSession } from "../writing/session";
import { CodeBlockIcon, ImageIcon, LinkIcon, TableIcon } from "./icons";

export interface InsertBarProps {
  /** Reads the mounted session lazily; it is created after the first render. */
  readonly session: () => WritingSession | null;
}

export default function InsertBar(props: InsertBarProps) {
  const [linkOpen, setLinkOpen] = createSignal(false);
  const [url, setUrl] = createSignal("");
  const [linkError, setLinkError] = createSignal<string | null>(null);

  let dialog: HTMLDialogElement | undefined;
  let urlInput: HTMLInputElement | undefined;

  createEffect(
    () => linkOpen(),
    (open) => {
      if (!open) {
        if (dialog?.open) dialog.close();
        return;
      }
      if (!dialog?.open) {
        try {
          dialog?.showModal();
        } catch (error) {
          console.error("[moye] 无法打开链接对话框", error);
        }
      }
      queueMicrotask(() => {
        urlInput?.focus();
        urlInput?.select();
      });
    },
  );

  function openLinkPrompt(): void {
    setUrl("");
    setLinkError(null);
    setLinkOpen(true);
  }

  function closeLinkPrompt(): void {
    if (dialog?.open) dialog.close();
    setLinkOpen(false);
    setLinkError(null);
    queueMicrotask(() => {
      props.session()?.focus();
    });
  }

  function submitLink(event: SubmitEvent): void {
    event.preventDefault();
    const value = url().trim();
    if (value.length === 0) {
      setLinkError("请输入链接地址");
      return;
    }
    if (!isSafeDestination(value)) {
      setLinkError("链接地址无效");
      return;
    }
    const session = props.session();
    if (!session || !session.insertLink(value)) {
      setLinkError("无法插入链接");
      return;
    }
    closeLinkPrompt();
  }

  return (
    <>
      <div class="writing-bar" role="toolbar" aria-label="插入">
        <button
          class="icon-btn"
          type="button"
          aria-label="插入链接"
          title="插入链接"
          onClick={openLinkPrompt}
        >
          <LinkIcon />
        </button>
        <button
          class="icon-btn"
          type="button"
          aria-label="插入图片"
          title="插入图片"
          onClick={() => {
            void props.session()?.insertImage();
          }}
        >
          <ImageIcon />
        </button>
        <button
          class="icon-btn"
          type="button"
          aria-label="插入表格"
          title="插入表格"
          onClick={() => {
            props.session()?.insertTable();
          }}
        >
          <TableIcon />
        </button>
        <button
          class="icon-btn"
          type="button"
          aria-label="插入代码块"
          title="插入代码块"
          onClick={() => {
            props.session()?.insertCodeBlock();
          }}
        >
          <CodeBlockIcon />
        </button>
      </div>

      <dialog
        class="insert-dialog"
        aria-label="插入链接"
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          closeLinkPrompt();
        }}
        onClick={(event) => {
          if (event.target === dialog) closeLinkPrompt();
        }}
      >
        <form class="insert-dialog__form" onSubmit={submitLink}>
          <label class="insert-dialog__label" for="insert-link-url">
            链接地址
          </label>
          <input
            id="insert-link-url"
            class="insert-dialog__input"
            ref={urlInput}
            type="text"
            inputmode="url"
            autocomplete="off"
            spellcheck={false}
            aria-invalid={linkError() ? "true" : "false"}
            aria-describedby={linkError() ? "insert-link-error" : undefined}
            value={url()}
            onInput={(event) => {
              setUrl(event.currentTarget.value);
              if (linkError()) setLinkError(null);
            }}
          />
          <Show when={linkError()}>
            <p class="insert-dialog__error" id="insert-link-error" role="alert">
              {linkError()}
            </p>
          </Show>
          <div class="insert-dialog__actions">
            <button class="btn" type="button" onClick={closeLinkPrompt}>
              取消
            </button>
            <button class="btn btn--primary" type="submit">
              插入
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
