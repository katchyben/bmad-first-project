import { useQueryClient } from '@tanstack/react-query';
import { ServerError } from '@/api/errors';
import { logout } from '@/client/sdk.gen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { fade } from '@/lib/motion';

// Literal class names so Tailwind generates a utility for every DESIGN.md colour.
const SWATCHES: Record<string, string> = {
  background: 'bg-background',
  foreground: 'bg-foreground',
  card: 'bg-card',
  'card-foreground': 'bg-card-foreground',
  popover: 'bg-popover',
  'popover-foreground': 'bg-popover-foreground',
  'muted-foreground': 'bg-muted-foreground',
  border: 'bg-border',
  input: 'bg-input',
  ring: 'bg-ring',
  'ring-on-toast': 'bg-ring-on-toast',
  primary: 'bg-primary',
  'primary-foreground': 'bg-primary-foreground',
  accent: 'bg-accent',
  'accent-foreground': 'bg-accent-foreground',
  destructive: 'bg-destructive',
  'destructive-foreground': 'bg-destructive-foreground',
  overdue: 'bg-overdue',
  'overdue-tint': 'bg-overdue-tint',
  'in-progress': 'bg-in-progress',
  finished: 'bg-finished',
  'row-hover': 'bg-row-hover',
  'row-selected': 'bg-row-selected',
  'toast-background': 'bg-toast-background',
  'toast-foreground': 'bg-toast-foreground',
  'toast-action': 'bg-toast-action',
};

// Test fixture for e2e/design.spec.ts, rendered only at `/?design-check`.
export default function DesignCheck() {
  const queryClient = useQueryClient();

  // Fail a query with a 5xx through the app's query client, so the global error hook fires.
  function failQuery() {
    void queryClient
      .fetchQuery({
        queryKey: ['design-check', 'server-error'],
        queryFn: () => Promise.reject(new ServerError(500, null)),
      })
      .catch(() => {});
  }

  // Send one request through the configured client (e2e/login.spec.ts checks its URL and header).
  // It uses logout only because no read-only authenticated route exists yet (Epic 2
  // adds them), so it ends the session.
  function sendAuthenticatedRequest() {
    void logout();
  }

  return (
    <main className="flex flex-col items-start gap-4 p-4">
      <Button data-testid="button">Button</Button>
      <Input data-testid="input" aria-label="Input" />
      <Textarea data-testid="textarea" aria-label="Textarea" />
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger data-testid="tab" value="all">
            All
          </TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
        </TabsList>
      </Tabs>
      <a data-testid="link" href="#">
        Link
      </a>
      <Input data-testid="invalid-input" aria-label="Invalid input" aria-invalid="true" />
      <Popover>
        <PopoverTrigger asChild>
          <Button data-testid="popover-trigger" variant="outline">
            Open popover
          </Button>
        </PopoverTrigger>
        <PopoverContent data-testid="popover-content">Popover content</PopoverContent>
      </Popover>
      <div data-testid="surface" className="rounded-lg bg-card p-4">
        Surface
      </div>
      <div data-testid="min-target" className="min-target">
        Target
      </div>
      <div data-testid="fade" className={fade}>
        Fade
      </div>
      <kbd data-testid="kbd">Esc</kbd>
      <Button data-testid="server-error" variant="outline" onClick={failQuery}>
        Fail a query
      </Button>
      <Button data-testid="auth-request" variant="outline" onClick={sendAuthenticatedRequest}>
        Send an authenticated request
      </Button>
      <ul aria-hidden="true" className="flex flex-wrap gap-1">
        {Object.entries(SWATCHES).map(([token, className]) => (
          <li key={token} data-swatch={token} className={`size-4 ${className}`} />
        ))}
      </ul>
    </main>
  );
}
