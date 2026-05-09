import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Camera, ScanFace, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMyClub } from "@/hooks/use-club";
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
  const queryClient = useQueryClient();

  const club = clubData?.club || ctxClub;
  const clubId = club?.id;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Camera error:", err);
      setCameraError("Could not access your camera. Please grant camera permissions and try again.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
  }, [cameraStream]);

  useEffect(() => {
    if (open && !capturedPhoto) {
      startCamera();
    }
    if (!open) {
      stopCamera();
      setCapturedPhoto(null);
      setCameraError(null);
    }
  }, [open]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCapturedPhoto(dataUrl);
    stopCamera();
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  const handleSave = async () => {
    if (!capturedPhoto || !user || !clubId) return;
    setSaving(true);
    try {
      const blob = await (await fetch(capturedPhoto)).blob();
      const filePath = `${clubId}/${user.id}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("member-faces")
        .upload(filePath, blob, { contentType: "image/jpeg", upsert: true });
      if (uploadErr) throw uploadErr;

      // Bucket is private — use a long-lived signed URL (1 year).
      const { data: urlData } = await supabase.storage
        .from("member-faces")
        .createSignedUrl(filePath, 60 * 60 * 24 * 365);
      if (urlData?.signedUrl) {
        await fromExt("club_members")
          .update({ avatar_url: urlData.signedUrl })
          .eq("club_id", clubId)
          .eq("user_id", user.id);
      }

      queryClient.invalidateQueries({ queryKey: ["my-club-member"] });
      queryClient.invalidateQueries({ queryKey: ["club-members"] });
      toast.success("Face photo saved successfully ✓");
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
            Your club requires face recognition for court access. Please take a clear, front-facing photo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {cameraError ? (
            <Card className="p-4 text-center space-y-2 w-full">
              <ScanFace className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-destructive">{cameraError}</p>
              <Button size="sm" variant="outline" onClick={startCamera}>
                <Camera className="w-4 h-4 mr-1" /> Try Again
              </Button>
            </Card>
          ) : capturedPhoto ? (
            <div className="space-y-3 text-center">
              <div className="w-48 h-48 rounded-full overflow-hidden mx-auto border-4 border-primary/20">
                <img src={capturedPhoto} alt="Your face" className="w-full h-full object-cover" />
              </div>
              <p className="text-xs text-muted-foreground">Looking good! ✓</p>
              <div className="flex gap-2 justify-center">
                <Button size="sm" variant="outline" onClick={retakePhoto}>
                  <Camera className="w-4 h-4 mr-1" /> Retake
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  Save Photo
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-center">
              <div className="w-48 h-48 rounded-full overflow-hidden mx-auto border-4 border-primary/20 bg-muted">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              </div>
              <Button size="sm" onClick={capturePhoto} disabled={!cameraStream}>
                <Camera className="w-4 h-4 mr-1" /> Capture Photo
              </Button>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          Your photo is stored securely and used only for court access verification.
        </p>
      </DialogContent>
    </Dialog>
  );
}