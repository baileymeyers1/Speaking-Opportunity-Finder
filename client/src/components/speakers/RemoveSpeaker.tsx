import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface RemoveSpeakerProps {
  name: string;
  isRemoving: boolean;
  onRemove: () => void;
}

/**
 * Taking someone off the roster, in two steps: the words on the page open a
 * small confirmation that says what goes with them. It cannot be undone, so
 * it is never one click.
 */
export function RemoveSpeaker({ name, isRemoving, onRemove }: RemoveSpeakerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" className="text-critical">
          Remove speaker
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Remove {name}?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Their profile and any calls saved for them are deleted. This cannot be undone.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="destructive" size="sm" disabled={isRemoving} onClick={onRemove}>
            {isRemoving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Remove
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Keep
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
