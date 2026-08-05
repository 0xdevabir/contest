import { PageHeaderSkeleton, ListSkeleton, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeaderSkeleton />

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="panel px-4 py-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2.5 h-7 w-14" />
          </div>
        ))}
      </div>

      <div className="mt-7 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-3 w-14" />
            {Array.from({ length: 4 }).map((__, j) => (
              <Skeleton key={j} className="h-7 w-16 rounded-lg" />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="panel space-y-3 p-4">
            <Skeleton className="h-3 w-10" />
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>

      <div className="mt-4">
        <ListSkeleton rows={10} />
      </div>
    </div>
  );
}
