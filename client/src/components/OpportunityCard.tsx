import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import type { Opportunity, SavedCategory } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useSaveOpportunity } from '../hooks/useSaveOpportunity';
import { isPastDate } from '../lib/dates';
import { getDeadlineBadge, getQualityColor, getQualityLabel } from '../lib/opportunityDisplay';
import { SaveOpportunityMenu } from './SaveOpportunityMenu';
import { approximate, isLowConfidence } from '../utils/verification';
import { ApproximateHint, DateWithConfidence, VerifiedBadge } from './VerificationHints';
import { cn } from '@/lib/utils';

import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

import {
  MapPin,
  Calendar,
  Clock,
  DollarSign,
  Globe,
  ExternalLink,
  Zap,
  Star,
} from 'lucide-react';

interface OpportunityCardProps {
  opportunity: Opportunity;
  showSave?: boolean;
  isPast?: boolean;
}

export function OpportunityCard({ opportunity, showSave = true, isPast }: OpportunityCardProps) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const save = useSaveOpportunity();
  const [savedCategory, setSavedCategory] = useState<SavedCategory | ''>('');
  const current = opportunity;
  const isSaving = save.isPending;

  const deadlineBadge = getDeadlineBadge(current.cfpDeadline);
  const deadlineIsApproximate = !!current.cfpDeadline && isLowConfidence(current, 'cfpDeadline');
  const isLive = current.isLiveResult;
  const isPastDeadline = isPast ?? isPastDate(current.cfpDeadline);
  const hasCompensation = !!current.compensationType;
  const hasQualityScore =
    current.qualityScore !== undefined && current.qualityScore !== null;

  const compensationLabel = hasCompensation
    ? current.compensationAmount
      ? `${current.compensationType} - $${current.compensationAmount.toLocaleString()}`
      : current.compensationType
    : null;

  const handleSave = (category: SavedCategory) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    save.mutate(
      { opportunity: current, category },
      {
        onSuccess: () => setSavedCategory(category),
        onError: (error) => console.error('Failed to save:', error),
      }
    );
  };

  return (
    <Card className={cn(
      'group hover:shadow-lg hover:border-primary/20 transition-all duration-200',
      isPastDeadline && 'opacity-50 grayscale'
    )}>
      <CardHeader className="pb-3">
        {/* Title row with badges */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-snug">
            <Link
              to={`/opportunities/${current.id}`}
              state={{ from: `${location.pathname}${location.search}` }}
              className="text-foreground hover:text-primary transition-colors line-clamp-2"
            >
              {current.title}
            </Link>
          </h3>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isPastDeadline && (
              <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
                Deadline passed
              </Badge>
            )}
            {isLive && (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-700">
                <Zap className="h-3 w-3 mr-0.5" />
                Live
              </Badge>
            )}
            <Badge variant="secondary" className="capitalize">
              {current.format}
            </Badge>
          </div>
        </div>

        {/* Organization */}
        {current.organization && (
          <p className="text-sm text-muted-foreground leading-none">
            {current.organization}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Description */}
        {current.description && (
          <p className="text-sm text-muted-foreground line-clamp-3">
            {current.description}
          </p>
        )}

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {/* Event date */}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            <DateWithConfidence opportunity={current} field="eventDate" fallback="Date TBD" className="truncate" />
          </div>

          {/* Deadline */}
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
            {deadlineIsApproximate ? (
              <ApproximateHint>
                <Badge
                  variant={deadlineBadge.variant}
                  className={cn('text-[11px] px-1.5 py-0 cursor-help', deadlineBadge.className)}
                >
                  {approximate(deadlineBadge.label, true)}
                </Badge>
              </ApproximateHint>
            ) : (
              <Badge
                variant={deadlineBadge.variant}
                className={cn('text-[11px] px-1.5 py-0', deadlineBadge.className)}
              >
                {deadlineBadge.label}
              </Badge>
            )}
          </div>

          {/* Location / Remote */}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {current.isRemote ? (
              <>
                <Globe className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="truncate">
                  {current.location ? `${current.location} (Remote)` : 'Remote'}
                </span>
              </>
            ) : current.location ? (
              <>
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{current.location}</span>
              </>
            ) : (
              <>
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">Location TBD</span>
              </>
            )}
          </div>

          {/* Compensation -- only render if present */}
          {hasCompensation && compensationLabel && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="truncate capitalize">{compensationLabel}</span>
            </div>
          )}

          {/* Last checked against the event page */}
          <VerifiedBadge opportunity={current} variant="line" />
        </div>

        {/* Industry tags -- show ALL, wrap naturally */}
        {current.industries && current.industries.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {current.industries.map((industry) => (
              <Badge
                key={industry}
                variant="outline"
                className="text-[11px] px-2 py-0 font-normal capitalize"
              >
                {industry}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between gap-2">
        {/* Quality score indicator */}
        <div className="flex items-center">
          {hasQualityScore ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-default">
                  <Star className="h-3.5 w-3.5 text-muted-foreground" />
                  <div className="flex items-center gap-1">
                    <div
                      className={cn(
                        'h-2 w-2 rounded-full',
                        getQualityColor(current.qualityScore!)
                      )}
                    />
                    <span className="text-xs text-muted-foreground">
                      {current.qualityScore}
                    </span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {getQualityLabel(current.qualityScore!)} &mdash;{' '}
                  {current.qualityScore}/100
                </p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-xs text-muted-foreground">Score pending</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {showSave && (
            <SaveOpportunityMenu savedCategory={savedCategory} isSaving={isSaving} onSave={handleSave} />
          )}

          <Button variant="default" size="sm" className="h-8" asChild>
            <a
              href={current.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Apply to ${current.title}`}
            >
              Apply
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default OpportunityCard;
