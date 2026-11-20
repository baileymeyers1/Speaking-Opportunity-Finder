import { useId, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TopicTagInput } from './TopicTagInput';
import { OPPORTUNITY_FORMATS } from '../../filters/constants';
import {
  COMPENSATION_REQUIREMENT_OPTIONS,
  MAX_BIO_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TITLE_LENGTH,
  REMOTE_PREFERENCE_OPTIONS,
  SENIORITY_OPTIONS,
  TRAVEL_RADIUS_OPTIONS,
  type ProfileOption,
} from '../../lib/profileOptions';
import type { OpportunityFormat, SpeakerProfileInput } from '../../types';

interface ProfileFormProps {
  initial: SpeakerProfileInput;
  onSubmit: (input: SpeakerProfileInput) => void;
  isSaving: boolean;
  error: string | null;
  /** Set after a successful save so the form can confirm it. */
  savedAt: Date | null;
  /** What the button does: "Add speaker" for a new one, "Save changes" after. */
  submitLabel: string;
}

interface ChoiceFieldProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<ProfileOption<T>>;
  onChange: (value: T) => void;
}

/** A labelled select whose current option's description is read along with it. */
function ChoiceField<T extends string>({ label, value, options, onChange }: ChoiceFieldProps<T>) {
  const id = useId();
  const current = options.find((option) => option.value === value);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id} aria-describedby={`${id}-description`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p id={`${id}-description`} className="text-sm text-muted-foreground">
        {current?.description}
      </p>
    </div>
  );
}

/** One speaker's profile: who they are, what they speak about, where they go and what they need. */
export function ProfileForm({ initial, onSubmit, isSaving, error, savedAt, submitLabel }: ProfileFormProps) {
  const [draft, setDraft] = useState<SpeakerProfileInput>(initial);
  const nameId = useId();
  const titleId = useId();
  const bioId = useId();
  const cityId = useId();
  const countryId = useId();
  const formatsId = useId();

  const update = <K extends keyof SpeakerProfileInput>(key: K, value: SpeakerProfileInput[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  const toggleFormat = (format: OpportunityFormat) => {
    const current = draft.preferredFormats;
    update(
      'preferredFormats',
      current.includes(format) ? current.filter((item) => item !== format) : [...current, format]
    );
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      ...draft,
      name: draft.name.trim(),
      title: draft.title.trim(),
      bio: draft.bio.trim(),
      homeCity: draft.homeCity?.trim() || null,
      homeCountry: draft.homeCountry?.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8" aria-busy={isSaving}>
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <section className="space-y-6" aria-labelledby="profile-who">
        <h2 id="profile-who" className="heading text-foreground">Who</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={draft.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="Dana Okafor"
              maxLength={MAX_NAME_LENGTH}
              required
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={titleId}>Title</Label>
            <Input
              id={titleId}
              value={draft.title}
              onChange={(event) => update('title', event.target.value)}
              placeholder="Chief medical officer, Northwind Health"
              maxLength={MAX_TITLE_LENGTH}
              autoComplete="off"
            />
          </div>
        </div>
      </section>

      <section className="space-y-6" aria-labelledby="profile-about">
        <h2 id="profile-about" className="heading text-foreground">What they speak about</h2>
        <TopicTagInput topics={draft.topics} onChange={(topics) => update('topics', topics)} />

        <div className="space-y-2">
          <Label htmlFor={bioId}>Short bio</Label>
          <Textarea
            id={bioId}
            value={draft.bio}
            onChange={(event) => update('bio', event.target.value)}
            maxLength={MAX_BIO_LENGTH}
            rows={3}
            placeholder="One or two sentences organizers would read."
            aria-describedby={`${bioId}-count`}
          />
          <p id={`${bioId}-count`} className="text-sm text-muted-foreground">
            {draft.bio.length}/{MAX_BIO_LENGTH} characters
          </p>
        </div>

        <ChoiceField
          label="Speaking experience"
          value={draft.seniority}
          options={SENIORITY_OPTIONS}
          onChange={(value) => update('seniority', value)}
        />
      </section>

      <section className="space-y-6" aria-labelledby="profile-where">
        <h2 id="profile-where" className="heading text-foreground">Where they will speak</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={cityId}>Home city</Label>
            <Input
              id={cityId}
              value={draft.homeCity ?? ''}
              onChange={(event) => update('homeCity', event.target.value)}
              placeholder="Denver"
              maxLength={80}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={countryId}>Home country</Label>
            <Input
              id={countryId}
              value={draft.homeCountry ?? ''}
              onChange={(event) => update('homeCountry', event.target.value)}
              placeholder="United States"
              maxLength={80}
              autoComplete="off"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <ChoiceField
            label="How far they travel"
            value={draft.travelRadius}
            options={TRAVEL_RADIUS_OPTIONS}
            onChange={(value) => update('travelRadius', value)}
          />
          <ChoiceField
            label="Remote or in person"
            value={draft.remotePreference}
            options={REMOTE_PREFERENCE_OPTIONS}
            onChange={(value) => update('remotePreference', value)}
          />
        </div>
      </section>

      <section className="space-y-6" aria-labelledby="profile-terms">
        <h2 id="profile-terms" className="heading text-foreground">What they need</h2>
        <ChoiceField
          label="Compensation"
          value={draft.compensationRequirement}
          options={COMPENSATION_REQUIREMENT_OPTIONS}
          onChange={(value) => update('compensationRequirement', value)}
        />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium leading-none">Preferred formats</legend>
          <p id={formatsId} className="text-sm text-muted-foreground">
            Leave all unchecked to score every format the same.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2" aria-describedby={formatsId}>
            {OPPORTUNITY_FORMATS.map((format) => (
              <label key={format} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.preferredFormats.includes(format)}
                  onChange={() => toggleFormat(format)}
                  className="h-4 w-4"
                />
                <span className="capitalize">{format}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={isSaving} className="sm:w-auto">
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isSaving ? 'Saving…' : submitLabel}
        </Button>
        <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {savedAt && !isSaving && (
            <>
              <CheckCircle2 className="h-4 w-4 text-good" aria-hidden="true" />
              Saved
            </>
          )}
        </p>
      </div>
    </form>
  );
}
