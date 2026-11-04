import type { Opportunity } from '../types';
import { DateWithConfidence } from './VerificationHints';
import { Calendar, Clock } from 'lucide-react';

/** The event date and CFP deadline block of the detail page, long form with confidence and zone notes. */
export function DetailDates({ opportunity }: { opportunity: Opportunity }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-muted p-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Event Date</p>
          <p className="text-sm text-muted-foreground">
            <DateWithConfidence opportunity={opportunity} field="eventDate" style="long" fallback="Not listed" />
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-muted p-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">CFP Deadline</p>
          <p className="text-sm text-muted-foreground">
            <DateWithConfidence opportunity={opportunity} field="cfpDeadline" style="long" fallback="Not listed" />
          </p>
        </div>
      </div>
    </div>
  );
}
