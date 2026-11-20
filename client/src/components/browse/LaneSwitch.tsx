import { useEffect, useRef } from 'react';
import type { Lane, LaneSummary } from '../../types';
import { LANES } from '../../filters/constants';
import { glassSegmented, type GlassSegmented } from '@/lib/glass';

const LANE_LABELS: Record<Lane, string> = {
  closing: 'Closing',
  open: 'Always open',
  watch: 'To watch',
};

interface LaneSwitchProps {
  lane: Lane;
  /** How many calls sit in each lane under the filters in force; absent until the first response. */
  counts: LaneSummary['counts'] | undefined;
  onChange: (lane: Lane) => void;
}

/**
 * Browse's three lists, on the kit's glass segmented control: a clear platter
 * slides to the chosen lane, magnifying its label and bending the ones it passes.
 */
export function LaneSwitch({ lane, counts, onChange }: LaneSwitchProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const control = useRef<GlassSegmented | null>(null);
  // The lane the platter was last sent to: a click moves it at once, the URL (back, a link) moves it here.
  const platterLane = useRef(lane);

  useEffect(() => {
    if (groupRef.current) control.current = glassSegmented(groupRef.current);
  }, []);

  useEffect(() => {
    if (platterLane.current === lane) return;
    platterLane.current = lane;
    control.current?.go(LANES.indexOf(lane));
  }, [lane]);

  return (
    <div ref={groupRef} role="group" aria-label="Which calls to list" className="lseg w-full sm:w-auto">
      {LANES.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={value === lane}
          onClick={() => {
            platterLane.current = value;
            onChange(value);
          }}
        >
          {LANE_LABELS[value]}
          {counts && (
            <>
              {' '}
              <span className="ml-0.5 font-normal text-muted-foreground">{counts[value].toLocaleString('en-US')}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
