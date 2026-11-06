/// <reference types="vite/client" />

/**
 * File System Access API surface the app relies on. TypeScript's DOM library
 * ships `FileSystemFileHandle` but not the picker entry points or the
 * permission methods, so they are declared here without pulling in a package.
 */
interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string | string[]>;
}

interface FilePickerOptions {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: FilePickerAcceptType[];
}

interface SaveFilePickerOptions extends FilePickerOptions {
  suggestedName?: string;
}

interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FileSystemHandle {
  queryPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
  requestPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
}

interface DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

/** Development-only hook used by `tests/smoke-writing.mjs`. */
interface MoyeSmokeHook {
  loadSample(): void;
  replace(markdown: string): boolean;
  getMarkdown(): string | null;
  focus(): void;
}

/** Development-only view of the settings model for the headless smoke. */
interface MoyeSettingsSnapshot {
  paper: string;
  margin: string;
  headerTitle: string;
  pageNumbers: boolean;
  cover: boolean;
  pageBreakOnH1: boolean;
  theme: string;
  background: string;
  customCss: string;
  compress: boolean;
}

interface MoyeExportSettingsSnapshot {
  paper: string;
  marginPt: number;
  headerTitle: string;
  pageNumbers: boolean;
  cover: boolean;
  pageBreakOnH1: boolean;
  compress: boolean;
  background: string;
  fileName: string;
}

interface MoyeSettingsHook {
  getOptions(): MoyeSettingsSnapshot;
  getExportSettings(): MoyeExportSettingsSnapshot;
}

interface Window {
  showOpenFilePicker?(
    options?: FilePickerOptions,
  ): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?(
    options?: SaveFilePickerOptions,
  ): Promise<FileSystemFileHandle>;
  __moye?: MoyeSmokeHook;
  __moyeSettings?: MoyeSettingsHook;
}
