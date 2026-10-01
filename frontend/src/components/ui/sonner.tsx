import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon, XIcon } from "lucide-react"

/*
 * DESIGN.md toast: an inverted `toast-background` bar, bottom centre, 24px from
 * the viewport bottom. The theme follows the OS, like the rest of the app.
 * Sonner's stylesheet is unlayered, so utility overrides need the `!` modifier.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      position="bottom-center"
      offset={24}
      mobileOffset={{ bottom: 24 }}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
        close: <XIcon className="size-4" aria-hidden="true" />,
      }}
      style={
        {
          "--normal-bg": "var(--toast-background)",
          "--normal-text": "var(--toast-foreground)",
          "--normal-border": "var(--toast-background)",
          "--border-radius": "var(--radius)",
          // Toast controls take the on-toast focus ring (DESIGN.md Focus ring).
          "--ring": "var(--ring-on-toast)",
        } as React.CSSProperties
      }
      toastOptions={{
        closeButtonAriaLabel: "Dismiss",
        style: {
          padding: "12px 18px",
          gap: "14px",
          fontSize: "13px",
          // Sonner sets its own font stack; use the app's system stack.
          fontFamily: "var(--font-sans)",
          boxShadow: "0 6px 20px rgba(0,0,0,.18)",
        },
        classNames: {
          // DESIGN.md toast type: 13px / 400 (Sonner's title is 500).
          title: "font-normal!",
          // In the flow at the right edge, so the ring's offset shows the toast behind it.
          closeButton:
            "static! order-last! transform-none! size-min-target! min-target shrink-0 rounded-md! border-0! bg-transparent! text-toast-foreground! hover:bg-transparent! hover:opacity-80 focus-visible:shadow-none!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
