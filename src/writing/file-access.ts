/** Capability decisions for file open, write-back and download fallback. */

/**
 * The writable portion of a File System Access handle. `FileSystemFileHandle`
 * satisfies this shape; drag-and-drop and picker handles are accepted without
 * casting through `any`.
 */
export interface WritableFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
  queryPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
  requestPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
}

export interface FileAccessScope {
  readonly showOpenFilePicker?: unknown;
  readonly showSaveFilePicker?: unknown;
}

export interface FileAccessSupport {
  readonly canOpenWithPicker: boolean;
  readonly canSaveWithPicker: boolean;
}

export type SaveTarget = "handle" | "picker" | "download";

/** Detects picker support without touching `window` directly, so it is testable. */
export function detectFileAccess(scope: FileAccessScope): FileAccessSupport {
  return {
    canOpenWithPicker: typeof scope.showOpenFilePicker === "function",
    canSaveWithPicker: typeof scope.showSaveFilePicker === "function",
  };
}

/** Narrows any handle-like value to one this app can write back to. */
export function isWritableHandle(
  value: unknown,
): value is WritableFileHandle {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.getFile === "function" &&
    typeof candidate.createWritable === "function"
  );
}

/** Narrows a generic drop target handle to a file. */
export function isFileHandle(
  handle: FileSystemHandle,
): handle is FileSystemFileHandle {
  return handle.kind === "file";
}

/**
 * Prefers writing back to the current handle, then a save picker, then a
 * download. A handle without `createWritable` never counts as write-back.
 */
export function chooseSaveTarget(
  handle: unknown,
  support: FileAccessSupport,
): SaveTarget {
  if (isWritableHandle(handle)) return "handle";
  if (support.canSaveWithPicker) return "picker";
  return "download";
}

/** A picker rejection caused by the user closing the dialog, not by failure. */
export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === "AbortError";
  if (typeof error !== "object" || error === null) return false;
  return "name" in error && error.name === "AbortError";
}

/** Narrowed access to the picker functions on the current window. */
export function openFilePicker(
  scope: Window,
  options: FilePickerOptions,
): Promise<FileSystemFileHandle[]> | null {
  const picker = scope.showOpenFilePicker;
  return picker ? picker.call(scope, options) : null;
}

/** Narrowed access to the save picker on the current window. */
export function saveFilePicker(
  scope: Window,
  options: SaveFilePickerOptions,
): Promise<FileSystemFileHandle> | null {
  const picker = scope.showSaveFilePicker;
  return picker ? picker.call(scope, options) : null;
}
