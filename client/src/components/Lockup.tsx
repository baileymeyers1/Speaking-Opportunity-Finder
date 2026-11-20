import { Link } from 'react-router-dom';

/**
 * The JCI Intelligence lockup with this product's name beside it. The mark is the kit's own file
 * (public/jci-logo.svg): used as is in both themes, never recoloured, redrawn or set in a font.
 */
export function Lockup() {
  return (
    <Link to="/" aria-label="Speaking Finder home" className="flex items-center gap-2.5 text-foreground">
      <img src="/jci-logo.svg" alt="" width={34} height={34} decoding="async" className="size-[34px] flex-none" />
      <span className="hidden text-[19px] font-normal leading-none tracking-[-0.03em] lg:inline">Intelligence</span>
      <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-input lg:block" />
      <span className="text-[15px] leading-none tracking-[-0.01em] lg:text-sm lg:text-muted-foreground">
        Speaking Finder
      </span>
    </Link>
  );
}
