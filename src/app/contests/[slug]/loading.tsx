import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] px-3 py-6 sm:px-6 sm:py-8">
      <Skeleton className="h-4 w-48" />

      <div className="panel mt-5 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:max-w-md">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-2.5 h-7 w-3/4" />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <div className="sm:w-60">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-1.5 h-8 w-40" />
              <Skeleton className="mt-2 h-1.5 w-full" />
            </div>
            <div className="flex gap-2.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-20" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-4 border-b border-[var(--line)] pb-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-5 w-24" />
        ))}
      </div>

      <div className="panel-quiet mt-6 flex items-center gap-5 px-4 py-3">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-6 w-40" />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="panel p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="mt-2 h-3 w-2/5" />
              </div>
            </div>
            <Skeleton className="mt-4 h-3 w-32" />
            <div className="mt-4 border-t border-[var(--line)] pt-3">
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
