import { useId, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_TOPIC_LENGTH, MAX_TOPICS } from '../../lib/profileOptions';

interface TopicTagInputProps {
  topics: string[];
  onChange: (topics: string[]) => void;
}

function normalizeTopic(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Free-text tags: type a topic, press Enter or comma to add it, remove with the chip's button. */
export function TopicTagInput({ topics, onChange }: TopicTagInputProps) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const atLimit = topics.length >= MAX_TOPICS;

  const addFromDraft = () => {
    const additions = draft
      .split(',')
      .map(normalizeTopic)
      .filter((topic) => topic.length > 0 && topic.length <= MAX_TOPIC_LENGTH);
    if (additions.length === 0) return;
    const next = [...topics];
    for (const topic of additions) {
      if (!next.includes(topic) && next.length < MAX_TOPICS) next.push(topic);
    }
    onChange(next);
    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addFromDraft();
    } else if (event.key === 'Backspace' && draft === '' && topics.length > 0) {
      onChange(topics.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Topics</Label>
      <p id={`${id}-description`} className="text-sm text-muted-foreground">
        One tag at a time. Press Enter or comma to add; up to {MAX_TOPICS}.
      </p>
      <Input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addFromDraft}
        placeholder={atLimit ? 'Topic limit reached' : 'e.g. healthcare, developer experience'}
        maxLength={MAX_TOPIC_LENGTH}
        disabled={atLimit}
        aria-describedby={`${id}-description`}
        autoComplete="off"
      />
      {topics.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Your topics">
          {topics.map((topic) => (
            <li
              key={topic}
              className="inline-flex h-6 items-center gap-1 rounded-sm border pl-2 pr-1 text-xs font-medium text-muted-foreground"
            >
              {topic}
              <button
                type="button"
                onClick={() => onChange(topics.filter((item) => item !== topic))}
                aria-label={`Remove ${topic}`}
                className="rounded-sm p-0.5 hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
