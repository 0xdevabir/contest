/**
 * Phase 14 D5 CI check — WCAG 2.1 AA contrast for every theme in
 * src/lib/theme.ts. Checks the pairs that actually render text/UI on top of
 * each other: body text and muted text on `bg`/`bgPanel`, accent-on-white
 * buttons, and the rating tier ramp (D5's flagged "known problem area")
 * against both `bg` and `bgPanel`, since tier badges render in both places.
 *
 * AA thresholds: 4.5:1 for normal text, 3:1 for large text / UI components.
 * Run: `tsx scripts/check-contrast.ts`
 */
import { THEMES, THEME_IDS } from "../src/lib/theme";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(hexToRgb(fg));
  const l2 = relativeLuminance(hexToRgb(bg));
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

type Check = { label: string; fg: string; bg: string; min: number };

function main() {
  let failed = false;

  for (const id of THEME_IDS) {
    const t = THEMES[id];
    const p = t.palette;
    const checks: Check[] = [
      { label: "text on bg", fg: p.text, bg: p.bg, min: 4.5 },
      { label: "text on bgPanel", fg: p.text, bg: p.bgPanel, min: 4.5 },
      { label: "muted on bg", fg: p.muted, bg: p.bg, min: 4.5 },
      { label: "accentContrast on accent (buttons)", fg: p.accentContrast, bg: p.accent, min: 4.5 },
      { label: "danger on bg", fg: p.danger, bg: p.bg, min: 3 },
      { label: "warn on bg", fg: p.warn, bg: p.bg, min: 3 },
      ...p.tier.map((c, i) => ({
        label: `tier[${i}] on bg`,
        fg: c,
        bg: p.bg,
        min: 3,
      })),
      ...p.tier.map((c, i) => ({
        label: `tier[${i}] on bgPanel`,
        fg: c,
        bg: p.bgPanel,
        min: 3,
      })),
    ];

    for (const c of checks) {
      const ratio = contrastRatio(c.fg, c.bg);
      if (ratio < c.min) {
        failed = true;
        console.error(
          `[${id}] ${c.label}: ${ratio.toFixed(2)}:1 (need ${c.min}:1) — ${c.fg} on ${c.bg}`
        );
      }
    }
  }

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log(`OK — every theme meets WCAG 2.1 AA for the checked pairs.`);
  }
}

main();
