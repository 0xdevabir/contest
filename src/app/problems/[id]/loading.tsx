import { Skeleton } from "@/components/Skeleton";

// The problem workspace loads Monaco + the terminal, so a two-pane skeleton
// makes the click feel instant while those chunks stream in.
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1500px] px-3 py-3 sm:px-6 sm:py-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:gap-5">
        <section className="panel flex flex-col gap-4 p-5 lg:h-[calc(100dvh-6.25rem)]">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-2 h-24 w-full" />
          <Skeleton className="h-20 w-full" />
        </section>
        <section className="panel flex flex-col overflow-hidden p-0 lg:h-[calc(100dvh-6.25rem)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <Skeleton className="h-4 w-20" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
          <div className="flex-1 space-y-2.5 p-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-3.5"
                style={{ width: `${40 + ((i * 37) % 55)}%` }}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
