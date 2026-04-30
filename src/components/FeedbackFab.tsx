import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bug, HelpCircle, Lightbulb, LifeBuoy, Send } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useCreateSupportThread, useSendSupportMessage } from "@/hooks/use-support";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Mode = "issue" | "proposal";

function buildMeta(locationPath: string) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
  const lang = typeof navigator !== "undefined" ? navigator.language : "unknown";
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;
  return [
    "---",
    `Page: ${locationPath}`,
    `Online: ${online ? "yes" : "no"}`,
    `Language: ${lang}`,
    `User-Agent: ${ua}`,
  ].join("\n");
}

export function FeedbackFab() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const createThread = useCreateSupportThread();
  const send = useSendSupportMessage();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("proposal");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");

  const submitting = createThread.isPending || send.isPending;

  const placeholder = useMemo(() => {
    if (mode === "issue") {
      return [
        "What happened?",
        "",
        "Steps to reproduce:",
        "1) …",
        "2) …",
        "",
        "What did you expect to happen?",
      ].join("\n");
    }
    return [
      "What should we change/add?",
      "",
      "Why it helps:",
      "- …",
      "",
      "Optional: any screenshots/links",
    ].join("\n");
  }, [mode]);

  if (!user?.id) return null;

  const submit = async () => {
    const cleanTitle = title.trim();
    const cleanDetails = details.trim();
    if (!cleanTitle) return toast.error("Add a short title");
    if (!cleanDetails) return toast.error("Add some details");

    const subject = `${mode === "issue" ? "Issue" : "Proposal"}: ${cleanTitle}`;
    const body = `${cleanDetails}\n\n${buildMeta(location.pathname)}`;

    try {
      const thread = await createThread.mutateAsync({ subject });
      await send.mutateAsync({ threadId: thread.id, body });
      toast.success("Sent — thank you!");
      setOpen(false);
      setTitle("");
      setDetails("");
      navigate(`/support?threadId=${thread.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Could not send");
    }
  };

  return (
    <>
      <div
        className={cn(
          "fixed right-4 z-[55]",
          user?.id ? "bottom-[calc(env(safe-area-inset-bottom,0px)+84px)]" : "bottom-4"
        )}
      >
        <Button
          size="icon"
          className="rounded-full shadow-lg h-12 w-12"
          onClick={() => setOpen(true)}
          aria-label="Help & feedback"
        >
          <HelpCircle className="w-5 h-5" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Help & feedback</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button
              variant="outline"
              className="justify-start h-10"
              onClick={() => {
                setOpen(false);
                navigate("/support");
              }}
            >
              <LifeBuoy className="w-4 h-4 mr-2" />
              Support chat
            </Button>
            <Button
              variant="outline"
              className="justify-start h-10"
              onClick={() => setMode("proposal")}
            >
              <Lightbulb className="w-4 h-4 mr-2" />
              Propose
            </Button>
            <Button
              variant="outline"
              className="justify-start h-10"
              onClick={() => {
                setMode("issue");
              }}
            >
              <Bug className="w-4 h-4 mr-2" />
              Report an issue
            </Button>
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="proposal" className="flex-1">
                <Lightbulb className="w-4 h-4 mr-2" />
                Proposal
              </TabsTrigger>
              <TabsTrigger value="issue" className="flex-1">
                <Bug className="w-4 h-4 mr-2" />
                Issue
              </TabsTrigger>
            </TabsList>

            <TabsContent value="proposal" className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Add dark mode / Improve bookings list" />
              </div>
              <div className="space-y-1.5">
                <Label>Details</Label>
                <Textarea value={details} onChange={(e) => setDetails(e.target.value)} className="min-h-[140px]" placeholder={placeholder} />
              </div>
            </TabsContent>

            <TabsContent value="issue" className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Player profile blank / Booking not saving" />
              </div>
              <div className="space-y-1.5">
                <Label>Details</Label>
                <Textarea value={details} onChange={(e) => setDetails(e.target.value)} className="min-h-[160px]" placeholder={placeholder} />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="sm:order-1">
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting} className="sm:order-2">
              <Send className="w-4 h-4 mr-2" />
              {submitting ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
