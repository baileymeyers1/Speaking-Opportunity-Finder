import { DitherFade } from './DitherFade';

/** Every demo page ends on the blue field: what this is, and who built it. Rendered by `Layout`. */
export function DemoFooter() {
  return (
    <footer className="mt-16">
      <DitherFade direction="up" id="footer" />
      <div className="demo-field">
        <div className="container flex flex-wrap items-center justify-between gap-x-8 gap-y-1 pb-8 pt-5 text-sm font-normal">
          <p>A sample roster on real listings. What you change here stays in your own session.</p>
          <a href="https://baileymeyers.com" className="inline-flex min-h-11 items-center underline underline-offset-4">
            Built by Bailey Meyers
          </a>
        </div>
      </div>
    </footer>
  );
}
