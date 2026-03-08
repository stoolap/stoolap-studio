"use client";

import { useState, useRef, useEffect } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ExplainViewProps {
  plan: string;
}

export function ExplainView({ plan }: ExplainViewProps) {
  const lines = plan.split("\n");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plan);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (non-HTTPS or permission denied)
    }
  };

  return (
    <div className="relative p-4 font-mono text-sm space-y-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7 opacity-60 hover:opacity-100"
        onClick={handleCopy}
        aria-label="Copy explain plan"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
      {lines.map((line, i) => {
        const isHeader = line.startsWith("SELECT") || line.startsWith("plan");
        const isScan = line.includes("Scan") || line.includes("Lookup");
        const isJoin = line.includes("Join");
        const isCondition = line.includes("Cond:") || line.includes("Filter:");
        const isStats = line.includes("actual") || line.includes("cost=");

        return (
          <div
            key={i}
            className={cn(
              "whitespace-pre",
              isHeader && "font-bold text-foreground",
              isScan && "text-blue-500 dark:text-blue-400",
              isJoin && "text-purple-500 dark:text-purple-400",
              isCondition && "text-orange-500 dark:text-orange-400",
              isStats && "text-green-500 dark:text-green-400",
            )}
          >
            {line || "\u00A0"}
          </div>
        );
      })}
    </div>
  );
}
