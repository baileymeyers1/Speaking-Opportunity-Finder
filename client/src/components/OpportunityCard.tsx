import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import type { Opportunity } from '../types';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../api/client';
import { removeLiveResult } from '../utils/liveResultsCache';
import { cn } from '@/lib/utils';

import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Zap,
  Star,
} from 'lucide-react';

interface OpportunityCardProps {
  opportunity: Opportunity;
  showSave?: boolean;
}

const SAVE_CATEGORIES = [
  { value: 'interested', label: 'Interested' },
  { value: 'applied', label: 'Applied' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
] as const;

function formatDate(dateString: string | null): string | null {
  if (!dateString) return null;
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDeadlineBadge(dateString: string | null): {
  label: string;
  variant: 'secondary' | 'destructive' | 'outline';
  className?: string;
} {
  if (!dateString) {
    return { label: 'No deadline', variant: 'secondary' };
  }

  const now = new Date();
  const deadline = new Date(dateString);
  const daysLeft = Math.ceil(
    (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysLeft <= 0) {
    return { label: 'Closed', variant: 'destructive' };
  }
  if (daysLeft <= 3) {
    return { label: `${daysLeft}d left`, variant: 'destructive' };
  }
  if (daysLeft <= 7) {
    return {
      label: `${daysLeft}d left`,
      variant: 'outline',
      className: 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700',
    };
  }

  return { label: formatDate(dateString)!, variant: 'secondary' };
}

function getQualityColor(score: number): string {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function getQualityLabel(score: number): string {
  if (score >= 70) return 'High quality';
  if (score >= 40) return 'Medium quality';
  return 'Low quality';
}

export function OpportunityCard({ opportunity, showSave = true }: OpportunityCardProps) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [current, setCurrent] = useState(opportunity);
  const [isSaving, setIsSaving] = useState(false);
  const [savedCategory, setSavedCategory] = useState<string>('');

  useEffect(() => {
    setCurrent(opportunity);
  }, [opportunity]);

  const deadlineBadge = getDeadlineBadge(current.cfpDeadline);
  const isLive = current.isLiveResult;
  const hasCompensation = !!current.compensationType;
  const hasQualityScore =
    current.qualityScore !== undefined && current.qualityScore !== null;

  const compensationLabel = hasCompensation
    ? current.compensationAmount
      ? `${current.compensationType} - $${current.compensationAmount.toLocaleString()}`
      : current.compensationType
    : null;

  const handleSave = async (category: string) => {
    if (!category) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    setIsSaving(true);
    try {
      let target = current;

      if (current.isLiveResult) {
        const saved = await apiClient.post<Opportunity>('/opportunities/save-live', {
          title: current.title,
          organization: current.organization,
          description: current.description,
          location: current.location,
          isRemote: current.isRemote,
          eventDate: current.eventDate,
          cfpDeadline: current.cfpDeadline,
          format: current.format,
          industries: current.industries,
          compensationType: current.compensationType,
          compensationAmount: current.compensationAmount,
          compensationDetails: current.compensationDetails,
          qualityScore: current.qualityScore,
          applyUrl: current.applyUrl,
          liveSearchUrl: current.liveSearchUrl,
        });

        if (saved.data) {
          target = { ...saved.data, isLiveResult: false };
          setCurrent(target);
          removeLiveResult(current.id);
        }
      }

      await apiClient.post('/saved', {
        opportunityId: target.id,
        category,
      });

      setSavedCategory(category);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="group hover:shadow-lg hover:border-primary/20 transition-all duration-200">
      <CardHeader className="pb-3">
        {/* Title row with badges */}
        <div className="flex items-start justify-between gap-2">
          <Link
            to={`/opportunities/${current.id}`}
            state={{ from: `${location.pathname}${location.search}` }}
            className="text-base font-semibold leading-snug text-foreground hover:text-primary transition-colors line-clamp-2"
          >
            {current.title}
          </Link>
          <div className="flex items-center gap-1.5 flex-shrink-0">
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
            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">
              {current.eventDate ? formatDate(current.eventDate) : 'Date TBD'}
            </span>
          </div>

          {/* Deadline */}
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            <Badge
              variant={deadlineBadge.variant}
              className={cn('text-[11px] px-1.5 py-0', deadlineBadge.className)}
            >
              {deadlineBadge.label}
            </Badge>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isSaving}
                  className={cn(
                    'h-8 px-2',
                    savedCategory && 'text-primary'
                  )}
                >
                  {savedCategory ? (
                    <BookmarkCheck className="h-4 w-4" />
                  ) : (
                    <Bookmark className="h-4 w-4" />
                  )}
                  <span className="sr-only">
                    {savedCategory ? `Saved as ${savedCategory}` : 'Save opportunity'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Save to...</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SAVE_CATEGORIES.map((cat) => (
                  <DropdownMenuItem
                    key={cat.value}
                    onClick={() => handleSave(cat.value)}
                    className={cn(
                      'cursor-pointer',
                      savedCategory === cat.value && 'font-semibold text-primary'
                    )}
                  >
                    {cat.label}
                    {savedCategory === cat.value && (
                      <span className="ml-auto text-xs text-primary">Saved</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button variant="default" size="sm" className="h-8" asChild>
            <a
              href={current.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Apply
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default OpportunityCard;
