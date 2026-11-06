import { createEffect, For } from "solid-js";
import type { DocumentOptions } from "../doc/options";
import {
  isMarginValue,
  isPaperKind,
  type MarginValue,
  type PaperKind,
} from "../doc/paper";
import { CloseIcon } from "./icons";

export type ThemeChoice = {
  readonly id: string;
  readonly label: string;
};

export interface SettingsPanelProps {
  readonly open: boolean;
  readonly options: DocumentOptions;
  readonly themes: readonly ThemeChoice[];
  readonly onChange: (patch: Partial<DocumentOptions>) => void;
  readonly onClose: () => void;
  readonly returnFocus: () => void;
}

const PAPER_CHOICES: readonly { value: PaperKind; label: string }[] = [
  { value: "a4", label: "A4" },
  { value: "a4-landscape", label: "A4 横向" },
  { value: "letter", label: "Letter" },
];

const MARGIN_CHOICES: readonly { value: MarginValue; label: string }[] = [
  { value: "36", label: "标准" },
  { value: "18", label: "窄" },
  { value: "0", label: "无" },
];

export default function SettingsPanel(props: SettingsPanelProps) {
  let dialog: HTMLDialogElement | undefined;
  let paperSelect: HTMLSelectElement | undefined;

  createEffect(
    () => props.open,
    (open) => {
      const element = dialog;
      if (!element) return;
      if (open) {
        if (!element.open) {
          try {
            element.showModal();
          } catch (error) {
            console.error("[moye] 无法打开设置", error);
          }
        }
        queueMicrotask(() => paperSelect?.focus());
        return;
      }
      if (element.open) element.close();
    },
  );

  function requestClose(): void {
    if (dialog?.open) dialog.close();
    props.onClose();
    queueMicrotask(() => props.returnFocus());
  }

  return (
    <dialog
      id="settings-dialog"
      class="settings-dialog"
      aria-labelledby="settings-title"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialog) requestClose();
      }}
    >
      <div class="settings-dialog__panel">
        <header class="settings-dialog__head">
          <h2 class="settings-dialog__title" id="settings-title">
            设置
          </h2>
          <button
            class="icon-btn settings-dialog__close"
            type="button"
            aria-label="关闭设置"
            title="关闭设置"
            onClick={requestClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div class="settings-dialog__body">
          <section
            class="settings-group"
            aria-labelledby="settings-group-paper"
          >
            <h3 class="settings-group__title" id="settings-group-paper">
              纸张
            </h3>

            <div class="settings-field">
              <label class="settings-field__label" for="setting-paper">
                纸张
              </label>
              <select
                class="settings-control"
                id="setting-paper"
                ref={paperSelect}
                value={props.options.paper}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (isPaperKind(value)) props.onChange({ paper: value });
                }}
              >
                <For each={PAPER_CHOICES}>
                  {(choice) => (
                    <option value={choice.value}>{choice.label}</option>
                  )}
                </For>
              </select>
            </div>

            <div class="settings-field">
              <label class="settings-field__label" for="setting-margin">
                页边距
              </label>
              <select
                class="settings-control"
                id="setting-margin"
                value={props.options.margin}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (isMarginValue(value)) {
                    props.onChange({ margin: value });
                  }
                }}
              >
                <For each={MARGIN_CHOICES}>
                  {(choice) => (
                    <option value={choice.value}>{choice.label}</option>
                  )}
                </For>
              </select>
            </div>
          </section>

          <section
            class="settings-group"
            aria-labelledby="settings-group-layout"
          >
            <h3 class="settings-group__title" id="settings-group-layout">
              版式
            </h3>

            <div class="settings-field">
              <label class="settings-field__label" for="setting-header-title">
                页眉标题
              </label>
              <input
                class="settings-control"
                id="setting-header-title"
                type="text"
                autocomplete="off"
                spellcheck={false}
                value={props.options.headerTitle}
                onInput={(event) => {
                  props.onChange({ headerTitle: event.currentTarget.value });
                }}
              />
            </div>

            <label class="settings-switch">
              <span class="settings-switch__label">页脚页码</span>
              <span class="settings-switch__control">
                <input
                  id="setting-page-numbers"
                  type="checkbox"
                  checked={props.options.pageNumbers}
                  onChange={(event) => {
                    props.onChange({
                      pageNumbers: event.currentTarget.checked,
                    });
                  }}
                />
                <span class="settings-switch__track" aria-hidden="true" />
              </span>
            </label>

            <label class="settings-switch">
              <span class="settings-switch__label">首页不显示页眉页脚</span>
              <span class="settings-switch__control">
                <input
                  id="setting-cover"
                  type="checkbox"
                  checked={props.options.cover}
                  onChange={(event) => {
                    props.onChange({ cover: event.currentTarget.checked });
                  }}
                />
                <span class="settings-switch__track" aria-hidden="true" />
              </span>
            </label>

            <label class="settings-switch">
              <span class="settings-switch__label">每个一级标题另起一页</span>
              <span class="settings-switch__control">
                <input
                  id="setting-h1-break"
                  type="checkbox"
                  checked={props.options.pageBreakOnH1}
                  onChange={(event) => {
                    props.onChange({
                      pageBreakOnH1: event.currentTarget.checked,
                    });
                  }}
                />
                <span class="settings-switch__track" aria-hidden="true" />
              </span>
            </label>
          </section>

          <section
            class="settings-group"
            aria-labelledby="settings-group-document"
          >
            <h3 class="settings-group__title" id="settings-group-document">
              文档
            </h3>

            <div class="settings-field">
              <label class="settings-field__label" for="setting-theme">
                文档主题
              </label>
              <select
                class="settings-control"
                id="setting-theme"
                value={props.options.theme}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (value !== "") props.onChange({ theme: value });
                }}
              >
                <For each={props.themes}>
                  {(theme) => (
                    <option value={theme.id}>{theme.label}</option>
                  )}
                </For>
              </select>
            </div>

            <div class="settings-field">
              <label class="settings-field__label" for="setting-background">
                页面背景
              </label>
              <input
                class="settings-color"
                id="setting-background"
                type="color"
                value={props.options.background}
                onInput={(event) => {
                  props.onChange({ background: event.currentTarget.value });
                }}
              />
            </div>

            <details class="settings-advanced">
              <summary class="settings-advanced__summary">高级</summary>
              <div class="settings-advanced__body">
                {/*
                  Detail CSS is appended after the theme CSS and reaches both
                  the preview and the PDF; it is not a sandboxed stylesheet.
                */}
                <div class="settings-field">
                  <label class="settings-field__label" for="setting-custom-css">
                    细节 CSS
                  </label>
                  <textarea
                    class="settings-control settings-code"
                    id="setting-custom-css"
                    rows="8"
                    spellcheck={false}
                    value={props.options.customCss}
                    onInput={(event) => {
                      props.onChange({
                        customCss: event.currentTarget.value,
                      });
                    }}
                  />
                </div>
              </div>
            </details>

            <label class="settings-switch">
              <span class="settings-switch__label">压缩 PDF 体积</span>
              <span class="settings-switch__control">
                <input
                  id="setting-compress"
                  type="checkbox"
                  checked={props.options.compress}
                  onChange={(event) => {
                    props.onChange({ compress: event.currentTarget.checked });
                  }}
                />
                <span class="settings-switch__track" aria-hidden="true" />
              </span>
            </label>
          </section>
        </div>
      </div>
    </dialog>
  );
}
