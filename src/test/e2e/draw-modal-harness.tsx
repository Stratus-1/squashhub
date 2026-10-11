/** Browser regression harness (loaded by Playwright via Vite only, never part of the app). */
import { createRoot } from "react-dom/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "@/components/smart-builder/draw-notice-dialog.css";

export function mount() {
  const el = document.createElement("div"); document.body.appendChild(el);
  createRoot(el).render(
    <Dialog open>
      <DialogContent className="draw-notice-modal">
        <DialogHeader className="draw-notice-modal-header border-b border-border bg-background"><DialogTitle>Send draw to players now?</DialogTitle><DialogDescription>desc</DialogDescription></DialogHeader>
        <div className="draw-notice-modal-body space-y-3" data-testid="body">
          {Array.from({ length: 40 }, (_, i) => <p key={i} className="text-sm">Activation introduction / counts / preview / fee wording line {i}</p>)}
          <label data-testid="channels">In-app / Email channels</label>
        </div>
        <DialogFooter className="draw-notice-modal-footer gap-2 border-t border-border bg-background" data-testid="footer">
          <button data-testid="later">Not now</button><button data-testid="send">Send now</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
  );
}
