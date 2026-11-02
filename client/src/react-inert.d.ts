import 'react';

declare module 'react' {
  interface HTMLAttributes<T> {
    /**
     * The HTML `inert` attribute. React 18's types predate it, and React 18
     * drops boolean values on unknown attributes, so it is passed as `''`
     * (present) or `undefined` (absent).
     */
    inert?: '' | undefined;
  }
}
