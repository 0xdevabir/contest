import { Skeleton } from "@/components/Skeleton";

// Rendered inside the profile layout, so the sidebar stays and only the
// content column swaps to a skeleton.
export default function Loading() {
  return (
    <div>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-1/2 max-w-xs" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="panel p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-7 w-12" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-8 h-32 w-full" />
    </div>
  );
}
