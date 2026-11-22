import type { CSSProperties } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** How long a notice stays; its bottom edge counts it down (globals.css) */
const TOAST_MS = 3000;

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <AppShell />
        {/* Quiet, native-looking notices: a neutral translucent card, colour
            only in the icon, above the status bar, gone after a few seconds */}
        <Toaster
          position="bottom-right"
          offset={{ bottom: 44, right: 16 }}
          theme="system"
          duration={TOAST_MS}
          style={{ "--toast-ms": `${TOAST_MS}ms` } as CSSProperties}
          gap={8}
          visibleToasts={3}
          icons={{
            success: <CheckCircle2 className="h-4 w-4 text-green-500" />,
            error: <XCircle className="h-4 w-4 text-red-500" />,
            warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
            info: <Info className="h-4 w-4 text-primary" />,
            loading: <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />,
          }}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast:
                "toast-countdown flex w-[340px] items-start gap-2.5 overflow-hidden rounded-xl border border-border/60 bg-popover/85 px-3.5 py-2.5 text-popover-foreground shadow-lg shadow-black/10 backdrop-blur-xl",
              icon: "mt-px shrink-0",
              content: "flex min-w-0 flex-col gap-0.5",
              title: "text-[13px] font-medium leading-snug",
              description: "text-xs leading-snug text-muted-foreground break-words",
              actionButton:
                "ml-auto shrink-0 rounded-md bg-button px-2 py-1 text-xs font-medium text-button-foreground",
              cancelButton: "shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent",
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
