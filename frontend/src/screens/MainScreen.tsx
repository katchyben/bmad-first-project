import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { clearToken, getToken } from '@/api/token';
import { logoutMutation } from '@/client/@tanstack/react-query.gen';
import { Button } from '@/components/ui/button';
import { TaskList } from '@/tasks/TaskList';

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

/** "Thursday, October 1", in the browser's time zone. */
export function formatHeadingDate(date: Date): string {
  return DATE_FORMAT.format(date);
}

/**
 * The logged-in main screen (DESIGN.md Layout): heading "Today", today's date
 * beneath it, and Log out at the right of the heading row, with the task list
 * below.
 */
export function MainScreen() {
  const pending = useRef(false);
  // Fire and forget: the server call only revokes the session there. A failure
  // has nothing to tell the user, so it skips the global error toast.
  const logout = useMutation({ ...logoutMutation(), meta: { globalErrorToast: false } });

  useEffect(() => {
    document.title = 'Today — Todo';
  }, []);

  /**
   * End the session here and now, whatever the server says or however long it
   * takes. The logout request carries the token explicitly, because clearing it
   * right away means the client no longer attaches it. Clearing the token shows
   * Login, and the auth state drops the query cache and every toast.
   */
  function logOut() {
    if (pending.current) return;
    pending.current = true;
    const token = getToken();
    logout.mutate(token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    clearToken();
  }

  return (
    <main className="pt-12">
      <header className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-[32px] leading-[1.2] font-light tracking-[-0.02em]">
            Today
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">{formatHeadingDate(new Date())}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="min-target shrink-0 text-[13px] text-muted-foreground hover:text-foreground"
          onClick={logOut}
        >
          Log out
        </Button>
      </header>
      <div className="mt-heading-to-filter pb-12">
        <TaskList />
      </div>
    </main>
  );
}
