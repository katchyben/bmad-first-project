import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { clearToken, getToken } from '@/api/token';
import { logoutMutation } from '@/client/@tanstack/react-query.gen';
import { Button } from '@/components/ui/button';
import { isAddShortcut, isMacPlatform } from '@/lib/platform';
import { AddTask } from '@/tasks/AddTask';
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
 * beneath it, and Log out at the right of the heading row, then the add-task
 * input and the task list.
 */
export function MainScreen() {
  const pending = useRef(false);
  // Fire and forget: the server call only revokes the session there. A failure
  // has nothing to tell the user, so it skips the global error toast.
  const logout = useMutation({ ...logoutMutation(), meta: { globalErrorToast: false } });

  const addInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Detected once: ⌘ on macOS, Ctrl elsewhere.
  const [mac] = useState(isMacPlatform);

  useEffect(() => {
    document.title = 'Today — Todo';
  }, []);

  // ⌘K / Ctrl+K from anywhere on the main screen focuses the add input.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.isComposing || event.defaultPrevented || !isAddShortcut(event, mac)) return;
      // A dialog or popover (the due picker) keeps focus while it is open.
      if (document.activeElement?.closest('[role="dialog"]')) return;
      event.preventDefault();
      addInputRef.current?.focus();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mac]);

  /** Esc in the add input moves focus to the task grid, or just blurs with no tasks. */
  function leaveAddInput() {
    if (gridRef.current) gridRef.current.focus();
    else addInputRef.current?.blur();
  }

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
      {/* The status filter tabs (Epic 3) will sit between the header and the input. */}
      <div className="mt-heading-to-filter pb-12">
        <AddTask titleRef={addInputRef} onEscape={leaveAddInput} mac={mac} />
        <div className="mt-input-to-list">
          <TaskList gridRef={gridRef} onEmptied={() => addInputRef.current?.focus()} />
        </div>
      </div>
    </main>
  );
}
