import { useState } from "react";
import { HelpCircle, Sparkles } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpAssistantPanel } from "@/components/help/HelpAssistantPanel";
import { AiAssistantPanel } from "@/components/ai/AiAssistantPanel";
import { useAiAssistant } from "@/hooks/use-ai-assistant";

/**
 * Floating help entry point.
 *
 * When the club has the AI assistant switched on (and this member is in its
 * audience), it leads with the AI assistant — voice or text — and keeps the
 * searchable help + support form behind a second tab.
 */
export function FeedbackFab() {
  const { user } = useAuth();
  const ai = useAiAssistant();
  const [open, setOpen] = useState(false);

  if (!user?.id) return null;

  const aiOn = ai.allowed;

  return (
    <>
      <div className={cn("fixed right-4 z-[55] bottom-[calc(env(safe-area-inset-bottom,0px)+84px)]")}>
        <Button
          size="icon"
          className="rounded-full shadow-lg h-12 w-12"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={aiOn ? "AI assistant" : "Help assistant"}
          title={aiOn ? "AI assistant" : "Help assistant"}
        >
          {aiOn ? <Sparkles className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] overflow-y-auto rounded-t-2xl px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:max-w-lg sm:mx-auto"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="font-heading text-base">
              {aiOn ? "SquashHub assistant" : "Help assistant"}
            </SheetTitle>
            <SheetDescription className="text-[12px]">
              {aiOn
                ? "Ask anything or say what you want to do — speak it or type it."
                : "Ask a question about this club's app — type it or use the microphone."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-2">
            {aiOn ? (
              <Tabs defaultValue="assistant">
                <TabsList className="grid grid-cols-2 h-8">
                  <TabsTrigger value="assistant" className="text-[12px]">
                    Assistant
                  </TabsTrigger>
                  <TabsTrigger value="help" className="text-[12px]">
                    Help & support
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="assistant" className="mt-3">
                  <AiAssistantPanel onClose={() => setOpen(false)} />
                </TabsContent>
                <TabsContent value="help" className="mt-3">
                  <HelpAssistantPanel onClose={() => setOpen(false)} />
                </TabsContent>
              </Tabs>
            ) : (
              <HelpAssistantPanel onClose={() => setOpen(false)} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export { FeedbackFab as HelpFab };
