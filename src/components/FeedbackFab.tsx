import { useState } from "react";
import { HelpCircle } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { HelpAssistantPanel } from "@/components/help/HelpAssistantPanel";

/**
 * Floating Help Assistant entry point.
 *
 * Opens a compact, mobile-first bottom sheet where members/admins can ask a
 * question (typed or dictated), jump to the right page, or send an issue /
 * proposal to support.
 */
export function FeedbackFab() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user?.id) return null;

  return (
    <>
      <div className={cn("fixed right-4 z-[55] bottom-[calc(env(safe-area-inset-bottom,0px)+84px)]")}>
        <Button
          size="icon"
          className="rounded-full shadow-lg h-12 w-12"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Help assistant"
          title="Help assistant"
        >
          <HelpCircle className="w-5 h-5" />
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[88vh] overflow-y-auto rounded-t-2xl px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:max-w-lg sm:mx-auto"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="font-heading text-base">Help assistant</SheetTitle>
            <SheetDescription className="text-[12px]">
              Ask a question about this club's app — type it or use the microphone.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-2">
            <HelpAssistantPanel onClose={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export { FeedbackFab as HelpFab };
