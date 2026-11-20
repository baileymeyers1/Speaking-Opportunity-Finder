import { useEffect, useRef } from 'react';
import { glassSegmented, type GlassSegmented } from '@/lib/glass';
import { cn } from '@/lib/utils';

export interface SegmentedOption<Value extends string> {
  value: Value;
  label: string;
  /** Shown after the label, in secondary ink; absent while it is not known yet. */
  count?: number;
}

interface SegmentedSwitchProps<Value extends string> {
  /** What the switch chooses between, for assistive technology. */
  label: string;
  options: readonly SegmentedOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  /**
   * On a phone, set each count under its label. The columns are equal (one
   * platter size), so four options with their counts on one line do not fit
   * a phone's width: the last characters slide under the next option.
   */
  stackCounts?: boolean;
}

/**
 * The kit's glass segmented control: a clear platter slides to the chosen
 * option, magnifying its label and bending the ones it passes. Browse's lanes
 * and the Saved page's stages both use it.
 */
export function SegmentedSwitch<Value extends string>({
  label,
  options,
  value,
  onChange,
  stackCounts = false,
}: SegmentedSwitchProps<Value>) {
  const groupRef = useRef<HTMLDivElement>(null);
  const control = useRef<GlassSegmented | null>(null);
  // The option the platter was last sent to: a click moves it at once, the URL (back, a link) moves it here.
  const platterValue = useRef(value);
  const index = options.findIndex((option) => option.value === value);

  useEffect(() => {
    if (groupRef.current) control.current = glassSegmented(groupRef.current);
  }, []);

  useEffect(() => {
    if (platterValue.current === value) return;
    platterValue.current = value;
    if (index >= 0) control.current?.go(index);
  }, [value, index]);

  return (
    <div ref={groupRef} role="group" aria-label={label} className={cn('lseg w-full sm:w-auto', stackCounts && 'lseg--stacked')}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => {
            platterValue.current = option.value;
            onChange(option.value);
          }}
        >
          {option.label}
          {option.count !== undefined && (
            <>
              {' '}
              <span className="ml-0.5 font-normal text-muted-foreground">{option.count.toLocaleString('en-US')}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
