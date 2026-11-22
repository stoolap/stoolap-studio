import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The app's tooltip around one element, in place of a `title` attribute
 * (which shows late, in the system's look). Without a label it renders the
 * element alone. The element must take a ref and props (a button, a span).
 */
export function Tip({
  label,
  side,
  delay,
  children,
}: {
  label?: ReactNode;
  side?: ComponentProps<typeof TooltipContent>["side"];
  /** ms before it shows; the app default otherwise */
  delay?: number;
  children: ReactElement;
}) {
  if (label === undefined || label === null || label === "") return children;
  return (
    <Tooltip delayDuration={delay}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-sm break-words">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
