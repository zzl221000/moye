import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const shellCss = readFileSync(
  resolve(projectRoot, "src/styles/shell.css"),
  "utf8",
);
const tokensCss = readFileSync(
  resolve(projectRoot, "src/styles/tokens.css"),
  "utf8",
);

const TYPE_ROLES = [
  "display",
  "page-title",
  "section-title",
  "heading",
  "body",
  "compact",
  "control",
  "helper",
  "code",
] as const;

const SPACE_STEPS = [
  "inline-tight",
  "inline",
  "surface-compact",
  "surface",
  "group",
  "section",
  "page",
  "major",
] as const;

const RADIUS_STEPS = [
  "control",
  "group",
  "overlay",
  "dialog",
  "page",
  "pill",
] as const;

const ELEVATION_STEPS = ["flat", "raised", "overlay", "modal", "paper"] as const;

function readTokens(css: string): ReadonlyMap<string, string> {
  const tokens = new Map<string, string>();
  const declaration = /--([a-z0-9-]+)\s*:\s*([^;]+);/g;

  for (const match of css.matchAll(declaration)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) {
      tokens.set(`--${name}`, value.trim().replace(/\s+/g, " "));
    }
  }

  return tokens;
}

const tokens = readTokens(tokensCss);
const value = (name: string): string | undefined => tokens.get(`--${name}`);

