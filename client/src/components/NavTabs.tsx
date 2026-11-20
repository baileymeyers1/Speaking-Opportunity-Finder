import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Spring, animator } from '@/lib/motion';

export interface NavTab {
  to: string;
  label: string;
}

interface Rule {
  /** Sends the rule under a tab, or folds it away when there is none. */
  moveTo: (tab: HTMLElement | null, jump?: boolean) => void;
}

const RULE_SPRING = { k: 260, c: 26, eps: 0.05 };

/**
 * The kit's nav: typographic tabs with one 2px red rule. The rule springs to the tab under the pointer and
 * returns to the current page when the pointer leaves. On a page that is not a tab it folds away.
 */
export function NavTabs({ tabs }: { tabs: NavTab[] }) {
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const ruleRef = useRef<Rule | null>(null);
  const placed = useRef(false);

  const currentTab = () => navRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? null;

  useEffect(() => {
    const bar = barRef.current;
    const nav = navRef.current;
    if (!bar || !nav) return;
    const offset = new Spring(0, RULE_SPRING);
    const width = new Spring(0, RULE_SPRING);
    const wake = animator((deltaSeconds) => {
      const moving = offset.step(deltaSeconds);
      const resizing = width.step(deltaSeconds);
      bar.style.transform = `translateX(${offset.x.toFixed(2)}px) scaleX(${width.x.toFixed(2)})`;
      return moving || resizing;
    });
    const rule: Rule = {
      moveTo(tab, jump) {
        if (tab) {
          // Unfolding from nothing: start under the tab instead of sliding in from wherever it last was.
          offset.to(tab.offsetLeft, jump || width.x === 0);
          width.to(tab.offsetWidth, jump);
        } else {
          width.to(0, jump);
        }
        wake();
      },
    };
    ruleRef.current = rule;

    // Tab widths change when Outfit arrives and when the header reflows.
    const settle = () => rule.moveTo(currentTab(), true);
    document.fonts?.ready.then(settle);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(settle);
    observer?.observe(nav);
    return () => {
      observer?.disconnect();
      ruleRef.current = null;
      placed.current = false;
    };
  }, []);

  // A new page, or a tab appearing after sign-in: go to the current tab. The first placement does not animate.
  useEffect(() => {
    ruleRef.current?.moveTo(currentTab(), !placed.current);
    placed.current = true;
  }, [pathname, tabs.length]);

  const returnToCurrent = () => ruleRef.current?.moveTo(currentTab());

  return (
    <nav
      ref={navRef}
      aria-label="Main navigation"
      className="relative hidden h-full items-stretch gap-[26px] md:flex"
      onPointerLeave={returnToCurrent}
      onBlur={returnToCurrent}
    >
      {tabs.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          aria-current={pathname === tab.to ? 'page' : undefined}
          className="inline-flex items-center text-sm text-muted-foreground transition-colors duration-state ease-out hover:text-foreground aria-[current=page]:text-foreground"
          onPointerEnter={(event) => ruleRef.current?.moveTo(event.currentTarget)}
          onFocus={(event) => ruleRef.current?.moveTo(event.currentTarget)}
        >
          {tab.label}
        </Link>
      ))}
      <span
        ref={barRef}
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-px left-0 h-0.5 w-px origin-left bg-primary"
        style={{ transform: 'scaleX(0)' }}
      />
    </nav>
  );
}
