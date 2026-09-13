import { Skeleton } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <div role="status" aria-label="読み込み中">
      <span className="sr-only">読み込み中です…</span>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <Skeleton className="mt-6 h-72 w-full" />
    </div>
  );
}
