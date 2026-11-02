import { useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useOpportunity } from '../hooks/useOpportunity';
import { useSaveOpportunity } from '../hooks/useSaveOpportunity';
import type { SavedCategory } from '../types';
import { formatDate } from '../lib/dates';
import { OpportunityDetailSkeleton } from '../components/OpportunityDetailSkeleton';
import { approximate, formatVerifiedAgo, isLowConfidence, LOW_CONFIDENCE_HINT } from '../utils/verification';

import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Globe,
  DollarSign,
  ExternalLink,
  Zap,
  Star,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { SaveOpportunitySelect } from '../components/SaveOpportunitySelect';

export function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { data: opportunity, isPending: isLoading, error: loadError } = useOpportunity(id);
  const save = useSaveOpportunity();
  const [savedCategory, setSavedCategory] = useState<SavedCategory | null>(null);
  const isSaving = save.isPending;
  const error = loadError ? loadError.message : null;

  const handleSave = (category: SavedCategory) => {
    if (!id || !isAuthenticated || !opportunity) return;
    save.mutate(
      { opportunity, category },
      {
        onSuccess: (result) => {
          setSavedCategory(category);
          if (result.opportunity.id !== id) {
            navigate(`/opportunities/${result.opportunity.id}`, { replace: true, state: location.state });
          }
        },
        onError: (saveError) => console.error('Failed to save:', saveError),
      }
    );
  };

  if (isLoading) {
    return <OpportunityDetailSkeleton />;
  }

  if (error || !opportunity) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-destructive/10 p-4 mb-4">
          <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-1">
          {error || 'Opportunity not found'}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          This opportunity may have been removed or the link is invalid.
        </p>
        <Button variant="outline" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Back to opportunities
          </Link>
        </Button>
      </div>
    );
  }

  const hasQualityScore =
    opportunity.qualityScore !== undefined && opportunity.qualityScore !== null;
  const verifiedLabel = formatVerifiedAgo(opportunity);

  const renderDate = (value: string | null, field: 'eventDate' | 'cfpDeadline') => {
    if (!value) return 'Not listed';
    const label = formatDate(value, 'long')!;
    if (!isLowConfidence(opportunity, field)) return label;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help underline decoration-dotted underline-offset-2">
            {approximate(label, true)}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{LOW_CONFIDENCE_HINT}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Back button */}
      <Button variant="ghost" size="sm" asChild>
        <Link to={(location.state as { from?: string } | null)?.from || '/'}>
          <ArrowLeft className="h-4 w-4" />
          Back to opportunities
        </Link>
      </Button>

      <Card>
        <CardHeader className="space-y-4">
          {/* Title + badges */}
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {opportunity.title}
            </h1>
            <div className="flex items-center gap-2 flex-shrink-0">
              {opportunity.isLiveResult && (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-700">
                  <Zap className="h-3 w-3 mr-0.5" />
                  Live
                </Badge>
              )}
              <Badge variant="secondary" className="capitalize text-sm">
                {opportunity.format}
              </Badge>
            </div>
          </div>

          {/* Organization */}
          <p className="text-lg text-muted-foreground">
            {opportunity.organization}
          </p>

          {/* Quick metadata badges */}
          <div className="flex flex-wrap gap-2">
            {opportunity.isRemote && (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-700">
                <Globe className="h-3 w-3 mr-1" />
                Remote
              </Badge>
            )}
            {opportunity.location && (
              <Badge variant="secondary">
                <MapPin className="h-3 w-3 mr-1" />
                {opportunity.location}
              </Badge>
            )}
            {opportunity.compensationType ? (
              <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700 capitalize">
                <DollarSign className="h-3 w-3 mr-1" />
                {opportunity.compensationType}
                {opportunity.compensationAmount
                  ? ` - $${opportunity.compensationAmount.toLocaleString()}`
                  : ''}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Compensation not listed
              </Badge>
            )}
            {hasQualityScore && (
              <Badge variant="outline" className="gap-1">
                <Star className="h-3 w-3" />
                Quality {opportunity.qualityScore}/100
              </Badge>
            )}
            {verifiedLabel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="gap-1 cursor-default text-emerald-700 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700">
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                    {verifiedLabel}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Dates and status were checked against the event page on {formatDate(opportunity.verifiedAt!)}.</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Description */}
          {opportunity.description && (
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">
                Description
              </h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {opportunity.description}
              </p>
            </div>
          )}

          <Separator />

          {/* Date details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-muted p-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Event Date
                </p>
                <p className="text-sm text-muted-foreground">
                  {renderDate(opportunity.eventDate, 'eventDate')}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-muted p-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  CFP Deadline
                </p>
                <p className="text-sm text-muted-foreground">
                  {renderDate(opportunity.cfpDeadline, 'cfpDeadline')}
                </p>
              </div>
            </div>
          </div>

          {/* Compensation details */}
          {opportunity.compensationDetails && (
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-muted p-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Compensation Details
                </p>
                <p className="text-sm text-muted-foreground">
                  {opportunity.compensationDetails}
                </p>
              </div>
            </div>
          )}

          <Separator />

          {/* Industries */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Industries</h3>
            <div className="flex flex-wrap gap-2">
              {opportunity.industries.length > 0 ? (
                opportunity.industries.map((industry) => (
                  <Badge
                    key={industry}
                    variant="outline"
                    className="capitalize"
                  >
                    {industry}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  Not listed
                </span>
              )}
            </div>
          </div>

          <Separator />

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button className="flex-1" size="lg" asChild>
              <a
                href={opportunity.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Apply now to ${opportunity.title}`}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Apply Now
              </a>
            </Button>

            {isAuthenticated && (
              <div className="flex items-center gap-2">
                <SaveOpportunitySelect savedCategory={savedCategory} isSaving={isSaving} onSave={handleSave} />
              </div>
            )}
          </div>

          {/* Source info */}
          <p className="text-xs text-muted-foreground">
            Source: {opportunity.source}
            {opportunity.sourceUrl && (
              <>
                {' '}
                (
                <a
                  href={opportunity.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  view
                </a>
                )
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default OpportunityDetail;
