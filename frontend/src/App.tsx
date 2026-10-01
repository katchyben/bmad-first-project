import { lazy, Suspense, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';

// The e2e design fixture exists only in dev builds; production drops it.
const DesignCheck = import.meta.env.DEV ? lazy(() => import('./DesignCheck')) : null;

/**
 * The app shell (DESIGN.md Layout): one centred column, fluid up to 640px,
 * with a 16px gutter each side on `background`. No breakpoints.
 */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background px-4">
      <div data-testid="shell-column" className="mx-auto w-full min-w-0 max-w-[640px]">
        {children}
      </div>
    </div>
  );
}

function Content() {
  if (DesignCheck && new URLSearchParams(window.location.search).has('design-check')) {
    return (
      <Suspense fallback={null}>
        <DesignCheck />
      </Suspense>
    );
  }
  // Placeholder content until Login and the task list arrive (Story 1.6 onward).
  return <main>Todo</main>;
}

export default function App() {
  return (
    <>
      <Shell>
        <Content />
      </Shell>
      <Toaster />
    </>
  );
}
