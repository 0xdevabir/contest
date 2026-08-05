/**
 * Single source of truth for every colour in the product.
 *
 * Nothing else in the codebase should contain a literal colour. Components use
 * the CSS custom properties emitted by `themeCss()`; anything that needs a real
 * value at runtime (Monaco, xterm, confetti) reads the token objects directly.
 */

export type ThemeId = "dark" | "midnight" | "dracula" | "amoled" | "light" | "solarized";

/** What a user can pick — `system` follows the OS and resolves to dark/light. */
export type ThemeMode = ThemeId | "system";

export type Scheme = "dark" | "light";

type Palette = {
  bg: string;
  bgElevated: string;
  bgPanel: string;
  line: string;
  lineSoft: string;
  lineStrong: string;
  text: string;
  muted: string;
  mutedDim: string;
  accent: string;
  accentSoft: string;
  accentDim: string;
  /** Text drawn on top of a solid accent fill. */
  accentContrast: string;
  warn: string;
  danger: string;
  info: string;
  /** Difficulty tier ramp: very easy → extreme. */
  diff: [string, string, string, string, string, string, string];
};

export type Theme = {
  id: ThemeId;
  label: string;
  description: string;
  scheme: Scheme;
  palette: Palette;
  /** Derived surface tokens — computed once so themes stay declarative. */
  surface: {
    accentSurface: string;
    accentSurfaceStrong: string;
    accentBorder: string;
    dangerSurface: string;
    dangerBorder: string;
    warnSurface: string;
    warnBorder: string;
    hover: string;
    /** Hairline highlight along the top edge of solid buttons. */
    buttonHighlight: string;
    sunken: string;
    overlay: string;
    panelHighlight: string;
    selectionBg: string;
    selectionText: string;
    scrollThumbHover: string;
    gradientTop: string;
  };
  terminal: Record<string, string>;
  /** Monaco base to build the editor theme on. */
  editorBase: "vs" | "vs-dark";
  confetti: string[];
};

function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function makeTheme(
  id: ThemeId,
  label: string,
  description: string,
  scheme: Scheme,
  palette: Palette
): Theme {
  const dark = scheme === "dark";
  return {
    id,
    label,
    description,
    scheme,
    palette,
    surface: {
      accentSurface: rgba(palette.accent, dark ? 0.12 : 0.1),
      accentSurfaceStrong: rgba(palette.accent, dark ? 0.18 : 0.16),
      accentBorder: rgba(palette.accent, dark ? 0.35 : 0.4),
      dangerSurface: rgba(palette.danger, dark ? 0.14 : 0.1),
      dangerBorder: rgba(palette.danger, dark ? 0.35 : 0.4),
      warnSurface: rgba(palette.warn, dark ? 0.12 : 0.14),
      warnBorder: rgba(palette.warn, dark ? 0.35 : 0.42),
      hover: dark ? "rgba(255, 255, 255, 0.04)" : rgba(palette.text, 0.05),
      buttonHighlight: dark ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.3)",
      sunken: dark ? "rgba(0, 0, 0, 0.32)" : rgba(palette.text, 0.05),
      overlay: dark ? "rgba(0, 0, 0, 0.68)" : rgba(palette.text, 0.45),
      panelHighlight: dark
        ? "rgba(255, 255, 255, 0.02)"
        : "rgba(255, 255, 255, 0.65)",
      selectionBg: rgba(palette.accent, 0.28),
      selectionText: palette.text,
      scrollThumbHover: palette.muted,
      gradientTop: dark ? rgba(palette.accent, 0.05) : rgba(palette.accent, 0.07),
    },
    terminal: {
      background: palette.bgElevated,
      foreground: palette.text,
      cursor: palette.accent,
      selectionBackground: rgba(palette.accent, 0.25),
      black: palette.bg,
      red: palette.danger,
      green: palette.accent,
      yellow: palette.warn,
      blue: palette.info,
      magenta: palette.diff[6],
      cyan: palette.accentSoft,
      white: palette.text,
      brightBlack: palette.mutedDim,
      brightRed: palette.danger,
      brightGreen: palette.accentSoft,
      brightYellow: palette.warn,
      brightBlue: palette.info,
      brightMagenta: palette.diff[6],
      brightCyan: palette.accentSoft,
      brightWhite: palette.text,
    },
    editorBase: dark ? "vs-dark" : "vs",
    confetti: [
      palette.accent,
      palette.accentSoft,
      palette.warn,
      palette.info,
      palette.text,
    ],
  };
}

