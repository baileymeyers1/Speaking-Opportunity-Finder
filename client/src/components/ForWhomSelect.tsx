import type { SpeakerProfile } from '../types';
import { EVERYONE, NOBODY, NOBODY_LABEL, type ForWhom } from '../lib/forWhom';
import { speakerName } from '../lib/speakerDisplay';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ForWhomSelectProps {
  /** What the choice decides on this page: "Fit for" on Browse, "For" on Saved. */
  label: string;
  speakers: readonly SpeakerProfile[];
  value: ForWhom;
  onChange: (value: ForWhom) => void;
  /** Saved keeps a list of calls nobody was chosen for. */
  withNobody?: boolean;
}

/**
 * Whose list this is: everyone on the roster, or one speaker. Words with a
 * chevron, like the sort beside it. The page shows it only when the roster
 * has more than one speaker.
 */
export function ForWhomSelect({ label, speakers, value, onChange, withNobody = false }: ForWhomSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className="h-8 w-auto max-w-[16rem] gap-1.5 border-transparent bg-transparent px-2 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <span className="flex-none">{label}</span>
        <span className="min-w-0 truncate text-foreground">
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={EVERYONE}>Everyone</SelectItem>
        <SelectSeparator />
        {speakers.map((speaker) => (
          <SelectItem key={speaker.id} value={speaker.id}>
            {speakerName(speaker)}
          </SelectItem>
        ))}
        {withNobody && (
          <>
            <SelectSeparator />
            <SelectItem value={NOBODY}>{NOBODY_LABEL}</SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
