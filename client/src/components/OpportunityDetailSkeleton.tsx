import { Skeleton } from '@/components/ui/skeleton';
import { CALL_PAGE_COLUMNS, CALL_PAGE_WIDTH } from './call/layout';

/** Placeholder in the shape of the call page while the call loads. */
export function OpportunityDetailSkeleton() {
  return (
    <div className={CALL_PAGE_WIDTH} aria-busy="true" aria-label="Loading the call">
      <Skeleton className="h-8 w-32" />

      <div className="mt-5 space-y-3">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>

      <div className="mt-6 flex items-center gap-6 border-y border-input py-5">
        <Skeleton className="h-12 w-16" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-72 max-w-full" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="hidden h-control w-24 md:block" />
        <Skeleton className="hidden h-control w-24 md:block" />
      </div>

      <div className={CALL_PAGE_COLUMNS}>
        <div className="order-2 space-y-3 lg:order-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="order-1 space-y-4 lg:order-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
    </div>
  );
}
