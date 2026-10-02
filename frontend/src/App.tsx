import { lazy, Suspense, type ReactNode } from 'react';
import { AnnounceProvider } from '@/a11y/announce';
import { useAuth } from '@/auth/useAuth';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { Toaster } from '@/components/ui/sonner';
import { LoginScreen } from '@/screens/LoginScreen';
import { MainScreen } from '@/screens/MainScreen';

// The e2e design fixture exists only in dev builds; production drops it.
const DesignCheck = import.meta.env.DEV ? lazy(() => import('./DesignCheck')) : null;

/**
 * The app shell (DESIGN.md Layout): the connection banner, when present, across
 * the full viewport width, then one centred column, fluid up to 640px, with a
 * 16px gutter each side on `background`. No breakpoints. The shell is a flex
 * column so a screen can fill the height left below the banner.
 */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <ConnectionBanner />
      <div className="flex flex-1 flex-col px-4">
        <div
          data-testid="shell-column"
          className="mx-auto flex w-full min-w-0 max-w-[640px] flex-1 flex-col"
        >
          {children}
        </div>
      </div>
    </div>
  );
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
  return loggedIn ? <MainScreen /> : <LoginScreen onLoggedIn={logIn} />;
}

export default function App() {
  return (
    <AnnounceProvider>
      <Shell>
        <Content />
      </Shell>
      <Toaster />
    </AnnounceProvider>
  );
}