export const THEMES: Record<ThemeId, Theme> = {
  dark: makeTheme("dark", "Carbon", "The default deep slate with a green judge accent.", "dark", {
    bg: "#080b10",
    bgElevated: "#0e141c",
    bgPanel: "#111823",
    line: "#1e2836",
    lineSoft: "#17202c",
    lineStrong: "#2c3a4d",
    text: "#e8eef6",
    muted: "#8494a8",
    mutedDim: "#5f6e81",
    accent: "#3ecf8e",
    accentSoft: "#7ddea5",
    accentDim: "#1f8f5f",
    accentContrast: "#04140c",
    warn: "#f0b429",
    danger: "#f07178",
    info: "#59c2ff",
    diff: ["#7ddea5", "#3ecf8e", "#59c2ff", "#f0b429", "#ff9e64", "#f07178", "#e06cfc"],
  }),

  midnight: makeTheme(
    "midnight",
    "Midnight",
    "Deep indigo with a cool blue accent — easy on late-night eyes.",
    "dark",
    {
      bg: "#0b1020",
      bgElevated: "#121a30",
      bgPanel: "#151e38",
      line: "#24304f",
      lineSoft: "#1b2440",
      lineStrong: "#38496f",
      text: "#e6ebff",
      muted: "#94a3c7",
      mutedDim: "#6b7aa1",
      accent: "#7aa2f7",
      accentSoft: "#a3bdfb",
      accentDim: "#4c7ae0",
      accentContrast: "#06102a",
      warn: "#e0af68",
      danger: "#f7768e",
      info: "#7dcfff",
      diff: ["#9ece6a", "#7aa2f7", "#7dcfff", "#e0af68", "#ff9e64", "#f7768e", "#bb9af7"],
    }
  ),

  dracula: makeTheme(
    "dracula",
    "Dracula",
    "The classic purple-grey editor palette.",
    "dark",
    {
      bg: "#282a36",
      bgElevated: "#2f313f",
      bgPanel: "#343746",
      line: "#44475a",
      lineSoft: "#3b3e4d",
      lineStrong: "#6272a4",
      text: "#f8f8f2",
      muted: "#b6b8c9",
      mutedDim: "#8b8ea3",
      accent: "#50fa7b",
      accentSoft: "#7dfd9c",
      accentDim: "#2fae55",
      accentContrast: "#10231a",
      warn: "#f1fa8c",
      danger: "#ff5555",
      info: "#8be9fd",
      diff: ["#7dfd9c", "#50fa7b", "#8be9fd", "#f1fa8c", "#ffb86c", "#ff5555", "#bd93f9"],
    }
  ),

  amoled: makeTheme(
    "amoled",
    "Amoled",
    "True black for OLED panels and maximum contrast.",
    "dark",
    {
      bg: "#000000",
      bgElevated: "#0a0a0a",
      bgPanel: "#0d0d0d",
      line: "#222222",
      lineSoft: "#161616",
      lineStrong: "#3a3a3a",
      text: "#f4f4f4",
      muted: "#9c9c9c",
      mutedDim: "#6e6e6e",
      accent: "#00e5a0",
      accentSoft: "#4dffc4",
      accentDim: "#00a273",
      accentContrast: "#001a12",
      warn: "#ffcc4d",
      danger: "#ff5c7a",
      info: "#4dd2ff",
      diff: ["#4dffc4", "#00e5a0", "#4dd2ff", "#ffcc4d", "#ffa14d", "#ff5c7a", "#d17dff"],
    }
  ),

  light: makeTheme(
    "light",
    "Daylight",
    "Clean neutral light theme for bright rooms and projectors.",
    "light",
    {
      bg: "#f4f6f9",
      bgElevated: "#ffffff",
      bgPanel: "#ffffff",
      line: "#d5dde8",
      lineSoft: "#e6ebf2",
      lineStrong: "#b7c3d4",
      text: "#121820",
      muted: "#5a6a7d",
      mutedDim: "#7a8a9c",
      accent: "#1f9e68",
      accentSoft: "#2cb87a",
      accentDim: "#167a50",
      accentContrast: "#ffffff",
      warn: "#a8740f",
      danger: "#c53d4a",
      info: "#2a7fc4",
      diff: ["#2cb87a", "#1f9e68", "#2a7fc4", "#a8740f", "#c2610f", "#c53d4a", "#8b34d4"],
    }
  ),

  solarized: makeTheme(
    "solarized",
    "Solarized",
    "Warm paper tones with the classic teal accent.",
    "light",
    {
      bg: "#fdf6e3",
      bgElevated: "#fffdf6",
      bgPanel: "#fffdf6",
      line: "#e0d8bf",
      lineSoft: "#efe9d5",
      lineStrong: "#c3bb9f",
      text: "#073642",
      muted: "#57706f",
      mutedDim: "#8a9797",
      accent: "#1f8a82",
      accentSoft: "#2aa198",
      accentDim: "#166862",
      accentContrast: "#ffffff",
      warn: "#a37400",
      danger: "#dc322f",
      info: "#268bd2",
      diff: ["#6f8700", "#1f8a82", "#268bd2", "#a37400", "#cb4b16", "#dc322f", "#6c71c4"],
    }
  ),
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];
export const THEME_LIST: Theme[] = THEME_IDS.map((id) => THEMES[id]);

