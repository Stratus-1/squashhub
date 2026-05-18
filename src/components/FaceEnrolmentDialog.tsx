import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Camera, ScanFace, Loader2, Upload } from "lucide-react";
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setCapturedPhoto(canvas.toDataURL("image/jpeg", 0.9));
    stopCamera();
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
        // Re-encode as JPEG to normalise format / size.
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

      // Fire-and-forget push to the configured access provider.
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
            Your club uses face recognition at the door. Capture a selfie or upload a clear, front-facing photo.
          </DialogDescription>
        </DialogHeader>

        {capturedPhoto ? (
          <div className="space-y-3 text-center">
            <div className="w-48 h-48 rounded-full overflow-hidden mx-auto border-4 border-primary/20">
              <img src={capturedPhoto} alt="Your face" className="w-full h-full object-cover" />
            </div>
            <div className="flex gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={retake}>Retake</Button>
            </div>
          </div>
        ) : (
          <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="camera"><Camera className="w-3.5 h-3.5 mr-1" /> Camera</TabsTrigger>
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
                  <div className="w-48 h-48 rounded-full overflow-hidden mx-auto border-4 border-primary/20 bg-muted">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  </div>
                  <Button size="sm" onClick={capturePhoto} disabled={!cameraStream}>
                    <Camera className="w-4 h-4 mr-1" /> Capture
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
