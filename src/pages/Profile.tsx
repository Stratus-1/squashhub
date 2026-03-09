import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Pencil, LayoutDashboard } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();

  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    if (!profile) return;
    setName(String((profile as any).name || ""));
    setPhone(String((profile as any).phone || ""));
    setAvatarUrl(String((profile as any).avatar_url || ""));
  }, [profile]);

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
      setEditOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update profile"),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="bottom-nav-safe">
        <SEO title="Profile" description="Your profile details." path="/profile" noIndex />
        <PageHeader title="Profile" showNotifications={false} />
        <div className="px-4">
          <Card className="p-4 text-sm text-muted-foreground">Could not load your profile.</Card>
        </div>
      </div>
    );
  }

  const email = (profile as any).email as string | null;
  const rank = typeof (profile as any).rank === "number" ? (profile as any).rank : null;

  return (
    <div className="bottom-nav-safe">
      <SEO title="Profile" description="Your profile details." path="/profile" noIndex />

      <PageHeader title="Profile" subtitle="Your details" showNotifications showProfile={false} />

      <div className="px-4 sm:px-6 lg:px-[5%] pb-20 space-y-3">
        <Card className="border-border/60">
          <CardContent className="p-4 flex items-start gap-4">
            <div className="shrink-0">
              <PlayerAvatar initials={initialsFor((profile as any).name)} rank={rank} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold font-heading truncate">{(profile as any).name || "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{email || "—"}</p>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                Phone: {(profile as any).phone ? String((profile as any).phone) : "—"}
              </p>
              {(profile as any).avatar_url ? (
                <p className="text-[11px] text-muted-foreground mt-1 truncate">
                  Avatar URL set
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1 truncate">
                  No avatar URL set
                </p>
              )}
            </div>
            <div className="shrink-0 flex flex-col gap-2">
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setEditOpen(true)}>
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => navigate("/dashboard")}>
                <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit details</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={save.isPending}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
