import { PageHeaderSkeleton, ListSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeaderSkeleton />
      <ListSkeleton rows={12} />
    </div>
  );
}