describe("design token contract", () => {
  it("names QuireKit as the source of the semantic scale", () => {
    expect(tokensCss).toContain("@quirekit/unocss-preset@0.0.1");
    expect(tokensCss).toContain("2026-11-04");
  });

  it("covers every semantic role the shell consumes", () => {
    const required: string[] = [
      "--moye-color-surface-canvas",
      "--moye-color-surface-chrome",
      "--moye-color-surface-page",
      "--moye-color-surface-writing",
      "--moye-color-surface-subtle",
      "--moye-color-surface-hover",
      "--moye-color-surface-pressed",
      "--moye-color-surface-selected",
      "--moye-color-text-primary",
      "--moye-color-text-secondary",
      "--moye-color-text-tertiary",
      "--moye-color-text-muted",
      "--moye-color-text-placeholder",
      "--moye-color-text-accent",
      "--moye-color-text-on-accent",
      "--moye-color-border-subtle",
      "--moye-color-border-default",
      "--moye-color-border-strong",
      "--moye-color-border-focus",
      "--moye-color-action-primary",
      "--moye-color-action-hover",
      "--moye-color-action-pressed",
      "--moye-color-action-soft",
      "--moye-color-action-text",
      "--moye-color-action-foreground",
      "--moye-color-danger",
      "--moye-color-danger-surface",
      "--moye-color-warning",
      "--moye-color-warning-surface",
      "--moye-color-success",
      "--moye-color-success-surface",
      "--moye-motion-duration-feedback",
      "--moye-motion-duration-control",
      "--moye-motion-duration-overlay",
      "--moye-motion-easing-standard",
      "--moye-motion-easing-enter",
      "--moye-motion-easing-exit",
    ];

    for (const role of TYPE_ROLES) {
      for (const part of [
        "font-family",
        "font-size",
        "font-weight",
        "line-height",
        "letter-spacing",
      ]) {
        required.push(`--moye-type-${role}-${part}`);
      }
    }

    for (const step of SPACE_STEPS) {
      required.push(`--moye-space-${step}`);
    }

    for (const step of RADIUS_STEPS) {
      required.push(`--moye-radius-${step}`);
    }

    for (const step of ELEVATION_STEPS) {
      required.push(`--moye-elevation-${step}`);
    }

    for (const name of required) {
      expect(tokens.get(name), `${name} is missing`).toBeDefined();
    }
  });

  it("keeps the 墨页 paper-and-ink palette", () => {
    const palette: Record<string, string> = {
      "moye-palette-canvas": "#f2f0ea",
      "moye-palette-chrome": "#f7f5f1",
      "moye-palette-paper": "#ffffff",
      "moye-palette-paper-warm": "#fffdf9",
      "moye-palette-ink": "#1b1f24",
      "moye-palette-ink-soft": "#414950",
      "moye-palette-muted": "#6b7279",
      "moye-palette-faint": "#9aa1a8",
      "moye-palette-line": "#e4e0d8",
      "moye-palette-line-strong": "#d2ccc0",
      "moye-palette-accent": "#1f5f4e",
      "moye-palette-accent-ink": "#154238",
      "moye-palette-accent-soft": "#e6efeb",
      "moye-palette-danger": "#a92f26",
      "moye-palette-warning": "#8a5a00",
    };

    for (const [name, expected] of Object.entries(palette)) {
      expect(value(name), name).toBe(expected);
    }
  });

  it("wires semantic colors to the palette rather than duplicating values", () => {
    expect(value("moye-color-surface-canvas")).toBe("var(--moye-palette-canvas)");
    expect(value("moye-color-surface-writing")).toBe(
      "var(--moye-palette-paper-warm)",
    );
    expect(value("moye-color-text-primary")).toBe("var(--moye-palette-ink)");
    expect(value("moye-color-action-primary")).toBe("var(--moye-palette-accent)");
    expect(value("moye-color-border-default")).toBe(
      "var(--moye-palette-line-strong)",
    );
  });

  it("uses the QuireKit type scale for all nine roles", () => {
    const sizes = TYPE_ROLES.map((role) => value(`moye-type-${role}-font-size`));
    expect(sizes).toEqual([
      "40px",
      "28px",
      "20px",
      "16px",
      "14px",
      "13px",
      "14px",
      "12px",
      "12px",
    ]);

    for (const role of TYPE_ROLES) {
      const size = value(`moye-type-${role}-font-size`);
      expect(size, role).toMatch(/^\d+(?:\.\d+)?px$/);

      const lineHeight = value(`moye-type-${role}-line-height`);
      expect(lineHeight, role).toMatch(/^\d+(?:\.\d+)?$/);

      const weight = value(`moye-type-${role}-font-weight`);
      expect(weight, role).toMatch(/^\d{3}$/);
    }
  });

  it("keeps the space scale ordered and the radius scale intact", () => {
    const spaces = SPACE_STEPS.map((step) =>
      Number.parseFloat(value(`moye-space-${step}`) ?? "NaN"),
    );
    expect(spaces).toEqual([4, 6, 12, 16, 24, 32, 40, 48]);

    const radii = RADIUS_STEPS.map((step) => value(`moye-radius-${step}`));
    expect(radii).toEqual(["4px", "6px", "8px", "12px", "2px", "999px"]);
  });

  it("exposes named elevation and motion roles", () => {
    expect(value("moye-elevation-flat")).toBe("none");
    for (const step of ["raised", "overlay", "modal", "paper"] as const) {
      expect(value(`moye-elevation-${step}`), step).toMatch(/rgb\(/);
    }

    expect(value("moye-motion-duration-feedback")).toBe("120ms");
    expect(value("moye-motion-duration-control")).toBe("180ms");
    expect(value("moye-motion-duration-overlay")).toBe("240ms");
    expect(value("moye-motion-easing-standard")).toBe(
      "cubic-bezier(0.2, 0, 0, 1)",
    );
    expect(value("moye-motion-easing-enter")).toBe(
      "cubic-bezier(0, 0, 0.2, 1)",
    );
    expect(value("moye-motion-easing-exit")).toBe(
      "cubic-bezier(0.4, 0, 1, 1)",
    );
  });

  it("does not import QuireKit CSS or reuse its class and token prefixes", () => {
    for (const css of [tokensCss, shellCss]) {
      expect(css).not.toMatch(/@import[^;]*quirekit/i);
      expect(css).not.toMatch(/\.qk-/);
      expect(css).not.toMatch(/--qk-/);
    }
  });
});
