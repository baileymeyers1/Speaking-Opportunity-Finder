import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

/** Placeholder matching the detail page layout while the opportunity loads. */
export function OpportunityDetailSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Back button */}
      <Skeleton className="h-9 w-48" />

      <Card>
        <CardHeader className="space-y-4">
          {/* Title + format badge */}
          <div className="flex items-start justify-between gap-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>

          {/* Organization */}
          <Skeleton className="h-5 w-1/2" />

          {/* Metadata badges */}
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-6 w-36 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Description */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/4" />
          </div>

          <Separator />

          {/* Date details grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-md" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-44" />
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-md" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Industries */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-20" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
          </div>

          <Separator />

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Skeleton className="h-11 flex-1 rounded-md" />
            <Skeleton className="h-11 w-[160px] rounded-md" />
          </div>

          {/* Source */}
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    </div>
  );
}
