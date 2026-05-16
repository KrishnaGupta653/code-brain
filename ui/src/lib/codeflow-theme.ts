/**
 * CodeFlow Theme System - Integrated into Code-Brain
 * Provides dynamic color theming with 8 preset accents and auto dark/light mode detection
 * Ported from: codeflow/card/render/theme.js
 */

export interface ColorPalette {
  bg: string;
  bgAlt: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentSoft: string;
  green: string;
  amber: string;
  red: string;
  spark: string;
  sparkBg: string;
  _auto?: boolean;
  _dark?: ColorPalette;
  _light?: ColorPalette;
}

export type ThemeMode = 'dark' | 'light' | 'auto';
export type AccentPreset = 'purple' | 'teal' | 'cyan' | 'green' | 'pink' | 'blue' | 'amber' | 'red';

const DARK: ColorPalette = {
  bg: '#0d1117',
  bgAlt: '#161b22',
  border: '#21262d',
  text: '#e6edf3',
  textDim: '#8b949e',
  textFaint: '#6e7681',
  accent: '#a78bfa', // codeflow purple
  accentSoft: 'rgba(167,139,250,0.16)',
  green: '#3fb950',
  amber: '#d29922',
  red: '#f85149',
  spark: '#a78bfa',
  sparkBg: 'rgba(167,139,250,0.18)',
};

const LIGHT: ColorPalette = {
  bg: '#ffffff',
  bgAlt: '#f6f8fa',
  border: '#d0d7de',
  text: '#1f2328',
  textDim: '#656d76',
  textFaint: '#8c959f',
  accent: '#6f42c1',
  accentSoft: 'rgba(111,66,193,0.12)',
  green: '#1a7f37',
  amber: '#9a6700',
  red: '#cf222e',
  spark: '#6f42c1',
  sparkBg: 'rgba(111,66,193,0.12)',
};

const ACCENT_PRESETS: Record<AccentPreset, { dark: string; light: string }> = {
  purple: { dark: '#a78bfa', light: '#6f42c1' },
  teal: { dark: '#5eead4', light: '#0d9488' },
  cyan: { dark: '#67e8f9', light: '#0891b2' },
  green: { dark: '#86efac', light: '#16a34a' },
  pink: { dark: '#f9a8d4', light: '#db2777' },
  blue: { dark: '#93c5fd', light: '#2563eb' },
  amber: { dark: '#fcd34d', light: '#d97706' },
  red: { dark: '#fca5a5', light: '#dc2626' },
};

export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;

  let r: number, g: number, b: number;
  if (m[1].length === 3) {
    r = parseInt(m[1][0] + m[1][0], 16);
    g = parseInt(m[1][1] + m[1][1], 16);
    b = parseInt(m[1][2] + m[1][2], 16);
  } else {
    r = parseInt(m[1].slice(0, 2), 16);
    g = parseInt(m[1].slice(2, 4), 16);
    b = parseInt(m[1].slice(4, 6), 16);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

export function resolveAccent(value: string | AccentPreset | null, mode: 'dark' | 'light'): string | null {
  if (!value) return null;
  const preset = ACCENT_PRESETS[value.toLowerCase() as AccentPreset];
  if (preset) return preset[mode] || preset.dark;
  return value; // assume CSS color
}

export interface ThemeOptions {
  accent?: string | AccentPreset;
}

export function getTheme(mode: ThemeMode, opts?: ThemeOptions): ColorPalette {
  if (mode === 'auto') return getAutoTheme(opts);

  const base = mode === 'light' ? { ...LIGHT } : { ...DARK };
  const accent = opts?.accent ? resolveAccent(opts.accent, mode === 'light' ? 'light' : 'dark') : null;

  if (accent) {
    base.accent = accent;
    base.accentSoft = withAlpha(accent, mode === 'light' ? 0.12 : 0.16);
    base.spark = accent;
    base.sparkBg = withAlpha(accent, mode === 'light' ? 0.12 : 0.18);
  }

  return base;
}

const VAR_REFS: ColorPalette = {
  bg: 'var(--cf-bg)',
  bgAlt: 'var(--cf-bg-alt)',
  border: 'var(--cf-border)',
  text: 'var(--cf-text)',
  textDim: 'var(--cf-text-dim)',
  textFaint: 'var(--cf-text-faint)',
  accent: 'var(--cf-accent)',
  accentSoft: 'var(--cf-accent-soft)',
  green: 'var(--cf-green)',
  amber: 'var(--cf-amber)',
  red: 'var(--cf-red)',
  spark: 'var(--cf-spark)',
  sparkBg: 'var(--cf-spark-bg)',
};

function buildAutoPalette(base: ColorPalette, accent: string | AccentPreset | null, mode: 'dark' | 'light'): ColorPalette {
  const out = { ...base };
  if (accent) {
    const a = resolveAccent(accent, mode);
    if (a) {
      out.accent = a;
      out.accentSoft = withAlpha(a, mode === 'light' ? 0.12 : 0.16);
      out.spark = a;
      out.sparkBg = withAlpha(a, mode === 'light' ? 0.12 : 0.18);
    }
  }
  return out;
}

export function getAutoTheme(opts?: ThemeOptions): ColorPalette {
  const accent = opts?.accent || null;
  const refs = { ...VAR_REFS };
  refs._auto = true;
  refs._dark = buildAutoPalette(DARK, accent, 'dark');
  refs._light = buildAutoPalette(LIGHT, accent, 'light');
  return refs;
}

/**
 * Get system theme preference (dark/light)
 */
export function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Generate CSS variables for auto theme
 */
export function generateThemeCSS(theme: ColorPalette): string {
  if (!theme._auto || !theme._dark || !theme._light) return '';

  const darkVars = Object.entries(theme._dark)
    .filter(([k]) => !k.startsWith('_'))
    .map(([k, v]) => `--cf-${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`)
    .join(';');

  const lightVars = Object.entries(theme._light)
    .filter(([k]) => !k.startsWith('_'))
    .map(([k, v]) => `--cf-${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`)
    .join(';');

  return `
    :root {
      ${darkVars};
    }
    @media (prefers-color-scheme: light) {
      :root {
        ${lightVars};
      }
    }
  `;
}

export const ACCENT_PRESETS_LIST = Object.keys(ACCENT_PRESETS) as AccentPreset[];

/**
 * Legend color utilities for CodeFlow visualization
 */
export interface LegendColorScheme {
  folder: string;
  layer: string;
  churn: string;
  health: string;
  complexity: string;
}

export function getLegendColors(theme: ColorPalette): LegendColorScheme {
  return {
    folder: theme.accent,
    layer: theme.green,
    churn: theme.amber,
    health: theme.red,
    complexity: theme.spark,
  };
}

/**
 * Get contrasting text color for a background
 */
export function getContrastColor(bgColor: string, theme: ColorPalette): string {
  // Simple luminance calculation
  const hex = bgColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}
