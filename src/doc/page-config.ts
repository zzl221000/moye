import type { DocExportApi } from "./vendor";

/**
 * Adapter for the frozen `export-doc.js` page configuration.
 *
 * `exportElement` calls `buildPageConfig` to produce a pageConfig object (or a
 * null-returning resolver). That function is part of the frozen kernel's public
 * surface, so the preview calls the same one instead of maintaining a second
 * header/footer model. Sharing it is what keeps the reserved band heights — and
 * therefore every page boundary — equal to the export.
 */
export type PageConfigOptions = {
  readonly cover: boolean;
  readonly headerTitle: string;
  readonly pageNumbers: boolean;
  readonly headerColor: string;
  readonly footerColor: string;
};

export type ExportPageConfig = unknown;

/**
 * Returns the frozen page config for these export options, or null when the
 * kernel does not expose the contract (the preview then stays continuous).
 */
export function buildExportPageConfig(
  api: DocExportApi,
  options: PageConfigOptions,
): ExportPageConfig | null {
  if (typeof api.buildPageConfig !== "function") return null;
  return api.buildPageConfig(
    {
      cover: options.cover,
      headerTitle: options.headerTitle,
      headerColor: options.headerColor,
      footerColor: options.footerColor,
    },
    Boolean(options.headerTitle),
    Boolean(options.pageNumbers),
  );
}
