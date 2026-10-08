import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ListOrdered } from "lucide-react";

const STORAGE_KEY = "sh.announce.menu-edit-v1";

/**
 * One-time, universal announcement for the personalised side menu feature.
 * Shows once per person per device; closing it remembers the choice locally
 * so it never appears again on that device.
 */
export function MenuEditAnnouncement() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) {
        setOpen(true);
      }
    } catch {
      // Storage unavailable (private mode etc.) — show once per session.
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore — worst case it shows again next session.
    }
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ListOrdered className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center">Make the menu yours</DialogTitle>
          <DialogDescription className="text-center text-sm leading-relaxed">
            You can now arrange your side menu the way you like it. Tap{" "}
            <span className="font-medium text-foreground">Edit menu</span> at the
            bottom of the menu to reorder items, or hide the ones you don't use.
            Club admins — this works in your Club Admin menu too. Your choices
            are saved to your account and only affect your own menu.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button onClick={dismiss} className="min-w-32">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
