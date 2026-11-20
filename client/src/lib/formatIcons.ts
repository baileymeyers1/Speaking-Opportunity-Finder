import { CalendarDays, MessagesSquare, Mic, MonitorPlay, Presentation, Users, Wrench, type LucideIcon } from 'lucide-react';
import type { OpportunityFormat } from '../types';

/**
 * The icon that stands beside a call's format on Browse and on the call page.
 * Look it up (`FORMAT_ICONS[format] ?? FORMAT_ICONS.other`) rather than through
 * a function: a component obtained by a call during render trips the hooks lint.
 */
export const FORMAT_ICONS: Record<OpportunityFormat, LucideIcon> = {
  conference: Presentation,
  meetup: Users,
  podcast: Mic,
  webinar: MonitorPlay,
  workshop: Wrench,
  panel: MessagesSquare,
  other: CalendarDays,
};
