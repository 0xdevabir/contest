import type { CSSProperties } from "react";

/** A single shimmering placeholder block. Colours come from theme tokens. */
export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />;
}

/** Header block that mirrors the <PageHeader> rhythm while a page loads. */
export function PageHeaderSkeleton() {
  return (
    <div className="border-b border-[var(--line-soft)] pb-5 sm:pb-7">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-3 h-8 w-2/3 max-w-md" />
      <Skeleton className="mt-3.5 h-4 w-full max-w-xl" />
    </div>
  );
}

/** A vertical stack of list-row placeholders inside a panel. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="panel mt-6 divide-y divide-[var(--line-soft)] overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="mt-2 h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** A responsive grid of card placeholders. */
export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="panel p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-5 w-3/4" />
          <Skeleton className="mt-4 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-5/6" />
          <Skeleton className="mt-5 h-8 w-24" />
        </div>
      ))}
    </div>
  );
}
