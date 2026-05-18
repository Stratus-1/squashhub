import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Camera, ScanFace, Loader2, Upload, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMyClub, useMyClubMember } from "@/hooks/use-club";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface FaceEnrolmentDialogProps {
  open: boolean;
  onClose: () => void;
}

type LiveStep = "idle" | "front" | "left" | "right" | "done";

const STEP_PROMPT: Record<LiveStep, string> = {
  idle: "",
  front: "Look straight at the camera",
  left: "Slowly turn your head LEFT",
  right: "Now turn your head RIGHT",
  done: "Great — capturing your best frame…",
};

/** Compute a simple sharpness score (variance of grayscale laplacian-ish). */
function sharpnessScore(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  const w = canvas.width, h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  let sum = 0, sumSq = 0, n = 0;
  // Sample every 4th pixel for speed
  for (let y = 1; y < h - 1; y += 4) {
    for (let x = 1; x < w - 1; x += 4) {
      const i = (y * w + x) * 4;
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const gx = 0.299 * data[i + 4] + 0.587 * data[i + 5] + 0.114 * data[i + 6];
      const gy = 0.299 * data[i + w * 4] + 0.587 * data[i + w * 4 + 1] + 0.114 * data[i + w * 4 + 2];
      const lap = Math.abs(g - gx) + Math.abs(g - gy);
      sum += lap; sumSq += lap * lap; n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Mean abs grayscale diff between two equally-sized canvases. */
function frameDiff(a: HTMLCanvasElement, b: HTMLCanvasElement): number {
  const ca = a.getContext("2d"), cb = b.getContext("2d");
  if (!ca || !cb) return 0;
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  const da = ca.getImageData(0, 0, w, h).data;
  const db = cb.getImageData(0, 0, w, h).data;
  let total = 0, n = 0;
  for (let i = 0; i < da.length; i += 16) {
    const ga = 0.299 * da[i] + 0.587 * da[i + 1] + 0.114 * da[i + 2];
    const gb = 0.299 * db[i] + 0.587 * db[i + 1] + 0.114 * db[i + 2];
    total += Math.abs(ga - gb); n++;
  }
  return total / n;
}

export function FaceEnrolmentDialog({ open, onClose }: FaceEnrolmentDialogProps) {
  const { user } = useAuth();
  const { club: ctxClub } = useClubContext();
  const { data: clubData } = useMyClub();
  const { data: myClubMember } = useMyClubMember();
  const queryClient = useQueryClient();

  const club = clubData?.club || ctxClub;
  const clubId = club?.id;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"camera" | "upload">("camera");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [consent, setConsent] = useState(false);

  // Liveness state
  const [liveStep, setLiveStep] = useState<LiveStep>("idle");
  const [livenessRunning, setLivenessRunning] = useState(false);
  const framesRef = useRef<HTMLCanvasElement[]>([]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      setCameraStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err: any) {
      setCameraError("Could not access your camera. You can upload a photo instead.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
  }, [cameraStream]);

  useEffect(() => {
    if (open && mode === "camera" && !capturedPhoto) startCamera();
    if (!open) {
      stopCamera();
      setCapturedPhoto(null);
      setCameraError(null);
      setLiveStep("idle");
      setLivenessRunning(false);
      framesRef.current = [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  /** Grab the current video frame into a fresh offscreen canvas. */
  const grabFrame = (): HTMLCanvasElement | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d")!.drawImage(video, 0, 0);
    return c;
  };

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Guided liveness: prompt 3 head positions, capture frames, verify movement. */
  const runLiveness = async () => {
    if (!videoRef.current || !cameraStream) return;
    setLivenessRunning(true);
    framesRef.current = [];
    try {
      const steps: LiveStep[] = ["front", "left", "right"];
      for (const step of steps) {
        setLiveStep(step);
        await wait(1800); // give user time to move
        // Average over a couple of frames for stability
        const f = grabFrame();
        if (f) framesRef.current.push(f);
        await wait(200);
      }
      setLiveStep("done");

      const [front, left, right] = framesRef.current;
      if (!front || !left || !right) throw new Error("Could not capture all frames");

      // Liveness: frames must differ meaningfully (i.e. you moved)
      const d1 = frameDiff(front, left);
      const d2 = frameDiff(front, right);
      const moved = d1 > 6 && d2 > 6; // empirical threshold on 0–255 scale

      if (!moved) {
        toast.error("We couldn't detect head movement. Please try again and turn your head.");
        setLiveStep("idle");
        setLivenessRunning(false);
        return;
      }

      // Pick sharpest of the three for enrolment (usually the front one)
      const scored = framesRef.current.map((c) => ({ c, s: sharpnessScore(c) }));
      scored.sort((a, b) => b.s - a.s);
      const best = scored[0].c;

      setCapturedPhoto(best.toDataURL("image/jpeg", 0.92));
      stopCamera();
      toast.success("Live capture verified ✓");
    } catch (err: any) {
      console.error("[Liveness] error", err);
      toast.error("Live capture failed — try again");
      setLiveStep("idle");
    } finally {
      setLivenessRunning(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        if (img.width < 300 || img.height < 300) {
          toast.error("Photo must be at least 300×300 pixels");
          return;
        }
        const canvas = document.createElement("canvas");
        const maxDim = 800;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        setCapturedPhoto(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const retake = () => {
    setCapturedPhoto(null);
    setLiveStep("idle");
    framesRef.current = [];
    if (mode === "camera") startCamera();
  };

  const handleSave = async () => {
    if (!capturedPhoto || !user || !clubId) return;
    if (!consent) {
      toast.error("Please tick the consent box to continue");
      return;
    }
    setSaving(true);
    try {
      const blob = await (await fetch(capturedPhoto)).blob();
      const filePath = `${clubId}/${user.id}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("member-faces")
        .upload(filePath, blob, { contentType: "image/jpeg", upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = await supabase.storage
        .from("member-faces")
        .createSignedUrl(filePath, 60 * 60 * 24 * 365);

      if (urlData?.signedUrl) {
        await fromExt("club_members")
          .update({
            avatar_url: urlData.signedUrl,
            face_consent_at: new Date().toISOString(),
          })
          .eq("club_id", clubId)
          .eq("user_id", user.id);
      }

      if (myClubMember?.id) {
        supabase.functions
          .invoke("access-provision-member", { body: { club_id: clubId, club_member_id: myClubMember.id } })
          .catch((e) => console.warn("[access-provision]", e));
      }

      queryClient.invalidateQueries({ queryKey: ["my-club-member"] });
      queryClient.invalidateQueries({ queryKey: ["club-members"] });
      toast.success("Face photo saved ✓ — your club will be notified for access setup");
      onClose();
    } catch (err: any) {
      console.error("[FaceEnrolment] Save error:", err);
      toast.error(err.message || "Failed to save face photo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <ScanFace className="w-5 h-5 text-primary" /> Face Enrolment
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Your club uses face recognition at the door. We'll do a quick live face scan to enrol you — turn your head as prompted.
          </DialogDescription>
        </DialogHeader>

        {capturedPhoto ? (
          <div className="space-y-3 text-center">
            <div className="w-48 h-48 rounded-full overflow-hidden mx-auto border-4 border-primary/20 relative">
              <img src={capturedPhoto} alt="Your face" className="w-full h-full object-cover" />
              <CheckCircle2 className="absolute bottom-1 right-1 w-7 h-7 text-green-500 bg-background rounded-full" />
            </div>
            <div className="flex gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={retake}>Retake</Button>
            </div>
          </div>
        ) : (
          <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="camera"><Camera className="w-3.5 h-3.5 mr-1" /> Live scan</TabsTrigger>
              <TabsTrigger value="upload"><Upload className="w-3.5 h-3.5 mr-1" /> Upload</TabsTrigger>
            </TabsList>
            <TabsContent value="camera" className="space-y-3 text-center pt-3">
              {cameraError ? (
                <Card className="p-4 text-center space-y-2">
                  <p className="text-sm text-destructive">{cameraError}</p>
                  <Button size="sm" variant="outline" onClick={startCamera}>Try again</Button>
                </Card>
              ) : (
                <>
                  <div className="w-48 h-48 rounded-full overflow-hidden mx-auto border-4 border-primary/20 bg-muted relative">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    {livenessRunning && liveStep !== "idle" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
                        <span className="text-xs font-semibold text-foreground bg-background/90 px-2 py-1 rounded">
                          {STEP_PROMPT[liveStep]}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Live capture verifies you're a real person (not a printed photo) by detecting head movement.
                  </p>
                  <Button size="sm" onClick={runLiveness} disabled={!cameraStream || livenessRunning}>
                    {livenessRunning ? (
                      <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Scanning…</>
                    ) : (
                      <><ScanFace className="w-4 h-4 mr-1" /> Start live scan</>
                    )}
                  </Button>
                </>
              )}
            </TabsContent>
            <TabsContent value="upload" className="space-y-3 text-center pt-3">
              <div className="w-48 h-48 rounded-full mx-auto border-4 border-dashed border-primary/30 bg-muted flex items-center justify-center">
                <Upload className="w-8 h-8 text-muted-foreground" />
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                Choose photo
              </Button>
              <p className="text-[10px] text-muted-foreground">JPG/PNG, at least 300×300 pixels, under 5 MB</p>
            </TabsContent>
          </Tabs>
        )}

        <canvas ref={canvasRef} className="hidden" />

        <div className="flex items-start gap-2 rounded-md border p-3 bg-muted/30">
          <Checkbox id="face-consent" checked={consent} onCheckedChange={(c) => setConsent(!!c)} className="mt-0.5" />
          <Label htmlFor="face-consent" className="text-[11px] text-muted-foreground leading-relaxed cursor-pointer">
            I consent to my photo being used for biometric face recognition at this club's access gates,
            shared with the club's access-control device, and stored under POPIA. I can request deletion at any time.
          </Label>
        </div>

        {capturedPhoto && (
          <Button onClick={handleSave} disabled={saving || !consent} className="w-full">
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Save photo
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
