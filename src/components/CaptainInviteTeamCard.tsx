import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MessageCircle, Mail, Users, Loader2, ChevronRight, Check, Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { normalisePhoneForWhatsApp } from "@/lib/whatsapp";
import { useClubContext } from "@/contexts/ClubContext";

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
  /** Captain mode: pass the captain's club_member_id. */
  clubMemberId?: string;
  /** Admin mode: pass the club id to list every unclaimed member of the club. */
  clubId?: string;
  mode?: "captain" | "admin";
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

export function CaptainInviteTeamCard({ clubMemberId, clubId, mode = "captain" }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  // Sequential WhatsApp send queue (WhatsApp Web reuses the same tab, so we
  // must send one at a time and let the user confirm before opening the next).
  const [queue, setQueue] = useState<Teammate[] | null>(null);
  const [queueIdx, setQueueIdx] = useState(0);

  const { subdomain: clubSubdomain, club } = useClubContext();




  const { data: teammates = [], isLoading } = useQuery({
    queryKey: ["invite-unclaimed", mode, clubMemberId, clubId],
    queryFn: async () => {
      if (mode === "admin" && clubId) {
        const { data, error } = await supabase.rpc(
          "admin_list_unclaimed_club_members" as any,
          { _club_id: clubId },
        );
        if (error) throw error;
        return (data || []) as Teammate[];
      }
      const { data, error } = await supabase.rpc(
        "captain_list_unclaimed_teammates" as any,
        { _club_member_id: clubMemberId! },
      );
      if (error) throw error;
      return (data || []) as Teammate[];
    },
    enabled: mode === "admin" ? !!clubId : !!clubMemberId,
  });

  const genericInviteLink = useMemo(() => {
    const sub = clubSubdomain || (teammates[0]?.club_subdomain ?? "");
    const base = sub ? `https://${sub}.squashhub.co.za` : "https://squashhub.co.za";
    return `${base}/auth`;
  }, [clubSubdomain, teammates]);
  const genericInviteMessage = useMemo(() => {
    const clubName = club?.name || "our squash club";
    return `Hi! 🏸\n\nJoin ${clubName} on SquashHub — it's free. Sign up here:\n\n${genericInviteLink}`;
  }, [club, genericInviteLink]);
  const copyGenericLink = async () => {
    try {
      await navigator.clipboard.writeText(genericInviteLink);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy — long-press to copy manually");
    }
  };
  const shareGenericWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(genericInviteMessage)}`;
    window.open(url, "_blank", "noopener");
  };


  const filtered = useMemo(() => {
    if (!filter.trim()) return teammates;
    const q = filter.toLowerCase();
    return teammates.filter(
      (t) =>
        t.full_name?.toLowerCase().includes(q) ||
        (t.nsa_number || "").toLowerCase().includes(q),
    );
  }, [teammates, filter]);

  const count = teammates.length;
  const allSelected = useMemo(
    () => filtered.length > 0 && filtered.every((t) => selected.has(t.member_id)),
    [selected, filtered],
  );

  const toggleAll = () => {
    if (allSelected) {
      const next = new Set(selected);
      filtered.forEach((t) => next.delete(t.member_id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((t) => next.add(t.member_id));
      setSelected(next);
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startWhatsApp = () => {
    const picked = teammates.filter((t) => selected.has(t.member_id));
    if (!picked.length) {
      toast.error("Pick at least one person");
      return;
    }
    setQueue(picked);
    setQueueIdx(0);
    openWhatsAppFor(picked[0]);
  };

  const openWhatsAppFor = (t: Teammate) => {
    const text = encodeURIComponent(buildMessage(t));
    // Normalise to E.164 (defaults to +27 when phone starts with 0). This
    // ensures WhatsApp resolves the contact even if the number was stored
    // in local SA format ("082…") without the country code.
    const phone = normalisePhoneForWhatsApp(t.phone);
    const url = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener");
  };

  const nextInQueue = () => {
    if (!queue) return;
    const next = queueIdx + 1;
    if (next >= queue.length) {
      toast.success("All invites sent 🎉");
      setQueue(null);
      setQueueIdx(0);
      setOpen(false);
      setSelected(new Set());
      return;
    }
    setQueueIdx(next);
    openWhatsAppFor(queue[next]);
  };

  const cancelQueue = () => {
    setQueue(null);
    setQueueIdx(0);
  };

  const sendEmail = () => {
    const picked = teammates.filter((t) => selected.has(t.member_id) && t.email);
    if (!picked.length) {
      toast.error("None of the selected people have email addresses on file");
      return;
    }
    const bcc = picked.map((p) => p.email).join(",");
    const subject = encodeURIComponent("Claim your free SquashHub account");
    const body = encodeURIComponent(
      `Hi,\n\nSquashHub is free for league players. Each person has a unique signup link:\n\n${picked
        .map((p) => `• ${p.full_name} (NSA ${p.nsa_number || "?"}): ${buildSignupLink(p)}`)
        .join("\n")}\n\nSee you on court!`,
    );
    window.location.href = `mailto:?bcc=${bcc}&subject=${subject}&body=${body}`;
  };

  if (!isLoading && count === 0) return null;

  const isAdmin = mode === "admin";
  const title = isAdmin ? "Invite club members" : "Invite your team";
  const subtitle = isLoading
    ? "Checking roster…"
    : `${count} ${isAdmin ? "member" : "teammate"}${count === 1 ? "" : "s"} not signed up yet`;

  return (
    <>
      <Card className={`p-3 flex items-center justify-between gap-3 ${isAdmin ? "border-primary/40 bg-primary/5" : "border-amber-500/40 bg-amber-500/5"}`}>
        <div className="min-w-0 flex items-center gap-2.5">
          <Users className={`w-4 h-4 shrink-0 ${isAdmin ? "text-primary" : "text-amber-600"}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold font-heading">{title}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={isLoading || count === 0}
          onClick={() => {
            // Don't auto-select-all in admin mode; the list can be big.
            setSelected(isAdmin ? new Set() : new Set(teammates.map((t) => t.member_id)));
            setOpen(true);
          }}
        >
          Invite
        </Button>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { if (!v) cancelQueue(); setOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="text-xs">
              SquashHub is free for league players. Each person gets a one-tap signup link with their NSA number pre-filled.
            </DialogDescription>
          </DialogHeader>

          {queue ? (
            <div className="space-y-3 py-2">
              <div className="text-center space-y-1">
                <p className="text-xs text-muted-foreground">
                  Sending {queueIdx + 1} of {queue.length}
                </p>
                <p className="text-base font-semibold">{queue[queueIdx].full_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  NSA #{queue[queueIdx].nsa_number || "—"}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                WhatsApp opened in a new tab with this person's unique message.
                Send it, then come back here and tap Next.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={cancelQueue}>
                  Stop
                </Button>
                <Button variant="outline" onClick={() => openWhatsAppFor(queue[queueIdx])}>
                  Reopen
                </Button>
                <Button className="flex-1 bg-[#25D366] hover:bg-[#1DA851] text-white" onClick={nextInQueue}>
                  {queueIdx + 1 >= queue.length ? (
                    <><Check className="w-3.5 h-3.5 mr-1.5" /> Done</>
                  ) : (
                    <>Next <ChevronRight className="w-3.5 h-3.5 ml-1" /></>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Non-NSA invite — generic signup link with no NSA number attached. */}
              <div className="rounded-md border bg-muted/30 p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold">Invite non-NSA members</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Share this generic signup link with players who aren't on the NSA list yet.
                </p>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 truncate text-[11px] bg-background border rounded px-2 py-1">
                    {genericInviteLink}
                  </code>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-[11px]" onClick={copyGenericLink}>
                    <Copy className="w-3 h-3 mr-1" /> Copy link
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 h-7 text-[11px] bg-[#25D366] hover:bg-[#1DA851] text-white"
                    onClick={shareGenericWhatsApp}
                  >
                    <MessageCircle className="w-3 h-3 mr-1" /> WhatsApp
                  </Button>
                </div>
              </div>


              {isAdmin && count > 8 && (
                <Input
                  placeholder="Search by name or NSA #"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="h-8 text-xs"
                />
              )}

              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={toggleAll} className="text-primary hover:underline">
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
                <span className="text-muted-foreground">{selected.size} selected</span>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-1.5 -mx-2 px-2">
                {isLoading && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {filtered.map((t) => (
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
                  onClick={startWhatsApp}
                  disabled={selected.size === 0}
                >
                  <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> WhatsApp
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
