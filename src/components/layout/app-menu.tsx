import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tip } from "@/components/ui/tip";
import { useConnectionStore } from "@/stores/connection-store";
import { LANGUAGES, languagePreference, setLanguage, systemLanguage } from "@/lib/i18n";

/** Ask the app for something, as Stoolap Desktop's menu bar does (components/layout/toolbar.tsx answers) */
const send = (event: string) => () => window.dispatchEvent(new CustomEvent(event));

/** The app's menu: what Stoolap Desktop has in its menu bar */
export function AppMenu() {
  const { t } = useTranslation("native");
  const connected = useConnectionStore((s) => !!s.activeId);
  const [language, setLanguageState] = useState(languagePreference);
  const systemName = LANGUAGES.find((l) => l.code === systemLanguage())?.name ?? "English";

  return (
    <DropdownMenu modal={false}>
      <Tip label="Stoolap Studio">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-md" aria-label="Stoolap Studio">
            <Menu className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem onSelect={send("stoolap:open-database")}>{t("openDatabase")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={send("stoolap:new-memory-db")}>{t("newMemory")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={send("stoolap:load-example")}>{t("loadExample")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!connected} onSelect={send("stoolap:backup")}>
          {t("backup")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!connected} onSelect={send("stoolap:restore")}>
          {t("restore")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("language")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[70vh] overflow-y-auto">
            <DropdownMenuRadioGroup
              value={language}
              onValueChange={(code) => {
                setLanguageState(code);
                setLanguage(code);
              }}
            >
              <DropdownMenuRadioItem value="system">
                {t("systemLanguage", { language: systemName })}
              </DropdownMenuRadioItem>
              <DropdownMenuSeparator />
              {LANGUAGES.map((l) => (
                <DropdownMenuRadioItem key={l.code} value={l.code}>
                  {l.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={send("stoolap:shortcuts-help")}>{t("dialogs:shortcuts.title")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={send("stoolap:about")}>{t("about")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
