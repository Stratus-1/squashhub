import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Search, Sparkles, Send, HeartHandshake, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SKILL_OPTIONS,
  skillLabel,
  normaliseSkills,
  parseOtherSkills,
  matchesSkillSearch,
  hasSkillsInfo,
} from "@/lib/member-skills";

type Row = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  club_member_number: string | null;
  occupation: string | null;
  skills: string[] | null;
  skills_other: string | null;
  volunteer_willing: boolean | null;
  status: string | null;
};

const DEFAULT_SUBJECT = "Can you help? Add your skills to your club profile";
const DEFAULT_BODY = `<p>Hi {{first_name}},</p>
<p>We're building a simple skills directory at {{club_name}} so we know who to ask when the club needs a hand — from a plumber for the change rooms to someone who can help with fundraising or an event.</p>
<p>Please open your profile in the app, scroll to <strong>Skills &amp; Expertise</strong>, tick anything you could offer, and tell us if you're willing to volunteer. It takes under a minute and is completely optional.</p>
<p>Thank you!</p>`;

export function SkillsDirectoryTab({ clubId }: { clubId: string }) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [volunteersOnly, setVolunteersOnly] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["skills-directory", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("id,name,email,phone,club_member_number,occupation,skills,skills_other,volunteer_willing,status")
        .eq("club_id", clubId)
        .order("name");
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const active = useMemo(() => members.filter((m) => (m.status || "active") !== "resigned"), [members]);

  const filtered = useMemo(() => {
    return active.filter((m) => {
      if (volunteersOnly && !m.volunteer_willing) return false;
      if (selectedSkills.length) {
        const tags = normaliseSkills(m.skills);
        if (!selectedSkills.every((s) => tags.includes(s))) return false;
      }
      return matchesSkillSearch(m, search);
    });
  }, [active, volunteersOnly, selectedSkills, search]);

  const incomplete = useMemo(() => active.filter((m) => !hasSkillsInfo(m)), [active]);
  const volunteers = useMemo(() => active.filter((m) => m.volunteer_willing).length, [active]);

  // Which skills are actually present in the club — shown first as quick filters.
  const skillCounts = useMemo(() => {
    const counts = new Map<string, number>();
    active.forEach((m) => normaliseSkills(m.skills).forEach((s) => counts.set(s, (counts.get(s) || 0) + 1)));
    return counts;
  }, [active]);

  const orderedSkills = useMemo(() => {
    return [...SKILL_OPTIONS].sort(
      (a, b) => (skillCounts.get(b.value) || 0) - (skillCounts.get(a.value) || 0) || a.label.localeCompare(b.label),
    );
  }, [skillCounts]);

  const toggleSkill = (v: string) =>
    setSelectedSkills((prev) => (prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v]));

  const askMutation = useMutation({
    mutationFn: async () => {
      const recipients = incomplete.filter((m) => !!m.email).map((m) => m.id);
      if (!recipients.length) throw new Error("No members with an email address still need to complete their skills.");
      const { data: campaign, error } = await supabase
        .from("club_email_campaigns")
        .insert({
          club_id: clubId,
          name: "Skills & Expertise request",
          subject,
          body_html: body,
          audience_type: "selected",
          audience_member_ids: recipients,
          status: "draft",
          created_by: user?.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { data: result, error: fnErr } = await supabase.functions.invoke("send-club-campaign", {
        body: { campaign_id: campaign.id },
      });
      if (fnErr) throw fnErr;
      if ((result as any)?.error) throw new Error((result as any).error);
      return result;
    },
    onSuccess: (r: any) => {
      toast({ title: "Request sent", description: `Queued ${r?.total ?? 0} member${(r?.total ?? 0) === 1 ? "" : "s"}.` });
      setCampaignOpen(false);
    },
    onError: (e: any) => toast({ title: "Could not send", description: e?.message || String(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <Card className="p-3 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <span>
            Find the right member fast — search by trade, profession or club skill, and see who has offered to volunteer.
            Members complete this themselves in their profile; it is always optional.
          </span>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Profiles completed</p>
          <p className="text-lg font-semibold">{active.length - incomplete.length}/{active.length}</p>
        </Card>
        <Card className="p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Willing to volunteer</p>
          <p className="text-lg font-semibold">{volunteers}</p>
        </Card>
        <Card className="p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Still to complete</p>
          <p className="text-lg font-semibold">{incomplete.length}</p>
        </Card>
      </div>

      <Card className="p-3 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skill, occupation or free-text entry"
              className="pl-7 h-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="vol-only" checked={volunteersOnly} onCheckedChange={setVolunteersOnly} />
            <Label htmlFor="vol-only" className="text-xs">Volunteers only</Label>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCampaignOpen(true)} disabled={!incomplete.length}>
            <Send className="w-3.5 h-3.5 mr-1" />
            Ask members to complete ({incomplete.length})
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {orderedSkills.map((s) => {
            const count = skillCounts.get(s.value) || 0;
            const activeFilter = selectedSkills.includes(s.value);
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => toggleSkill(s.value)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  activeFilter
                    ? "border-primary bg-primary text-primary-foreground"
                    : count
                      ? "border-border bg-background hover:bg-muted"
                      : "border-dashed border-border/60 bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {s.label}{count ? ` · ${count}` : ""}
              </button>
            );
          })}
          {selectedSkills.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setSelectedSkills([])}>
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-3">
        <p className="text-sm font-semibold mb-2">Results ({filtered.length})</p>
        {isLoading ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            No members match these filters yet.
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((m) => {
              const tags = normaliseSkills(m.skills);
              const others = parseOtherSkills(m.skills_other);
              return (
                <div key={m.id} className="rounded border border-border p-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{m.name}</p>
                    {m.club_member_number && (
                      <span className="text-[10px] text-muted-foreground">#{m.club_member_number}</span>
                    )}
                    {m.volunteer_willing && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <HeartHandshake className="w-3 h-3" />Volunteer
                      </Badge>
                    )}
                  </div>
                  {m.occupation && <p className="text-[11px] text-muted-foreground">{m.occupation}</p>}
                  {(tags.length > 0 || others.length > 0) && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.map((t) => (
                        <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{skillLabel(t)}</span>
                      ))}
                      {others.map((t) => (
                        <span key={`o-${t}`} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{t}</span>
                      ))}
                    </div>
                  )}
                  {(m.email || m.phone) && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {[m.email, m.phone].filter(Boolean).join(" • ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ask members to add their skills</DialogTitle>
            <DialogDescription className="text-xs">
              Sends to the {incomplete.filter((m) => m.email).length} member(s) with an email address who haven't
              completed the section. Uses your club's normal campaign channel and signature.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Message</Label>
              <Textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-[11px]" />
              <p className="text-[10px] text-muted-foreground">
                Merge fields like {"{{first_name}}"} and {"{{club_name}}"} are supported.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampaignOpen(false)}>Cancel</Button>
            <Button onClick={() => askMutation.mutate()} disabled={askMutation.isPending}>
              {askMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
