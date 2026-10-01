import { lazy, Suspense } from 'react';

// The e2e design fixture exists only in dev builds; production drops it.
const DesignCheck = import.meta.env.DEV ? lazy(() => import('./DesignCheck')) : null;

// Placeholder root. The app shell arrives in Story 1.3c.
export default function App() {
  if (DesignCheck && new URLSearchParams(window.location.search).has('design-check')) {
    return (
      <Suspense fallback={null}>
        <DesignCheck />
      </Suspense>
    );
  }
  return <main>Todo</main>;
}
