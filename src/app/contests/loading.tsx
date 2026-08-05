import { PageHeaderSkeleton, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div
      className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16"
      aria-busy="true"
      aria-label="Loading contests"
    >
      <PageHeaderSkeleton />

      <div className="panel mt-8 grid overflow-hidden sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className={`flex items-center justify-between px-4 py-3.5 ${
              item > 0 ? "border-t border-[var(--line)] sm:border-t-0 sm:border-l" : ""
            }`}
          >
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-5" />
          </div>
        ))}
      </div>

      <div className="mt-12 space-y-14">
        {[0, 1, 2].map((section) => (
          <section key={section}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-7 w-44" />
            <Skeleton className="mt-2 h-4 w-full max-w-lg" />
            <div className="mt-4 grid gap-4 border-t border-[var(--line)] pt-4 lg:grid-cols-2">
              {[0, 1].map((card) => (
                <div key={card} className="panel p-5">
                  <div className="flex justify-between gap-4">
                    <div className="flex-1">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="mt-2 h-6 w-3/4" />
                    </div>
                    <Skeleton className="h-6 w-14" />
                  </div>
                  <Skeleton className="mt-3 h-4 w-full" />
                  <Skeleton className="mt-2 h-4 w-2/3" />
                  <div className="mt-4 grid grid-cols-2 gap-3 border-y border-[var(--line)] py-3">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <div className="mt-4 flex justify-between">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