export const DEFAULT_THEME: ThemeId = "dark";
export const THEME_COOKIE = "diu_theme";
export const THEME_STORAGE_KEY = "diu_theme";

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && (THEME_IDS as string[]).includes(v);
}

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === "system" || isThemeId(v);
}

/** Normalises anything (cookie, DB row, legacy uppercase enum) to a mode. */
export function normalizeThemeMode(v: unknown): ThemeMode {
  if (typeof v !== "string") return DEFAULT_THEME;
  const lower = v.toLowerCase();
  if (lower === "system") return "system";
  return isThemeId(lower) ? lower : DEFAULT_THEME;
}

/** The theme actually painted, given a mode and the OS preference. */
export function resolveTheme(mode: ThemeMode, prefersLight: boolean): ThemeId {
  if (mode === "system") return prefersLight ? "light" : "dark";
  return mode;
}

function varsFor(theme: Theme): string {
  const p = theme.palette;
  const s = theme.surface;
  return [
    `--bg: ${p.bg}`,
    `--bg-elevated: ${p.bgElevated}`,
    `--bg-panel: ${p.bgPanel}`,
    `--line: ${p.line}`,
    `--line-soft: ${p.lineSoft}`,
    `--line-strong: ${p.lineStrong}`,
    `--text: ${p.text}`,
    `--muted: ${p.muted}`,
    `--muted-dim: ${p.mutedDim}`,
    `--accent: ${p.accent}`,
    `--accent-soft: ${p.accentSoft}`,
    `--accent-dim: ${p.accentDim}`,
    `--accent-contrast: ${p.accentContrast}`,
    `--warn: ${p.warn}`,
    `--danger: ${p.danger}`,
    `--info: ${p.info}`,
    `--accent-surface: ${s.accentSurface}`,
    `--accent-surface-strong: ${s.accentSurfaceStrong}`,
    `--accent-border: ${s.accentBorder}`,
    `--danger-surface: ${s.dangerSurface}`,
    `--danger-border: ${s.dangerBorder}`,
    `--warn-surface: ${s.warnSurface}`,
    `--warn-border: ${s.warnBorder}`,
    `--hover: ${s.hover}`,
    `--button-highlight: ${s.buttonHighlight}`,
    `--sunken: ${s.sunken}`,
    `--overlay: ${s.overlay}`,
    `--panel-highlight: ${s.panelHighlight}`,
    `--selection-bg: ${s.selectionBg}`,
    `--selection-text: ${s.selectionText}`,
    `--scroll-thumb-hover: ${s.scrollThumbHover}`,
    `--gradient-top: ${s.gradientTop}`,
    `--diff-ve: ${p.diff[0]}`,
    `--diff-e: ${p.diff[1]}`,
    `--diff-m: ${p.diff[2]}`,
    `--diff-mh: ${p.diff[3]}`,
    `--diff-h: ${p.diff[4]}`,
    `--diff-vh: ${p.diff[5]}`,
    `--diff-x: ${p.diff[6]}`,
    `color-scheme: ${theme.scheme}`,
  ].join(";");
}

/**
 * Full stylesheet for every theme. Injected once in the root layout so the
 * variables are defined before any component paints.
 *
 * `system` deliberately has no palette of its own — it borrows dark/light.
 */
export function themeCss(): string {
  const blocks: string[] = [
    `:root{${varsFor(THEMES.dark)}}`,
    `@media (prefers-color-scheme: light){:root:not([data-theme]){${varsFor(THEMES.light)}}}`,
  ];
  for (const id of THEME_IDS) {
    blocks.push(`[data-theme="${id}"]{${varsFor(THEMES[id])}}`);
  }
  return blocks.join("");
}

/** Meta theme-color for the browser chrome. */
export function themeColorFor(mode: ThemeMode): string {
  const id = mode === "system" ? DEFAULT_THEME : mode;
  return THEMES[id].palette.bg;
}
