import { useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useOpportunity } from '../hooks/useOpportunity';
import { useSaveOpportunity } from '../hooks/useSaveOpportunity';
import type { SavedCategory } from '../types';
import { OpportunityDetailSkeleton } from '../components/OpportunityDetailSkeleton';
import { VerifiedBadge } from '../components/VerificationHints';
import { AlsoListedOn, EventEditionsList } from '../components/EventHints';
import { DetailDates } from '../components/DetailDates';
import { sectorLabel } from '../lib/sectors';
import { hasMatchScore, MatchExplanationBlock } from '../components/MatchHints';

import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

import {
  ArrowLeft,
  MapPin,
  Globe,
  DollarSign,
  ExternalLink,
  Zap,
  Star,
  AlertCircle,
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
        <h2 className="text-xl font-medium text-foreground mb-1">
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
            <h1 className="title text-foreground">
              {opportunity.title}
            </h1>
            <div className="flex items-center gap-2 flex-shrink-0">
              {opportunity.isLiveResult && (
                <Badge variant="good">
                  <Zap aria-hidden="true" />
                  Live
                </Badge>
              )}
              <Badge variant="secondary" className="capitalize">
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
              <Badge variant="secondary">
                <Globe aria-hidden="true" />
                Remote
              </Badge>
            )}
            {opportunity.location && (
              <Badge variant="secondary">
                <MapPin aria-hidden="true" />
                {opportunity.location}
              </Badge>
            )}
            {opportunity.compensationType ? (
              <Badge variant="outline" className="capitalize">
                <DollarSign aria-hidden="true" />
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
              <Badge variant="outline" className="tabular-nums">
                <Star aria-hidden="true" />
                Quality {opportunity.qualityScore}/100
              </Badge>
            )}
            <VerifiedBadge opportunity={opportunity} variant="badge" />
          </div>
          <AlsoListedOn opportunity={opportunity} />
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Match against the signed-in user's speaker profile */}
          {hasMatchScore(opportunity) && (
            <>
              <MatchExplanationBlock opportunity={opportunity} />
              <Separator />
            </>
          )}

          {/* Description */}
          {opportunity.description && (
            <div className="space-y-2">
              <h2 className="text-base font-medium text-foreground">
                Description
              </h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {opportunity.description}
              </p>
            </div>
          )}

          <Separator />

          <DetailDates opportunity={opportunity} />

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

          {/* Sector, then the free-text topics */}
          {(opportunity.sectors?.length ?? 0) > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">Sector</h3>
              <div className="flex flex-wrap gap-2">
                {opportunity.sectors?.map((sector) => (
                  <Badge key={sector} variant="secondary">
                    {sectorLabel(sector)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Topics</h3>
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

          {opportunity.eventEditions && opportunity.eventEditions.length > 1 && (
            <>
              <Separator />
              <EventEditionsList currentId={opportunity.id} editions={opportunity.eventEditions} />
            </>
          )}

          <Separator />

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button className="flex-1" size="lg" asChild>
              <a
                href={opportunity.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={
                  opportunity.hasOpenCall === false
                    ? `View the event page of ${opportunity.title}`
                    : `Apply now to ${opportunity.title}`
                }
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {opportunity.hasOpenCall === false ? 'View Event' : 'Apply Now'}
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
                  className="link"
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
