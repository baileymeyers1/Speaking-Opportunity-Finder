import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Zap } from 'lucide-react';
import { useOpportunity } from '../hooks/useOpportunity';
import { useSaveCall } from '../hooks/useSaveCall';
import { organizationLabel, plainDescription, whereLabel } from '../lib/callDisplay';
import { FORMAT_ICONS } from '../lib/formatIcons';
import { CallFacts } from '../components/call/CallFacts';
import { CallStanding } from '../components/call/CallStanding';
import { CALL_PAGE_COLUMNS, CALL_PAGE_WIDTH } from '../components/call/layout';
import { EventEditionsList } from '../components/EventHints';
import { OpportunityDetailSkeleton } from '../components/OpportunityDetailSkeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * One call. Under the title sits a single row of action (where the call
 * stands, when it closes, save and apply); then what the call says about
 * itself beside what is known about it. It sits on the page, not in a card.
 */
export function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: opportunity, isPending: isLoading, error: loadError } = useOpportunity(id);
  const { savedCategory, isSaving, save } = useSaveCall(opportunity, {
    // Saving a live result stores it; the page moves to the stored row's address.
    onSaved: (result) => {
      if (result.opportunity.id !== id) {
        navigate(`/opportunities/${result.opportunity.id}`, { replace: true, state: location.state });
      }
    },
  });
  const backTo = (location.state as { from?: string } | null)?.from || '/';

  if (isLoading) return <OpportunityDetailSkeleton />;

  if (loadError || !opportunity) {
    return (
      <div role="alert" className={`${CALL_PAGE_WIDTH} py-10`}>
        <h1 className="title text-foreground">{loadError ? loadError.message : 'This call is not here'}</h1>
        <p className="mt-2 max-w-[60ch] text-muted-foreground">
          It may have closed and left the list, or the link is wrong.
        </p>
        <Button variant="outline" className="mt-5" asChild>
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            Back to calls
          </Link>
        </Button>
      </div>
    );
  }

  const FormatIcon = FORMAT_ICONS[opportunity.format] ?? FORMAT_ICONS.other;
  const organization = organizationLabel(opportunity);
  const where = whereLabel(opportunity);

  return (
    <article className={CALL_PAGE_WIDTH}>
      <Button variant="ghost" size="sm" className="-ml-3" asChild>
        <Link to={backTo}>
          <ArrowLeft aria-hidden="true" />
          Back to calls
        </Link>
      </Button>

      <header className="mt-4">
        <h1 className="title text-foreground">{opportunity.title}</h1>
        <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground [&_svg]:size-4 [&_svg]:flex-none">
          {opportunity.isLiveResult && (
            <li>
              <Badge variant="good">
                <Zap aria-hidden="true" />
                Live
              </Badge>
            </li>
          )}
          {organization && <li>{organization}</li>}
          <li className="inline-flex items-center gap-1.5 capitalize">
            <FormatIcon aria-hidden="true" />
            {opportunity.format}
          </li>
          {where && (
            <li className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden="true" />
              {where}
            </li>
          )}
        </ul>
      </header>

      <div className="mt-6">
        <CallStanding opportunity={opportunity} savedCategory={savedCategory} isSaving={isSaving} onSave={save} />
      </div>

      <div className={CALL_PAGE_COLUMNS}>
        <div className="order-2 space-y-10 lg:order-1">
          <section aria-labelledby="about-this-call">
            <h2 id="about-this-call" className="heading text-foreground">
              About this call
            </h2>
            {opportunity.description ? (
              <p className="mt-2 max-w-[68ch] whitespace-pre-wrap text-foreground/90">
                {plainDescription(opportunity.description)}
              </p>
            ) : (
              <p className="mt-2 max-w-[68ch] text-muted-foreground">
                The listing came with no description. The event page has the details.
              </p>
            )}
          </section>

          <EventEditionsList currentId={opportunity.id} editions={opportunity.eventEditions} />
        </div>

        <aside aria-label="Facts about this call" className="order-1 lg:order-2">
          <CallFacts opportunity={opportunity} />
        </aside>
      </div>
    </article>
  );
}

export default OpportunityDetail;
