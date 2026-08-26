import { useMemo } from "react";
import { Bot, MessageSquareWarning, ThumbsDown, ThumbsUp } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RESPONSE_STYLES } from "@/lib/ai/voice";
import { useAiFeedbackLog, useClubAiSettings, useUpdateClubAiSettings } from "@/hooks/use-ai-assistant";

/**
 * Club-level AI assistant controls plus the feedback dashboard that shows the
 * questions the assistant could not answer, so gaps get closed deliberately.
 */
export function AiAssistantTab({ clubId }: { clubId: string }) {
  const { data: settings, isLoading } = useClubAiSettings(clubId);
  const update = useUpdateClubAiSettings(clubId);
  const { data: feedback } = useAiFeedbackLog(clubId);

  const set = (patch: Record<string, unknown>) => update.mutate(patch as any);

  const unanswered = useMemo(() => (feedback ?? []).filter((f) => f.unanswered), [feedback]);
  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of unanswered) {
      const key = f.question.toLowerCase().split(/\s+/).slice(0, 6).join(" ");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [unanswered]);

  const helpful = (feedback ?? []).filter((f) => f.rating === "up").length;
  const notHelpful = (feedback ?? []).filter((f) => f.rating === "down").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" /> AI Assistant
          </CardTitle>
          <CardDescription className="text-[12px]">
            A voice and text assistant that answers questions, guides members through tasks and opens the right page —
            always within what each person is allowed to see.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-[12px] text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-[13px]">Enable the assistant</Label>
                  <p className="text-[11px] text-muted-foreground">Off by default while the feature beds in.</p>
                </div>
                <Switch checked={!!settings?.enabled} onCheckedChange={(v) => set({ enabled: v })} />
              </div>

              <div className="space-y-1">
                <Label className="text-[13px]">Who can use it</Label>
                <Select value={settings?.audience ?? "all"} onValueChange={(v) => set({ audience: v })}>
                  <SelectTrigger className="h-8 text-[12px] max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All members</SelectItem>
                    <SelectItem value="admins">Admins and office bearers only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { key: "text_chat_enabled", label: "Text chat", hint: "Typed questions" },
                  { key: "voice_input_enabled", label: "Voice input", hint: "Speak the question" },
                  { key: "voice_output_enabled", label: "Voice replies", hint: "Read answers aloud" },
                  { key: "actions_enabled", label: "Actions", hint: "Offer buttons that open pages" },
                ].map((row) => (
                  <div key={row.key} className="flex items-center justify-between rounded-md border p-2">
                    <div>
                      <Label className="text-[12px]">{row.label}</Label>
                      <p className="text-[11px] text-muted-foreground">{row.hint}</p>
                    </div>
                    <Switch
                      checked={(settings as any)?.[row.key] ?? true}
                      onCheckedChange={(v) => set({ [row.key]: v })}
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <Label className="text-[13px]">Default response style</Label>
                <Select
                  value={settings?.response_style ?? "friendly"}
                  onValueChange={(v) => set({ response_style: v })}
                >
                  <SelectTrigger className="h-8 text-[12px] max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESPONSE_STYLES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label} — {s.hint}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Members can pick their own voice, speed and style in the assistant.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareWarning className="h-4 w-4" /> Assistant feedback
          </CardTitle>
          <CardDescription className="text-[12px]">
            What members asked that the assistant could not answer well.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-[12px]">
            <Badge variant="outline" className="gap-1">
              <ThumbsUp className="h-3 w-3" /> {helpful} helpful
            </Badge>
            <Badge variant="outline" className="gap-1">
              <ThumbsDown className="h-3 w-3" /> {notHelpful} not helpful
            </Badge>
            <Badge variant="outline">{unanswered.length} unanswered</Badge>
          </div>

          {topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {topics.map(([topic, count]) => (
                <Badge key={topic} variant="secondary" className="text-[11px]">
                  {topic} · {count}
                </Badge>
              ))}
            </div>
          )}

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">Question</TableHead>
                  <TableHead className="text-[11px]">Page</TableHead>
                  <TableHead className="text-[11px]">Rating</TableHead>
                  <TableHead className="text-[11px]">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(feedback ?? []).slice(0, 50).map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="text-[12px] max-w-[280px] truncate">{f.question}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{f.route ?? "—"}</TableCell>
                    <TableCell className="text-[11px]">
                      {f.unanswered ? "Unanswered" : f.rating === "up" ? "Helpful" : f.rating === "down" ? "Not helpful" : "—"}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {new Date(f.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
                {(feedback ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-[12px] text-muted-foreground text-center py-6">
                      No assistant feedback yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
