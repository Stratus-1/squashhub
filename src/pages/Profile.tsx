import { useEffect, useRef, useState } from "react";

import { SEO } from "@/components/SEO";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Pencil, Camera, Trash2 } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function initialsFor(name?: string | null) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = parts.map((p) => p[0]).join("").toUpperCase();
  return initials || "??";
}

function validatePhone(phone: string) {
  const raw = phone.trim();
  if (!raw) return null;
  const digitsOnly = raw.replace(/\D/g, "");
  if (digitsOnly.length < 9 || digitsOnly.length > 15) return "Please enter a valid phone number";
  return null;
}

export default function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"view" | "edit">("view");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [didInitFromUrl, setDidInitFromUrl] = useState(false);

  const close = () => {
    const backgroundLocation = (location.state as any)?.backgroundLocation;
    if (backgroundLocation) {
      navigate(-1);
      return;
    }
    navigate("/dashboard");
  };

  const resetDraft = () => {
    if (!profile) return;
    setName(String((profile as any).name || ""));
    setPhone(String((profile as any).phone || ""));
    setAvatarUrl(String((profile as any).avatar_url || ""));
    setPreviewFile(null);
  };

  useEffect(() => {
    resetDraft();
  }, [profile]);

  useEffect(() => {
    if (didInitFromUrl) return;
    const edit = searchParams.get("edit") === "1" || searchParams.get("mode") === "edit";
    if (edit) {
      setMode("edit");
      setDidInitFromUrl(true);
    }
  }, [didInitFromUrl, searchParams]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    // Validate file
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }

    // Show local preview
    const localUrl = URL.createObjectURL(file);
    setPreviewFile(localUrl);

    // Upload to storage
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${user.id}/profile.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("profile-pictures")
        .getPublicUrl(filePath);

      // Add cache-buster to force reload
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      setAvatarUrl(publicUrl);
      toast.success("Photo uploaded");
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
      setPreviewFile(null);
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = () => {
    setAvatarUrl("");
    setPreviewFile(null);
  };

  const displayAvatar = previewFile || avatarUrl.trim() || null;

  const save = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not signed in");
      const cleanName = name.trim();
      if (!cleanName) throw new Error("Name is required");
      if (cleanName.length > 100) throw new Error("Name must be less than 100 characters");
      const phoneErr = validatePhone(phone);
      if (phoneErr) throw new Error(phoneErr);

      const patch: any = {
        name: cleanName,
        phone: phone.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      };

      const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast.success("Profile updated");
      setMode("view");
      setPreviewFile(null);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update profile"),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? close() : null)}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-lg max-h-[calc(100dvh-2rem)] sm:max-h-[85dvh] overflow-y-auto overscroll-contain p-4 sm:p-6">
        <SEO title="Profile" description="Your profile details." path="/profile" noIndex />

        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit profile" : "Profile details"}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !profile ? (
          <Card className="p-4 text-sm text-muted-foreground">Could not load your profile.</Card>
        ) : mode === "view" ? (
          (() => {
            const email = (profile as any).email as string | null;
            const rank = typeof (profile as any).rank === "number" ? (profile as any).rank : null;
            return (
              <div className="space-y-4">
                <Card className="border-border/60">
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className="shrink-0">
                      <PlayerAvatar initials={initialsFor((profile as any).name)} rank={rank} avatarUrl={(profile as any).avatar_url || null} size="lg" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold font-heading truncate">{(profile as any).name || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{email || "—"}</p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        Phone: {(profile as any).phone ? String((profile as any).phone) : "—"}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <DialogFooter>
                  <Button variant="outline" onClick={close}>Done</Button>
                  <Button className="gap-1.5" onClick={() => setMode("edit")}>
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Button>
                </DialogFooter>
              </div>
            );
          })()
        ) : (
          <div className="space-y-3">
            {/* Profile picture upload */}
            <div id="avatar-picker" className="flex flex-col items-center gap-3 py-2">
              <div className="relative">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-muted border-2 border-border flex items-center justify-center">
                  {displayAvatar ? (
                    <img src={displayAvatar} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-bold font-heading text-muted-foreground">
                      {initialsFor(name)}
                    </span>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 rounded-full bg-background/60 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  aria-label="Change profile picture"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Camera className="w-3 h-3 mr-1" />
                  {displayAvatar ? "Change photo" : "Upload photo"}
                </Button>
                {displayAvatar && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={handleRemovePhoto}
                    disabled={uploading}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone (optional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27 82 123 4567" />
              <p className="text-[10px] text-muted-foreground">Used for match reminders and admin contact.</p>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  resetDraft();
                  setMode("view");
                }}
                disabled={save.isPending}
              >
                Cancel
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending || uploading}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
