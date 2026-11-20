import { Link, useLocation } from 'react-router-dom';
import {
  Calendar,
  CalendarDays,
  ExternalLink,
  MapPin,
  MessagesSquare,
  Mic,
  MonitorPlay,
  Presentation,
  Users,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Opportunity, OpportunityFormat } from '../../types';
import { useSaveCall } from '../../hooks/useSaveCall';
import { callState } from '../../lib/callState';
import { formatDeadline } from '../../lib/dates';
import { sectorLabel } from '../../lib/sectors';
import { approximate, isLowConfidence } from '../../utils/verification';
import { MatchPill } from '../MatchHints';
import { SaveOpportunityMenu } from '../SaveOpportunityMenu';
import { DateWithConfidence } from '../VerificationHints';
import { Countdown } from './Countdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const FORMAT_ICONS: Record<OpportunityFormat, LucideIcon> = {
  conference: Presentation,
  meetup: Users,
  podcast: Mic,
  webinar: MonitorPlay,
  workshop: Wrench,
  panel: MessagesSquare,
  other: CalendarDays,
};

/** The grid every row and the skeleton share, so the columns line up down the list. */
export const CALL_ROW_GRID =
  '-mx-3 grid grid-cols-[4.75rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 border-b px-3 py-4 md:grid-cols-[5.25rem_minmax(0,1fr)_auto] md:items-center lg:grid-cols-[5.5rem_minmax(0,1fr)_10.5rem_auto] lg:gap-x-6';

const sameText = (a: string | null | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

function whereLabel(opportunity: Opportunity): string | null {
  if (!opportunity.isRemote) return opportunity.location;
  return opportunity.location ? `${opportunity.location}, or remote` : 'Remote';
}

function payLabel(opportunity: Opportunity): string | null {
  if (!opportunity.compensationType) return null;
  return opportunity.compensationAmount
    ? `${opportunity.compensationType}, $${opportunity.compensationAmount.toLocaleString('en-US')}`
    : opportunity.compensationType;
}

/**
 * One call on Browse. It leads with where the call stands (days left), then
 * what it is, its dates, how it fits the profile, and the two things to do
 * with it. The title is the row's link and covers the row; everything else you
 * can act on sits above it.
 */
export function CallRow({ opportunity }: { opportunity: Opportunity }) {
  const location = useLocation();
  const { savedCategory, isSaving, save } = useSaveCall(opportunity);
  const state = callState(opportunity);
  const hasCall = state.kind !== 'watch';
  const FormatIcon = FORMAT_ICONS[opportunity.format] ?? CalendarDays;
  const organization = sameText(opportunity.organization, opportunity.title) ? null : opportunity.organization;
  const where = whereLabel(opportunity);
  const pay = payLabel(opportunity);
  const closes = state.kind === 'closing' ? formatDeadline(opportunity)?.date : null;

  return (
    <li
      className={cn(
        CALL_ROW_GRID,
        'relative transition-colors duration-hover ease-out hover:bg-[var(--row-hover)]',
        state.kind === 'closed' && 'opacity-60'
      )}
    >
      <Countdown opportunity={opportunity} state={state} />

      <div className="min-w-0">
        <h3 className="text-[15px] font-medium leading-snug">
          <Link
            to={`/opportunities/${opportunity.id}`}
            state={{ from: `${location.pathname}${location.search}` }}
            className="line-clamp-2 text-foreground transition-colors duration-hover after:absolute after:inset-0 hover:text-primary focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
          >
            {opportunity.title}
          </Link>
        </h3>
        <ul className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground [&_svg]:size-3.5 [&_svg]:flex-none">
          {opportunity.isLiveResult && (
            <li>
              <Badge variant="good">
                <Zap aria-hidden="true" />
                Live
              </Badge>
            </li>
          )}
          <li className="inline-flex items-center gap-1.5 capitalize">
            <FormatIcon aria-hidden="true" />
            {opportunity.format}
          </li>
          {organization && <li className="max-w-full truncate sm:max-w-[20rem]">{organization}</li>}
          {where && (
            <li className="inline-flex max-w-full items-center gap-1.5 sm:max-w-[18rem]">
              <MapPin aria-hidden="true" />
              <span className="min-w-0 truncate">{where}</span>
            </li>
          )}
          {pay && (
            <li className="inline-flex items-center gap-1.5 capitalize">
              <Wallet aria-hidden="true" />
              {pay}
            </li>
          )}
          {/* Below the wide layout the dates column folds into this line. */}
          <li className="relative z-[1] inline-flex items-center gap-1.5 lg:hidden">
            <Calendar aria-hidden="true" />
            <DateWithConfidence opportunity={opportunity} field="eventDate" fallback="Event date not announced" />
          </li>
          {opportunity.sectors?.map((sector) => (
            <li key={sector}>
              <Badge variant="secondary" className="h-[22px] px-1.5">
                {sectorLabel(sector)}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      <dl className="relative z-[1] hidden text-[13px] leading-[1.6] lg:block">
        {closes && (
          <div>
            <dt className="inline text-muted-foreground">Closes </dt>
            <dd className="inline tabular-nums">{approximate(closes, isLowConfidence(opportunity, 'cfpDeadline'))}</dd>
          </div>
        )}
        <div>
          <dt className="inline text-muted-foreground">Event </dt>
          <dd className="inline tabular-nums">
            <DateWithConfidence opportunity={opportunity} field="eventDate" fallback="not announced" />
          </dd>
        </div>
      </dl>

      <div className="relative z-[1] col-start-2 flex items-center gap-2 md:col-start-auto md:justify-end">
        <MatchPill opportunity={opportunity} />
        <SaveOpportunityMenu savedCategory={savedCategory} isSaving={isSaving} onSave={save} />
        <Button variant="outline" size="sm" asChild>
          <a
            href={opportunity.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={hasCall ? `Apply to ${opportunity.title}` : `View the event page of ${opportunity.title}`}
          >
            {hasCall ? 'Apply' : 'View event'}
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      </div>
    </li>
  );
}
