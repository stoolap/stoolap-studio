import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  setConfirmHost,
  setMenuHost,
  type ConfirmRequest,
  type MenuRequest,
} from "@/lib/native";

/**
 * Shows what Stoolap Desktop leaves to the operating system: the
 * confirmations and context menus lib/native.ts asks for.
 */
export function NativeHost() {
  return (
    <>
      <ConfirmHost />
      <MenuHost />
    </>
  );
}

function ConfirmHost() {
  const { t } = useTranslation("common");
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  useEffect(() => {
    setConfirmHost(setRequest);
    return () => setConfirmHost(null);
  }, []);

  const answer = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && answer(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">{request?.message}</DialogDescription>
        </DialogHeader>
        {request?.detail && <p className="text-sm text-muted-foreground whitespace-pre-line">{request.detail}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => answer(false)}>
            {t("native.cancel")}
          </Button>
          <Button
            data-default
            variant={request?.destructive ? "destructive" : "default"}
            onClick={() => answer(true)}
          >
            {request?.confirmLabel || t("native.ok")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MenuHost() {
  const [request, setRequest] = useState<MenuRequest | null>(null);
  useEffect(() => {
    setMenuHost((next) => {
      // A new menu closes the one open
      setRequest((open) => {
        open?.resolve(null);
        return next;
      });
    });
    return () => setMenuHost(null);
  }, []);

  const choose = (id: string | null) => {
    request?.resolve(id);
    setRequest(null);
  };

  return (
    <DropdownMenu open={!!request} onOpenChange={(open) => !open && choose(null)} modal={false}>
      {/* A point at the pointer for the menu to open from */}
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed h-0 w-0"
          style={{ left: request?.x ?? 0, top: request?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={2} className="min-w-44">
        {request?.items.map((item, i) =>
          item.type === "separator" ? (
            <DropdownMenuSeparator key={`sep-${i}`} />
          ) : (
            <DropdownMenuItem key={item.id} disabled={item.enabled === false} onSelect={() => choose(item.id)}>
              {item.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
