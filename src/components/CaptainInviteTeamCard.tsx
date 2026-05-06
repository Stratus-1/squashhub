import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Mail, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Teammate {
  member_id: string;
  full_name: string;
  nsa_number: string | null;
  league_name: string | null;
  club_subdomain: string | null;
  phone: string | null;
  email: string | null;
}

interface Props {
  clubMemberId: string;
}

function buildSignupLink(t: Teammate) {
  const sub = t.club_subdomain || "";
  const base = sub
    ? `https://${sub}.squashhub.co.za`
    : "https://squashhub.co.za";
  const params = new URLSearchParams();
  if (sub) params.set("club", sub);
  if (t.nsa_number) params.set("nsa", t.nsa_number);
  return `${base}/league?${params.toString()}`;
}

function buildMessage(t: Teammate) {
  const link = buildSignupLink(t);
  return `Hi ${t.full_name?.split(" ")[0] || "teammate"}! 🏆\n\nI've set up our team on SquashHub — it's free for league players. Claim your account here:\n\n${link}\n\nNSA #: ${t.nsa_number || ""}`;
}

export function CaptainInviteTeamCard({ clubMemberId }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: teammates = [], isLoading, refetch } = useQuery({
    queryKey: ["captain-unclaimed-teammates", clubMemberId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "captain_list_unclaimed_teammates" as any,
        { _club_member_id: clubMemberId },
      );
      if (error) throw error;
      return (data || []) as Teammate[];
    },
    enabled: !!clubMemberId,
  });

  const count = teammates.length;

  const allSelected = useMemo(
    () => count > 0 && selected.size === count,
    [selected, count],
  );

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(teammates.map((t) => t.member_id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendWhatsApp = () => {
    const picked = teammates.filter((t) => selected.has(t.member_id));
    if (!picked.length) {
      toast.error("Pick at least one teammate");
      return;
    }
    picked.forEach((t, i) => {
      const text = encodeURIComponent(buildMessage(t));
      const phone = (t.phone || "").replace(/[^\d]/g, "");
      const url = phone
        ? `https://wa.me/${phone}?text=${text}`
        : `https://wa.me/?text=${text}`;
      // Stagger so popup blockers don't kill them
      setTimeout(() => window.open(url, "_blank", "noopener"), i * 250);
    });
    toast.success(`Opening WhatsApp for ${picked.length} teammate${picked.length === 1 ? "" : "s"}`);
  };

  const sendEmail = () => {
    const picked = teammates.filter((t) => selected.has(t.member_id) && t.email);
    if (!picked.length) {
      toast.error("None of the selected teammates have email addresses on file");
      return;
    }
    const bcc = picked.map((p) => p.email).join(",");
    const subject = encodeURIComponent("Claim your free SquashHub account");
    const body = encodeURIComponent(
      `Hi team,\n\nI've set up our squad on SquashHub — it's free for league players. Each of you has a unique signup link:\n\n${picked
        .map((p) => `• ${p.full_name} (NSA ${p.nsa_number || "?"}): ${buildSignupLink(p)}`)
        .join("\n")}\n\nSee you on court!`,
    );
    window.location.href = `mailto:?bcc=${bcc}&subject=${subject}&body=${body}`;
  };

  if (!isLoading && count === 0) return null;

  return (
    <>
      <Card className="p-3 flex items-center justify-between gap-3 border-amber-500/40 bg-amber-500/5">
        <div className="min-w-0 flex items-center gap-2.5">
          <Users className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold font-heading">Invite your team</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isLoading ? "Checking roster…" : `${count} teammate${count === 1 ? "" : "s"} not signed up yet`}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={isLoading || count === 0}
          onClick={() => {
            setSelected(new Set(teammates.map((t) => t.member_id)));
            setOpen(true);
          }}
        >
          Invite
        </Button>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite your team</DialogTitle>
            <DialogDescription className="text-xs">
              SquashHub is free for league players. We'll send each teammate a one-tap signup link with their NSA number pre-filled.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={toggleAll}
              className="text-primary hover:underline"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            <span className="text-muted-foreground">{selected.size} of {count} selected</span>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-1.5 -mx-2 px-2">
            {isLoading && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {teammates.map((t) => (
              <label
                key={t.member_id}
                className="flex items-start gap-2.5 p-2 rounded-md border bg-card hover:bg-accent/30 cursor-pointer"
              >
                <Checkbox
                  checked={selected.has(t.member_id)}
                  onCheckedChange={() => toggleOne(t.member_id)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{t.full_name}</p>
                    {t.league_name && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                        {t.league_name}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    NSA #{t.nsa_number || "—"}
                    {t.phone ? ` · ${t.phone}` : ""}
                    {!t.phone && !t.email ? " · no contact details" : ""}
                  </p>
                </div>
              </label>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={sendEmail}
              disabled={selected.size === 0}
            >
              <Mail className="w-3.5 h-3.5 mr-1.5" /> Email
            </Button>
            <Button
              className="flex-1 bg-[#25D366] hover:bg-[#1DA851] text-white"
              onClick={sendWhatsApp}
              disabled={selected.size === 0}
            >
              <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
