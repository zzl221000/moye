import { isSafeDestination } from "@quirekit/msfe-core";
import type { ProseStructure } from "@quirekit/msfe-prose";
import { createEffect, createSignal, For, Show } from "solid-js";
import {
  TABLE_DEFAULT_COLUMNS,
  TABLE_DEFAULT_ROWS,
  TABLE_SIZE_MAX,
  TABLE_SIZE_MIN,
} from "../writing/insert";
import type { WritingSession } from "../writing/session";
import {
  CodeBlockIcon,
  DeleteColumnIcon,
  DeleteRowIcon,
  ImageIcon,
  InsertColumnIcon,
  InsertRowIcon,
  LinkIcon,
  TableIcon,
} from "./icons";

export interface InsertBarProps {
  /** Reads the mounted session lazily; it is created after the first render. */
  readonly session: () => WritingSession | null;
}

interface TableSize {
  readonly columns: number;
  readonly rows: number;
}

const TABLE_SIZES = Array.from(
  { length: TABLE_SIZE_MAX },
  (_, index) => index + TABLE_SIZE_MIN,
);

const NO_STRUCTURE: ProseStructure = {
  table: false,
  deleteRow: false,
  deleteColumn: false,
  list: false,
  indentList: false,
};

export default function InsertBar(props: InsertBarProps) {
  const [linkOpen, setLinkOpen] = createSignal(false);
  const [url, setUrl] = createSignal("");
  const [linkError, setLinkError] = createSignal<string | null>(null);
  const [tableOpen, setTableOpen] = createSignal(false);
  const [tableSize, setTableSize] = createSignal<TableSize>({
    columns: TABLE_DEFAULT_COLUMNS,
    rows: TABLE_DEFAULT_ROWS,
  });
  const [activeCell, setActiveCell] = createSignal<TableSize>({
    columns: TABLE_DEFAULT_COLUMNS,
    rows: TABLE_DEFAULT_ROWS,
  });
  const [structure, setStructure] = createSignal<ProseStructure>(NO_STRUCTURE);

  let dialog: HTMLDialogElement | undefined;
  let linkButton: HTMLButtonElement | undefined;
  let urlInput: HTMLInputElement | undefined;
  let tableButton: HTMLButtonElement | undefined;
  let tableGrid: HTMLDivElement | undefined;
  let tableContainer: HTMLDivElement | undefined;

  createEffect(
    () => props.session(),
    (session) => {
      if (!session) {
        setStructure(NO_STRUCTURE);
        return;
      }
      return session.observeStructure((next) => {
        setStructure((current) =>
          sameStructure(current, next) ? current : next,
        );
      });
    },
  );

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

  createEffect(
    () => tableOpen(),
    (open) => {
      if (!open) return;
      queueMicrotask(() => {
        focusTableCell(TABLE_DEFAULT_COLUMNS, TABLE_DEFAULT_ROWS);
      });
      const onPointerDown = (event: PointerEvent): void => {
        const target = event.target;
        if (
          tableContainer &&
          target instanceof Node &&
          tableContainer.contains(target)
        ) {
          return;
        }
        closeTablePicker(false);
      };
      const onFocusIn = (event: FocusEvent): void => {
        const target = event.target;
        if (
          tableContainer &&
          target instanceof Node &&
          tableContainer.contains(target)
        ) {
          return;
        }
        closeTablePicker(false);
      };
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("focusin", onFocusIn, true);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("focusin", onFocusIn, true);
      };
    },
  );

  function openLinkPrompt(): void {
    setUrl("");
    setLinkError(null);
    setLinkOpen(true);
  }

  function closeLinkPrompt(returnTo: "trigger" | "editor"): void {
    if (dialog?.open) dialog.close();
    setLinkOpen(false);
    setLinkError(null);
    queueMicrotask(() => {
      if (returnTo === "trigger") linkButton?.focus();
      else props.session()?.focus();
    });
  }

  function failLink(message: string): void {
    setLinkError(message);
    queueMicrotask(() => {
      urlInput?.focus();
      urlInput?.select();
    });
  }

  function submitLink(event: SubmitEvent): void {
    event.preventDefault();
    const value = url().trim();
    if (value.length === 0) {
      failLink("请输入链接地址");
      return;
    }
    if (!isSafeDestination(value)) {
      failLink("请输入有效的链接地址");
      return;
    }
    const session = props.session();
    if (!session || !session.insertLink(value)) {
      failLink("插入失败，请重试");
      return;
    }
    closeLinkPrompt("editor");
  }

  function openTablePicker(): void {
    setTableSize({
      columns: TABLE_DEFAULT_COLUMNS,
      rows: TABLE_DEFAULT_ROWS,
    });
    setActiveCell({
      columns: TABLE_DEFAULT_COLUMNS,
      rows: TABLE_DEFAULT_ROWS,
    });
    setTableOpen(true);
  }

  function closeTablePicker(returnFocus: boolean): void {
    setTableOpen(false);
    setTableSize({
      columns: TABLE_DEFAULT_COLUMNS,
      rows: TABLE_DEFAULT_ROWS,
    });
    if (returnFocus) queueMicrotask(() => tableButton?.focus());
  }

  function chooseTable(columns: number, rows: number): void {
    const session = props.session();
    setTableOpen(false);
    if (!session || !session.insertTable(columns, rows)) {
      queueMicrotask(() => tableButton?.focus());
    }
  }

  function focusTableCell(columns: number, rows: number): void {
    tableGrid
      ?.querySelector<HTMLElement>(
        `[data-table-column="${columns}"][data-table-row="${rows}"]`,
      )
      ?.focus();
  }

  function handleGridKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeTablePicker(true);
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const cell = target.closest<HTMLElement>("[data-table-column]");
    if (!cell || !tableGrid?.contains(cell)) return;
    const columns = Number(cell.dataset.tableColumn);
    const rows = Number(cell.dataset.tableRow);
    if (!Number.isFinite(columns) || !Number.isFinite(rows)) return;
    let nextColumns = columns;
    let nextRows = rows;
    switch (event.key) {
      case "ArrowLeft":
        nextColumns = Math.max(TABLE_SIZE_MIN, columns - 1);
        break;
      case "ArrowRight":
        nextColumns = Math.min(TABLE_SIZE_MAX, columns + 1);
        break;
      case "ArrowUp":
        nextRows = Math.max(TABLE_SIZE_MIN, rows - 1);
        break;
      case "ArrowDown":
        nextRows = Math.min(TABLE_SIZE_MAX, rows + 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    focusTableCell(nextColumns, nextRows);
  }

  function chooseTableCell(columns: number, rows: number): void {
    setTableSize({ columns, rows });
    setActiveCell({ columns, rows });
  }

  return (
    <>
      <div class="writing-bar" role="toolbar" aria-label="插入">
        <button
          class="icon-btn"
          type="button"
          aria-label="插入链接"
          title="插入链接"
          aria-haspopup="dialog"
          aria-controls="insert-link-dialog"
          aria-expanded={linkOpen() ? "true" : "false"}
          ref={(button) => {
            linkButton = button;
          }}
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
        <div class="insert-table" ref={tableContainer}>
          <button
            class="icon-btn"
            type="button"
            aria-label="插入表格"
            title="插入表格"
            aria-haspopup="dialog"
            aria-controls="insert-table-picker"
            aria-expanded={tableOpen() ? "true" : "false"}
            ref={(button) => {
              tableButton = button;
            }}
            onClick={() => {
              if (tableOpen()) closeTablePicker(true);
              else openTablePicker();
            }}
          >
            <TableIcon />
          </button>
          <Show when={tableOpen()}>
            <div
              class="table-picker"
              id="insert-table-picker"
              role="dialog"
              aria-label="插入表格"
              onKeyDown={handleGridKeyDown}
            >
              <div
                class="table-picker__grid"
                role="grid"
                aria-label="表格尺寸"
                ref={tableGrid}
              >
                <For each={TABLE_SIZES}>
                  {(row) => (
                    <div class="table-picker__row" role="row">
                      <For each={TABLE_SIZES}>
                        {(column) => {
                          const active = () =>
                            column <= tableSize().columns &&
                            row <= tableSize().rows;
                          return (
                            <button
                              class={[
                                "table-picker__cell",
                                {
                                  "table-picker__cell--active": active(),
                                },
                              ]}
                              type="button"
                              role="gridcell"
                              tabindex={
                                column === activeCell().columns &&
                                row === activeCell().rows
                                  ? 0
                                  : -1
                              }
                              aria-label={`${column} 列 ${row} 行`}
                              aria-selected={active() ? "true" : "false"}
                              data-table-column={column}
                              data-table-row={row}
                              onPointerEnter={() => {
                                setTableSize({ columns: column, rows: row });
                              }}
                              onFocus={() => {
                                chooseTableCell(column, row);
                              }}
                              onClick={() => {
                                chooseTable(column, row);
                              }}
                            />
                          );
                        }}
                      </For>
                    </div>
                  )}
                </For>
              </div>
              <p class="table-picker__reading" aria-live="polite">
                {tableSize().columns} × {tableSize().rows}
              </p>
            </div>
          </Show>
        </div>
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

        <Show when={structure().table}>
          <span class="writing-bar__rule" aria-hidden="true" />
          <button
            class="icon-btn"
            type="button"
            aria-label="在右侧插入列"
            title="在右侧插入列"
            onClick={() => {
              props.session()?.insertTableColumn();
            }}
          >
            <InsertColumnIcon />
          </button>
          <button
            class="icon-btn"
            type="button"
            aria-label="在下方插入行"
            title="在下方插入行"
            onClick={() => {
              props.session()?.insertTableRow();
            }}
          >
            <InsertRowIcon />
          </button>
          <button
            class="icon-btn"
            type="button"
            aria-label="删除列"
            title="删除列"
            disabled={!structure().deleteColumn}
            onClick={() => {
              props.session()?.deleteTableColumn();
            }}
          >
            <DeleteColumnIcon />
          </button>
          <button
            class="icon-btn"
            type="button"
            aria-label="删除行"
            title="删除行"
            disabled={!structure().deleteRow}
            onClick={() => {
              props.session()?.deleteTableRow();
            }}
          >
            <DeleteRowIcon />
          </button>
        </Show>
      </div>

      <dialog
        class="insert-dialog"
        id="insert-link-dialog"
        aria-label="插入链接"
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          closeLinkPrompt("trigger");
        }}
        onClick={(event) => {
          if (event.target === dialog) closeLinkPrompt("trigger");
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
            placeholder="https://example.com"
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
            <button
              class="btn"
              type="button"
              onClick={() => closeLinkPrompt("trigger")}
            >
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

/** @param left - Current facts. @param right - Freshly read facts. @returns Whether every field matches. */
function sameStructure(left: ProseStructure, right: ProseStructure): boolean {
  return (
    left.table === right.table &&
    left.deleteRow === right.deleteRow &&
    left.deleteColumn === right.deleteColumn &&
    left.list === right.list &&
    left.indentList === right.indentList
  );
}
