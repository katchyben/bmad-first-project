import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { errorCode, errorMessage, isEnvelopeError } from '@/api/errors';
import { loginMutation } from '@/client/@tanstack/react-query.gen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  /** Called with the new token once the API accepts the credentials. */
  onLoggedIn: (token: string) => void;
};

/**
 * The Login card (DESIGN.md Components > Login card): the app name, Username and
 * Password, one error slot, and a full-width Log in. Enter in either field submits.
 */
export function LoginScreen({ onLoggedIn }: Props) {
  const id = useId();
  const usernameId = `${id}-username`;
  const passwordId = `${id}-password`;
  const errorId = `${id}-error`;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // A ref, not the mutation state: a second Enter can arrive before React re-renders.
  const inFlight = useRef(false);

  useEffect(() => {
    document.title = 'Log in — Todo';
    usernameRef.current?.focus();
  }, []);

  const login = useMutation({
    ...loginMutation(),
    onSuccess: (data) => onLoggedIn(data.access_token),
    onError: (failure) => {
      // 5xx and unreachable failures keep the fields and leave the slot empty:
      // a 5xx goes to the global toast, an unreachable server to the connection banner.
      if (!isEnvelopeError(failure)) return;
      setError(errorMessage(failure));
      if (errorCode(failure) === 'unauthenticated') {
        setPassword('');
        passwordRef.current?.focus();
      }
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    login.mutate({ body: { username, password } });
  }

  const pending = login.isPending;
  const invalid = error !== null;

  return (
    <main className="flex flex-1 items-center justify-center py-12">
      <div className="w-full max-w-[360px] rounded-lg border border-border bg-card p-8 text-card-foreground">
        <h1 className="mb-6 text-[32px] leading-[1.2] font-light tracking-[-0.02em]">Todo App</h1>
        <form noValidate onSubmit={submit}>
          <div className="mb-4 flex flex-col gap-2">
            <Label htmlFor={usernameId}>Username</Label>
            <Input
              ref={usernameRef}
              id={usernameId}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="h-auto min-h-9"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
            />
          </div>
          <div className="mb-4 flex flex-col gap-2">
            <Label htmlFor={passwordId}>Password</Label>
            <Input
              ref={passwordRef}
              id={passwordId}
              name="password"
              type="password"
              autoComplete="current-password"
              className="h-auto min-h-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
            />
          </div>
          <p
            id={errorId}
            role="alert"
            className={invalid ? 'mb-3 text-[13px] leading-normal text-foreground' : undefined}
          >
            {error}
          </p>
          <Button
            type="submit"
            className="w-full text-[13px] aria-disabled:opacity-60"
            aria-disabled={pending || undefined}
          >
            Log in
          </Button>
        </form>
      </div>
    </main>
  );
}
