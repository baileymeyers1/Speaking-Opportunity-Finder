import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, ExternalLink, MapPin, Wallet, Zap } from 'lucide-react';
import type { Opportunity } from '../../types';
import { useSaveCall } from '../../hooks/useSaveCall';
import { organizationLabel, payLabel, whereLabel } from '../../lib/callDisplay';
import { callState } from '../../lib/callState';
import { formatDeadline } from '../../lib/dates';
import { FORMAT_ICONS } from '../../lib/formatIcons';
import { sectorLabel } from '../../lib/sectors';
import { approximate, isLowConfidence } from '../../utils/verification';
import { MatchPill } from '../MatchHints';
import { SaveOpportunityMenu } from '../SaveOpportunityMenu';
import { DateWithConfidence } from '../VerificationHints';
import { Countdown } from './Countdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** The grid every row and the skeleton share, so the columns line up down the list. */
export const CALL_ROW_GRID =
  '-mx-3 grid grid-cols-[4.75rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 border-b px-3 py-4 md:grid-cols-[5.25rem_minmax(0,1fr)_auto] md:items-center lg:grid-cols-[5.5rem_minmax(0,1fr)_10.5rem_auto] lg:gap-x-6';

interface CallRowFrameProps {
  opportunity: Opportunity;
  /** What the row leads with: days left on Browse, days to the event once applied. */
  lead: ReactNode;
  /** What can be done with the call from this list. Sits above the row's link. */
  actions: ReactNode;
  /** A row whose moment has passed (a call that closed before you applied) steps back. */
  dimmed?: boolean;
}

/**
 * One call as a row: a leading figure, what the call is, its dates, and the
 * list's own actions. Browse and Saved both use it, so a call reads the same
 * way in either. The title is the row's link and covers the row; everything
 * else you can act on sits above it.
 */
export function CallRowFrame({ opportunity, lead, actions, dimmed = false }: CallRowFrameProps) {
  const location = useLocation();
  const state = callState(opportunity);
  const FormatIcon = FORMAT_ICONS[opportunity.format] ?? FORMAT_ICONS.other;
  const organization = organizationLabel(opportunity);
  const where = whereLabel(opportunity);
  const pay = payLabel(opportunity);
  const closes = state.kind === 'closing' ? formatDeadline(opportunity)?.date : null;

  return (
    <li
      className={cn(
        CALL_ROW_GRID,
        'relative transition-colors duration-hover ease-out hover:bg-[var(--row-hover)]',
        dimmed && 'opacity-60'
      )}
    >
      {lead}

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

      <div className="relative z-[1] col-start-2 flex items-center gap-2 md:col-start-auto md:justify-end">{actions}</div>
    </li>
  );
}

/**
 * The link out that every list's row ends with: "Apply", "View event" for an
 * event with no call, or "View call" once you have applied (the page is the
 * same one; the word should not ask you to apply again).
 */
export function ApplyLink({ opportunity, applied = false }: { opportunity: Opportunity; applied?: boolean }) {
  const hasCall = opportunity.hasOpenCall !== false;
  const words = !hasCall
    ? { label: 'View event', name: `View the event page of ${opportunity.title}` }
    : applied
      ? { label: 'View call', name: `View the call page of ${opportunity.title}` }
      : { label: 'Apply', name: `Apply to ${opportunity.title}` };
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={opportunity.applyUrl} target="_blank" rel="noopener noreferrer" aria-label={words.name}>
        {words.label}
        <ExternalLink aria-hidden="true" />
      </a>
    </Button>
  );
}

/** One call on Browse: it leads with where the call stands, and can be saved or applied to. */
export function CallRow({ opportunity }: { opportunity: Opportunity }) {
  const { savedCategory, isSaving, save } = useSaveCall(opportunity);
  const state = callState(opportunity);

  return (
    <CallRowFrame
      opportunity={opportunity}
      dimmed={state.kind === 'closed'}
      lead={<Countdown opportunity={opportunity} state={state} />}
      actions={
        <>
          <MatchPill opportunity={opportunity} />
          <SaveOpportunityMenu savedCategory={savedCategory} isSaving={isSaving} onSave={save} />
          <ApplyLink opportunity={opportunity} />
        </>
      }
    />
  );
}
