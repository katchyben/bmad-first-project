import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/auth/useAuth';
import { Toaster } from '@/components/ui/sonner';
import { LoginScreen } from '@/screens/LoginScreen';

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

/** The logged-in view. A placeholder until the main screen arrives (1.6b, Epic 2). */
function LoggedIn() {
  useEffect(() => {
    document.title = 'Today — Todo';
  }, []);
  return <main>Todo</main>;
}

function Content() {
  const { loggedIn, logIn } = useAuth();
  if (DesignCheck && new URLSearchParams(window.location.search).has('design-check')) {
    return (
      <Suspense fallback={null}>
        <DesignCheck />
      </Suspense>
    );
  }
  // Nothing but Login is reachable without a token.
  return loggedIn ? <LoggedIn /> : <LoginScreen onLoggedIn={logIn} />;
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
