import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Announce = (text: string) => void;

const AnnounceContext = createContext<Announce | null>(null);

/**
 * The app's one polite live region. `announce(text)` replaces its message;
 * each message is a fresh node, so repeating the same text is announced again.
 */
export function AnnounceProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; key: number }>({ text: '', key: 0 });
  const announce = useCallback<Announce>(
    (text) => setMessage((previous) => ({ text, key: previous.key + 1 })),
    [],
  );

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div role="status" aria-live="polite" data-testid="announcer" className="sr-only">
        {message.text === '' ? null : <p key={message.key}>{message.text}</p>}
      </div>
    </AnnounceContext.Provider>
  );
}

/** The `announce(text)` of the enclosing `AnnounceProvider`. */
export function useAnnounce(): Announce {
  const announce = useContext(AnnounceContext);
  if (announce === null) throw new Error('useAnnounce needs an AnnounceProvider');
  return announce;
}
