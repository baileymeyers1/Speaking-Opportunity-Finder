import type { ReactNode } from 'react';
import type { Opportunity } from '../../types';
import { payLabel } from '../../lib/callDisplay';
import { checkedAgo } from '../../lib/callStanding';
import { sourceLabel } from '../../lib/eventHints';
import { fitSummary, namedFits } from '../../lib/forWhom';
import { useForWhom } from '../../hooks/useForWhom';
import { sectorLabel } from '../../lib/sectors';
import { hasMatchScore, MatchList } from '../MatchHints';
import { DateWithConfidence } from '../VerificationHints';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] gap-x-4 py-2.5">
      <dt className="text-[13px] leading-[1.6] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm leading-[1.5] text-foreground">{children}</dd>
    </div>
  );
}

const capitalize = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

const OPENING_CHARS = 60;

function repeatsDescription(details: string | null, description: string | null): boolean {
  if (!details || !description) return false;
  const opening = details.trim().slice(0, OPENING_CHARS).toLowerCase();
  return opening.length >= 20 && description.trim().toLowerCase().startsWith(opening);
}

/**
 * What is known about a call, as a short list beside its description. A fact
 * the page did not state says so ("Not stated") instead of leaving a gap; a
 * fact that only some calls have (topics, fit, other sources) shows only then.
 */
export function CallFacts({ opportunity }: { opportunity: Opportunity }) {
  const pay = payLabel(opportunity);
  // Some sources put the whole call text in the pay details; shown here it would only repeat the description.
  const payDetails = repeatsDescription(opportunity.compensationDetails, opportunity.description)
    ? null
    : opportunity.compensationDetails;
  const sectors = (opportunity.sectors ?? []).map(sectorLabel);
  const checked = checkedAgo(opportunity);
  const otherSources = (opportunity.alsoListedOn ?? []).map(sourceLabel);
  // Every speaker's fit with their name on it; a roster of several gets the list, anyone else the one score.
  const { speakers, canChoose } = useForWhom();
  const fits = namedFits(opportunity.speakerFits, speakers);
  // The listing is only worth a link when it is a different page from the one "Apply" opens.
  const listingUrl = opportunity.sourceUrl && opportunity.sourceUrl !== opportunity.applyUrl ? opportunity.sourceUrl : null;

  return (
    <dl className="divide-y border-y">
      <Fact label="Event">
        <DateWithConfidence opportunity={opportunity} field="eventDate" style="long" fallback="Not announced" />
      </Fact>

      <Fact label="Pay">
        {pay ? capitalize(pay) : <span className="text-muted-foreground">Not stated</span>}
        {payDetails && <p className="mt-1 line-clamp-4 text-[13px] text-muted-foreground">{payDetails}</p>}
      </Fact>
      <Fact label="Fee to present">
        {opportunity.payToPresent === true ? (
          'Speakers pay a registration, publication or presentation fee'
        ) : opportunity.payToPresent === false ? (
          'None: speakers attend free'
        ) : (
          <span className="text-muted-foreground">Not stated</span>
        )}
      </Fact>

      {sectors.length > 0 && <Fact label={sectors.length > 1 ? 'Sectors' : 'Sector'}>{sectors.join(', ')}</Fact>}

      {opportunity.industries.length > 0 && <Fact label="Topics">{capitalize(opportunity.industries.join(', '))}</Fact>}

      {hasMatchScore(opportunity) &&
        (canChoose && fits.length > 1 ? (
          <Fact label="Who fits">
            <ul className="space-y-2">
              {fits.map((fit) => (
                <li key={fit.speakerId}>
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">{fit.name}</span>
                    <span className="flex-none tabular-nums">{fit.score}%</span>
                  </p>
                  {fitSummary(fit) && <p className="text-[13px] text-muted-foreground">{fitSummary(fit)}</p>}
                </li>
              ))}
            </ul>
          </Fact>
        ) : (
          <Fact label={fits[0] ? `Fit for ${fits[0].name}` : 'Fit'}>
            <p className="tabular-nums">{opportunity.matchScore}% match</p>
            <div className="mt-2">
              <MatchList opportunity={opportunity} />
            </div>
          </Fact>
        ))}

      <Fact label="Checked">
        {checked ? `${checked}, against the event page` : <span className="text-muted-foreground">Not checked yet</span>}
      </Fact>

      <Fact label="Source">
        {listingUrl ? (
          <a href={listingUrl} target="_blank" rel="noopener noreferrer" className="link">
            {capitalize(sourceLabel(opportunity.source))}
          </a>
        ) : (
          capitalize(sourceLabel(opportunity.source))
        )}
        {otherSources.length > 0 && <span className="text-muted-foreground">; also on {otherSources.join(', ')}</span>}
      </Fact>
    </dl>
  );
}
