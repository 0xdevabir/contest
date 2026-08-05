import { BRAND } from "@/lib/brand";

export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="relative grid shrink-0 place-items-center rounded-[9px] border border-[var(--line-strong)] bg-[var(--bg-elevated)]"
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 rounded-[9px] opacity-70"
        style={{
          background:
            "linear-gradient(150deg, rgba(62,207,142,0.16), transparent 55%)",
        }}
      />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: size * 0.56, height: size * 0.56 }}
        className="relative"
      >
        <path d="M8 8.5 12 12l-4 3.5" />
        <path d="M13.5 16h3" />
      </svg>
    </span>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-tight whitespace-nowrap ${className}`}>
      <span className="text-[var(--accent)]">{BRAND.prefix}</span>{" "}
      <span>{BRAND.wordmark}</span>
    </span>
  );
}
