import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * A dashboard section: heading, one-line description, and either a skeleton,
 * an error, or the content. The `id` is the anchor the attention strip links to.
 */
export function SectionCard({
  id,
  title,
  description,
  icon: Icon,
  isPending,
  error,
  actions,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  isPending: boolean;
  error: unknown;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <Card id={id} aria-labelledby={headingId} className="scroll-mt-20" role="region">
      <CardHeader className="flex flex-col gap-2 space-y-0 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="space-y-1">
          <CardTitle id={headingId} className="flex items-center gap-2 text-lg">
            <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        {isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label={`Loading ${title}`}>
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-5/6" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : error ? (
          <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            Could not load {title.toLowerCase()}: {error instanceof Error ? error.message : 'unknown error'}
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
