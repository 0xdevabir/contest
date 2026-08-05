// Twitter cards share the same generated image as Open Graph. We re-export
// from `opengraph-image.tsx` so the rendered asset stays in sync, but we
// have to redeclare the route-segment config (Next.js cannot re-export
// `runtime` across files).
export { default } from "./opengraph-image";
export { alt, size, contentType } from "./opengraph-image";
export const runtime = "edge";