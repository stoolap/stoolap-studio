"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-3">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          {error.message || "An unexpected error occurred"}
        </p>
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
