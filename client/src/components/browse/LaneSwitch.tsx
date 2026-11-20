import type { Lane, LaneSummary } from '../../types';
import { LANES } from '../../filters/constants';
import { SegmentedSwitch } from '../SegmentedSwitch';

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

/** Browse's three lists, on the glass segmented control, each with how many calls it holds. */
export function LaneSwitch({ lane, counts, onChange }: LaneSwitchProps) {
  return (
    <SegmentedSwitch
      label="Which calls to list"
      value={lane}
      onChange={onChange}
      options={LANES.map((value) => ({ value, label: LANE_LABELS[value], count: counts?.[value] }))}
    />
  );
}
