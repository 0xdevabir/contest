import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-1/2 max-w-xs" />
      <div className="mt-6 space-y-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="panel p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="mt-3 h-2.5 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
