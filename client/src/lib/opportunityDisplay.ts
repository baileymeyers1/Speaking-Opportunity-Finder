import { daysUntil, formatDate } from './dates';

export interface DeadlineBadge {
  label: string;
  variant: 'secondary' | 'destructive' | 'outline';
  className?: string;
}

export function getDeadlineBadge(dateString: string | null): DeadlineBadge {
  if (!dateString) {
    return { label: 'No deadline', variant: 'secondary' };
  }
  const daysLeft = daysUntil(dateString);
  if (daysLeft <= 0) {
    return { label: 'Closed', variant: 'destructive' };
  }
  if (daysLeft <= 3) {
    return { label: `${daysLeft}d left`, variant: 'destructive' };
  }
  if (daysLeft <= 7) {
    return {
      label: `${daysLeft}d left`,
      variant: 'outline',
      className:
        'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700',
    };
  }
  return { label: formatDate(dateString)!, variant: 'secondary' };
}

export function getQualityColor(score: number): string {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

export function getQualityLabel(score: number): string {
  if (score >= 70) return 'High quality';
  if (score >= 40) return 'Medium quality';
  return 'Low quality';
}

export const SAVE_CATEGORIES = [
  { value: 'interested', label: 'Interested' },
  { value: 'applied', label: 'Applied' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
] as const;
