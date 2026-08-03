import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { OUTREACH_TEMPLATES } from "@/lib/outreach-templates";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Plus, Trash2, Users, MailOpen, MousePointerClick, Send } from "lucide-react";

interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  status: string;
  daily_cap: number;
  last_run_at: string | null;
  created_at: string;
  stats: { total: number; sent: number; opened: number; clicked: number; failed: number };
}

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-500/20 text-slate-200 border-slate-400/30",
  sending: "bg-amber-500/25 text-amber-100 border-amber-400/40",
  sent: "bg-emerald-500/20 text-emerald-200 border-emerald-400/30",
  paused: "bg-zinc-600/30 text-zinc-300 border-zinc-500/30",
};

export default function SuperAdminOutreachCampaigns() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: camps, error }, { data: recips }] = await Promise.all([
      supabase.from("outreach_campaigns").select("*").order("created_at", { ascending: false }),
      supabase
        .from("outreach_recipients")
        .select("campaign_id,send_status,first_opened_at,first_clicked_at"),
    ]);
    if (error) {
      toast({ title: "Could not load campaigns", description: error.message, variant: "destructive" });
    }
    const byCampaign = new Map<string, CampaignRow["stats"]>();
    for (const r of recips ?? []) {
      const s = byCampaign.get((r as any).campaign_id) ?? {
        total: 0, sent: 0, opened: 0, clicked: 0, failed: 0,
      };
      s.total++;
      if ((r as any).send_status === "sent") s.sent++;
      if ((r as any).send_status === "failed") s.failed++;
      if ((r as any).first_opened_at) s.opened++;
      if ((r as any).first_clicked_at) s.clicked++;
      byCampaign.set((r as any).campaign_id, s);
    }
    setRows(
      (camps ?? []).map((c: any) => ({
        ...c,
        stats: byCampaign.get(c.id) ?? { total: 0, sent: 0, opened: 0, clicked: 0, failed: 0 },
      })),
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        sent: acc.sent + r.stats.sent,
        opened: acc.opened + r.stats.opened,
        clicked: acc.clicked + r.stats.clicked,
      }),
      { sent: 0, opened: 0, clicked: 0 },
    );
  }, [rows]);

  const create = async (templateKey?: string) => {
    const tpl = OUTREACH_TEMPLATES.find((t) => t.key === templateKey);
    const { data, error } = await supabase
      .from("outreach_campaigns")
      .insert({
        name: tpl ? tpl.name : "New campaign",
        subject: tpl?.subject ?? "",
        preheader: tpl?.preheader ?? null,
        body_html: tpl?.bodyHtml ?? "",
        audience_filter: tpl?.suggestedTags?.length ? { tags: tpl.suggestedTags } : {},
      })
      .select("id")
      .single();
    if (error) {
      toast({ title: "Could not create campaign", description: error.message, variant: "destructive" });
      return;
    }
    navigate(`/admin/outreach/campaigns/${data.id}`);
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete campaign "${name}"? Tracking history for it will be removed.`)) return;
    const { error } = await supabase.from("outreach_campaigns").delete().eq("id", id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Campaign deleted" }); load(); }
  };

  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

  return (
    <div className="space-y-4 max-w-[1200px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => navigate("/admin/outreach")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-semibold">Campaigns</h2>
            <p className="text-xs text-white/60">
              Sent from your platform mailbox, throttled with a daily cap.
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New campaign</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {OUTREACH_TEMPLATES.map((t) => (
              <DropdownMenuItem key={t.key} onClick={() => create(t.key)}>
                {t.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => create()}>Blank campaign</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Emails sent", value: totals.sent, icon: Send },
          { label: "Opened", value: totals.opened, icon: MailOpen },
          { label: "Clicked", value: totals.clicked, icon: MousePointerClick },
        ].map((s) => (
          <Card key={s.label} className="p-3 bg-white/5 border-white/10">
            <p className="text-[11px] uppercase tracking-wide text-white/50 flex items-center gap-1">
              <s.icon className="h-3 w-3" /> {s.label}
            </p>
            <p className="text-2xl font-semibold">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="bg-white/5 border-white/10 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-white/50 border-b border-white/10">
              <th className="p-2.5">Campaign</th>
              <th className="p-2.5">Status</th>
              <th className="p-2.5">Audience</th>
              <th className="p-2.5">Sent</th>
              <th className="p-2.5">Opens</th>
              <th className="p-2.5">Clicks</th>
              <th className="p-2.5 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="p-6 text-center text-white/50">Loading…</td></tr>}
            {!loading && !rows.length && (
              <tr><td colSpan={7} className="p-6 text-center text-white/50">
                No campaigns yet — start from the NSA or general template.
              </td></tr>
            )}
            {rows.map((c) => (
              <tr
                key={c.id}
                className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                onClick={() => navigate(`/admin/outreach/campaigns/${c.id}`)}
              >
                <td className="p-2.5">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-white/50 text-[11px] break-words">{c.subject}</div>
                </td>
                <td className="p-2.5">
                  <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[c.status] ?? ""}`}>
                    {c.status}
                  </Badge>
                </td>
                <td className="p-2.5">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3 text-white/40" />{c.stats.total}</span>
                </td>
                <td className="p-2.5">
                  {c.stats.sent}
                  {c.stats.failed > 0 && <span className="text-red-300"> · {c.stats.failed} failed</span>}
                </td>
                <td className="p-2.5">{c.stats.opened} <span className="text-white/40">({pct(c.stats.opened, c.stats.sent)})</span></td>
                <td className="p-2.5">{c.stats.clicked} <span className="text-white/40">({pct(c.stats.clicked, c.stats.sent)})</span></td>
                <td className="p-2.5 text-right">
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); remove(c.id, c.name); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
