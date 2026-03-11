import { useEffect, useMemo, useState } from "react";

import { SEO } from "@/components/SEO";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Pencil } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function buildDicebearUrl(style: string, seed: string) {
  const url = new URL(`https://api.dicebear.com/7.x/${style}/svg`);
  url.searchParams.set("seed", seed);
  url.searchParams.set("backgroundType", "gradientLinear");
  return url.toString();
}

function buildAvatarOptions({ userId, name, batch }: { userId: string; name: string; batch: number }) {
  const base = `${userId}:${name || "player"}:${batch}`;
  const styles = ["avataaars-neutral", "adventurer-neutral", "micah", "personas"] as const;
  const seeds = Array.from({ length: 16 }, (_, i) => `${base}:${i}`);
  return seeds.map((s, idx) => buildDicebearUrl(styles[idx % styles.length], s));
}

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

  const [mode, setMode] = useState<"view" | "edit">("view");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarBatch, setAvatarBatch] = useState(0);
  const [avatarOptions, setAvatarOptions] = useState<string[]>([]);
  const [didInitFromUrl, setDidInitFromUrl] = useState(false);
  const [didFocusAvatar, setDidFocusAvatar] = useState(false);

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
    if (user?.id) {
      setAvatarOptions(buildAvatarOptions({ userId: user.id, name: String((profile as any).name || ""), batch: 0 }));
      setAvatarBatch(0);
    }
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

  useEffect(() => {
    const focus = searchParams.get("focus");
    if (focus !== "avatar") return;
    if (mode !== "edit") return;
    if (didFocusAvatar) return;
    if (typeof window === "undefined") return;
    setDidFocusAvatar(true);
    window.setTimeout(() => {
      document.getElementById("avatar-picker")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, [didFocusAvatar, mode, searchParams]);

  const avatarPreview = useMemo(() => {
    const value = avatarUrl.trim();
    return value ? value : null;
  }, [avatarUrl]);

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
                      <PlayerAvatar initials={initialsFor((profile as any).name)} rank={rank} avatarUrl={(profile as any).avatar_url || null} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold font-heading truncate">{(profile as any).name || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{email || "—"}</p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        Phone: {(profile as any).phone ? String((profile as any).phone) : "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1 truncate">
                        {(profile as any).avatar_url ? "Avatar URL set" : "No avatar URL set"}
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
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone (optional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27 82 123 4567" />
              <p className="text-[10px] text-muted-foreground">Used for match reminders and admin contact.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Avatar URL (optional)</Label>
              <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
              {avatarPreview ? (
                <div className="mt-2 rounded-md border border-border/60 p-2 flex items-center gap-3">
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    className="w-10 h-10 rounded-full object-cover bg-muted"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <p className="text-[11px] text-muted-foreground truncate">Preview</p>
                </div>
              ) : null}
            </div>

            <div id="avatar-picker" className="rounded-md border border-border/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium">Choose an avatar</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Select one to auto-fill the URL.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    if (!user?.id) return;
                    const nextBatch = avatarBatch + 1;
                    setAvatarBatch(nextBatch);
                    setAvatarOptions(buildAvatarOptions({ userId: user.id, name: name.trim(), batch: nextBatch }));
                  }}
                >
                  More
                </Button>
              </div>

              <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 mt-3">
                {avatarOptions.map((url) => {
                  const selected = avatarUrl.trim() === url;
                  return (
                    <button
                      key={url}
                      type="button"
                      className={[
                        "rounded-full overflow-hidden border transition-colors w-11 h-11",
                        selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-foreground/40",
                      ].join(" ")}
                      onClick={() => setAvatarUrl(url)}
                      aria-label="Select avatar"
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                Avatars provided by DiceBear.
              </p>
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
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
