import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import type { Opportunity, SavedOpportunity, SavedCategory } from '../types';
import { getLiveResultById, removeLiveResult } from '../utils/liveResultsCache';

import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

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
  Bookmark,
  BookmarkCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedCategory, setSavedCategory] = useState<SavedCategory | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchOpportunity = async () => {
      if (!id) return;

      setIsLoading(true);
      try {
        if (id.startsWith('live-')) {
          const cached = getLiveResultById(id);
          if (cached) {
            setOpportunity(cached);
            return;
          }
        }

        const response = await apiClient.get<Opportunity>(`/opportunities/${id}`);
        if (response.data) setOpportunity(response.data);
      } catch (err) {
        if (id.startsWith('live-')) {
          setError('This live search result is no longer cached. Please search again to find it.');
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchOpportunity();
  }, [id]);

  const handleSave = async (category: SavedCategory) => {
    if (!id || !isAuthenticated || !opportunity) return;

    setIsSaving(true);
    try {
      let opportunityId = id;
      let target = opportunity;

      if (opportunity.isLiveResult) {
        const saved = await apiClient.post<Opportunity>('/opportunities/save-live', {
          title: opportunity.title,
          organization: opportunity.organization,
          description: opportunity.description,
          location: opportunity.location,
          isRemote: opportunity.isRemote,
          eventDate: opportunity.eventDate,
          cfpDeadline: opportunity.cfpDeadline,
          format: opportunity.format,
          industries: opportunity.industries,
          compensationType: opportunity.compensationType,
          compensationAmount: opportunity.compensationAmount,
          compensationDetails: opportunity.compensationDetails,
          qualityScore: opportunity.qualityScore,
          applyUrl: opportunity.applyUrl,
          liveSearchUrl: opportunity.liveSearchUrl,
        });

        if (saved.data) {
          target = { ...saved.data, isLiveResult: false };
          setOpportunity(target);
          opportunityId = saved.data.id;
          removeLiveResult(id);
        }
      }

      await apiClient.post<SavedOpportunity>('/saved', {
        opportunityId,
        category,
      });

      setSavedCategory(category);

      if (target.id !== id) {
        navigate(`/opportunities/${target.id}`, { replace: true });
      }
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardHeader className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-5 w-1/3" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-40" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-40" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
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
                  {opportunity.eventDate
                    ? formatDate(opportunity.eventDate)
                    : 'Not listed'}
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
                  {opportunity.cfpDeadline
                    ? formatDate(opportunity.cfpDeadline)
                    : 'Not listed'}
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
                {savedCategory ? (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary/5 border border-primary/20">
                    <BookmarkCheck className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-primary capitalize">
                      Saved as {savedCategory}
                    </span>
                  </div>
                ) : (
                  <Select
                    onValueChange={(value) =>
                      handleSave(value as SavedCategory)
                    }
                    disabled={isSaving}
                  >
                    <SelectTrigger
                      className={cn(
                        'w-[160px]',
                        isSaving && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <Bookmark className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Save to..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interested">Interested</SelectItem>
                      <SelectItem value="applied">Applied</SelectItem>
                      <SelectItem value="accepted">Accepted</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                )}
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
