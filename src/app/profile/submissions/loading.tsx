import { Skeleton, ListSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-1/2 max-w-xs" />
      <ListSkeleton rows={10} />
    </div>
  );
}
