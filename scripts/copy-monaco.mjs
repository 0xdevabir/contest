/**
 * Copies Monaco's prebuilt AMD bundle into public/ so the editor loads from our
 * own origin. The CDN default is blocked by the app's `script-src 'self'` CSP,
 * which leaves the editor stuck on "Loading..." forever.
 *
 * Runs before dev and build. Output is gitignored and regenerated on install.
 */
import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const SOURCE = path.join(process.cwd(), "node_modules", "monaco-editor", "min", "vs");
const DEST = path.join(process.cwd(), "public", "monaco", "vs");

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(SOURCE))) {
  console.error(
    "monaco-editor is not installed. Run `npm install` before building."
  );
  process.exit(1);
}

// The loader resolves modules lazily by path, so a partial copy fails at runtime
// rather than at build time. Always replace the whole directory.
await rm(path.join(process.cwd(), "public", "monaco"), {
  recursive: true,
  force: true,
});
await mkdir(DEST, { recursive: true });
await cp(SOURCE, DEST, { recursive: true });

console.log(`monaco: copied min/vs -> public/monaco/vs`);
