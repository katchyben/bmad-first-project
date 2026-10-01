/**
 * The app's only motion (DESIGN.md): a 180ms opacity fade. The `fade` utility in
 * index.css drops the transition under `prefers-reduced-motion: reduce`; it never
 * changes any timer, so behaviour is identical with or without motion.
 *
 * Apply it to an element whose opacity changes, e.g. `cn(fade, visible ? 'opacity-100' : 'opacity-0')`.
 */
export const fade = 'fade';
