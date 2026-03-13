import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

type SeasonRow = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
  created_at: string;
};

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  court_id: number | null;
  capacity: number | null;
  rsvp_deadline: string | null;
  visibility: "public" | "members";
  status: "draft" | "published" | "cancelled";
  created_by: string | null;
  season_id?: string | null;
  kind?: "club" | "social" | string;
};

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
  } catch {
    return "";
  }
}

const NONE = "__none__";

export default function AdminEventEditor() {
  const navigate = useNavigate();
  const locationObj = useLocation();
  const params = useParams();
  const queryClient = useQueryClient();
  const eventId = params.id || null;
  const requestId = useMemo(() => new URLSearchParams(locationObj.search).get("requestId"), [locationObj.search]);
  const preselectSeasonId = useMemo(() => new URLSearchParams(locationObj.search).get("seasonId"), [locationObj.search]);

  const { data: seasons } = useQuery({
    queryKey: ["admin-event-editor", "seasons"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("seasons")
        .select("id,name,starts_on,ends_on,is_active,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        if ((error as any).code === "42P01") return [] as SeasonRow[];
        throw error;
      }
      return (data || []) as SeasonRow[];
    },
  });

  const activeSeason = useMemo(() => (seasons || []).find((s) => !!s.is_active) || null, [seasons]);

  const { data: existingEvent, isLoading: eventLoading, error: eventError } = useQuery({
    queryKey: ["admin-event-editor", "event", eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const { data, error } = await (supabase as any)
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();
      if (error) throw error;
      return data as EventRow;
    },
    enabled: !!eventId,
  });

  const { data: requestRow } = useQuery({
    queryKey: ["admin-event-editor", "event-request", requestId],
    queryFn: async () => {
      if (!requestId) return null;
      const { data, error } = await (supabase as any)
        .from("event_requests")
        .select("*")
        .eq("id", requestId)
        .single();
      if (error) {
        if ((error as any).code === "42P01") return null;
        throw error;
      }
      return data as any;
    },
    enabled: !eventId && !!requestId,
  });

  const [isSeasonEvent, setIsSeasonEvent] = useState<boolean>(() => false);
  const [seasonId, setSeasonId] = useState<string>(() => "");
  const [kind, setKind] = useState<"club" | "social">("club");
  const [visibility, setVisibility] = useState<"public" | "members">("members");
  const [status, setStatus] = useState<"draft" | "published" | "cancelled">("draft");
  const [courtId, setCourtId] = useState<string>("");
  const [capacity, setCapacity] = useState<string>("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAtLocal, setStartsAtLocal] = useState(format(new Date(), "yyyy-MM-dd'T'18:00"));
  const [endsAtLocal, setEndsAtLocal] = useState("");
  const [location, setLocation] = useState("");
  const [rsvpDeadlineLocal, setRsvpDeadlineLocal] = useState("");

  const didHydrateRef = useRef(false);
  useEffect(() => {
    didHydrateRef.current = false;
  }, [eventId]);
  useEffect(() => {
    if (!eventId) return;
    if (!existingEvent) return;
    if (didHydrateRef.current) return;
    didHydrateRef.current = true;

    setTitle(existingEvent.title || "");
    setDescription(existingEvent.description || "");
    setStartsAtLocal(toLocalInput(existingEvent.starts_at) || format(new Date(), "yyyy-MM-dd'T'18:00"));
    setEndsAtLocal(toLocalInput(existingEvent.ends_at));
    setLocation(existingEvent.location || "");
    setCourtId(existingEvent.court_id != null ? String(existingEvent.court_id) : "");
    setCapacity(existingEvent.capacity != null ? String(existingEvent.capacity) : "");
    setRsvpDeadlineLocal(toLocalInput(existingEvent.rsvp_deadline));
    setVisibility(existingEvent.visibility || "members");
    setStatus(existingEvent.status || "draft");
    const evSeasonId = (existingEvent as any).season_id as string | null | undefined;
    setIsSeasonEvent(!!evSeasonId);
    setSeasonId(evSeasonId || activeSeason?.id || "");
    const evKind = ((existingEvent as any).kind as string | undefined) || "club";
    setKind(evKind === "social" ? "social" : "club");
  }, [activeSeason?.id, eventId, existingEvent]);

  const didHydrateFromRequestRef = useRef(false);
  useEffect(() => {
    didHydrateFromRequestRef.current = false;
  }, [requestId]);
  useEffect(() => {
    if (eventId) return;
    if (!requestId) return;
    if (!requestRow) return;
    if (didHydrateFromRequestRef.current) return;
    didHydrateFromRequestRef.current = true;

    setTitle(String(requestRow.title || ""));
    setDescription(String(requestRow.description || ""));
    const reqKind = String(requestRow.kind || "social");
    setKind(reqKind === "club" ? "club" : "social");
    setVisibility((requestRow.visibility as any) || "members");
    setStatus("draft");

    const sid = requestRow.season_id ? String(requestRow.season_id) : "";
    if (sid) {
      setIsSeasonEvent(true);
      setSeasonId(sid);
    } else if (activeSeason?.id) {
      setIsSeasonEvent(true);
      setSeasonId(activeSeason.id);
    }

    const pd = requestRow.preferred_date ? String(requestRow.preferred_date) : "";
    const pt = requestRow.preferred_time ? String(requestRow.preferred_time).slice(0, 5) : "18:00";
    if (pd) setStartsAtLocal(`${pd}T${pt}`);
  }, [activeSeason?.id, eventId, requestId, requestRow]);

  const didHydrateFromSeasonParamRef = useRef(false);
  useEffect(() => {
    didHydrateFromSeasonParamRef.current = false;
  }, [preselectSeasonId, eventId, requestId]);
  useEffect(() => {
    if (eventId) return;
    if (requestId) return;
    if (!preselectSeasonId) return;
    if (didHydrateFromSeasonParamRef.current) return;
    didHydrateFromSeasonParamRef.current = true;
    setIsSeasonEvent(true);
    setSeasonId(String(preselectSeasonId));
  }, [eventId, preselectSeasonId, requestId]);

  const save = useMutation({
    mutationFn: async () => {
      const cleanTitle = title.trim();
      if (!cleanTitle) throw new Error("Title is required");
      if (!startsAtLocal.trim()) throw new Error("Start time is required");

      const startsAtIso = new Date(startsAtLocal).toISOString();
      const endsAtIso = endsAtLocal.trim() ? new Date(endsAtLocal).toISOString() : null;
      const deadlineIso = rsvpDeadlineLocal.trim() ? new Date(rsvpDeadlineLocal).toISOString() : null;
      const cap = capacity.trim() ? Number(capacity) : null;
      if (cap != null && (!Number.isFinite(cap) || cap < 1 || cap > 5000)) throw new Error("Capacity must be 1–5000");

      const payload: any = {
        title: cleanTitle,
        description: description.trim() || null,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        location: location.trim() || null,
        court_id: courtId ? Number(courtId) : null,
        capacity: cap == null ? null : Math.trunc(cap),
        rsvp_deadline: deadlineIso,
        visibility,
        status,
      };

      // Optional season/kind columns (newer schema). Retry without if DB not migrated yet.
      payload.kind = kind;
      payload.season_id = isSeasonEvent ? (seasonId || null) : null;

      const upsert = async (row: any) => {
        const { data, error } = await (supabase as any)
          .from("events")
          .upsert(eventId ? { ...row, id: eventId } : row, { onConflict: "id" })
          .select("id")
          .single();
        if (error) throw error;
        return data as { id: string };
      };

      try {
        return await upsert(payload);
      } catch (e: any) {
        const code = e?.code || e?.details?.code;
        const msg = String(e?.message || "");
        const maybeMissingColumn = code === "42703" || msg.includes("column") || msg.includes("PGRST");
        if (!maybeMissingColumn) throw e;
        const fallback = { ...payload };
        delete fallback.kind;
        delete fallback.season_id;
        return await upsert(fallback);
      }
    },
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "events"] });
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Event saved");
      navigate(`/events/${id}`);
    },
    onError: (e: any) => toast.error(e?.message || "Could not save event"),
  });

  return (
    <div className="bottom-nav-safe">
      <SEO title={eventId ? "Edit Event" : "Create Event"} description="Create or edit a club event." path={eventId ? `/admin/events/${eventId}` : "/admin/events/new"} noIndex />

      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top,1rem))] pb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold font-heading truncate">{eventId ? "Edit event" : "Create event"}</h1>
          <p className="text-sm text-muted-foreground truncate">Standalone events or season events</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link to="/admin">← Back</Link>
        </Button>
      </div>

      <div className="px-4 sm:px-6 lg:px-[5%] space-y-3 mb-24">
        {eventLoading ? (
          <Card className="p-4 text-sm text-muted-foreground">Loading…</Card>
        ) : eventError ? (
          <Card className="p-4 text-sm text-muted-foreground">
            Could not load event. {String((eventError as any)?.message || "")}
          </Card>
        ) : null}

        {!eventId && requestRow && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <p className="text-sm font-semibold font-heading">Prefilled from member request</p>
              <p className="text-xs text-muted-foreground mt-1">
                Request: {String(requestRow.title || "—")}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Club night / Tournament / Braai social" />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[120px]" placeholder="Add details, what to bring, cost, etc." />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Starts</Label>
                <Input type="datetime-local" value={startsAtLocal} onChange={(e) => setStartsAtLocal(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Ends (optional)</Label>
                <Input type="datetime-local" value={endsAtLocal} onChange={(e) => setEndsAtLocal(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Location (optional)</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. My Squash Club" />
              </div>
              <div className="space-y-1.5">
                <Label>Court (optional)</Label>
                <Select
                  value={courtId || NONE}
                  onValueChange={(v) => setCourtId(v === NONE ? "" : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select court" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    <SelectItem value="1">Court 1</SelectItem>
                    <SelectItem value="2">Court 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Capacity (optional)</Label>
                <Input inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 16" />
              </div>
              <div className="space-y-1.5">
                <Label>RSVP deadline (optional)</Label>
                <Input type="datetime-local" value={rsvpDeadlineLocal} onChange={(e) => setRsvpDeadlineLocal(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Visibility</Label>
                <Select value={visibility} onValueChange={(v) => setVisibility(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="members">Members</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">draft</SelectItem>
                    <SelectItem value="published">published</SelectItem>
                    <SelectItem value="cancelled">cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="club">Club event</SelectItem>
                    <SelectItem value="social">Social (members)</SelectItem>
                  </SelectContent>
                </Select>
                {kind === "social" && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Socials are best tied to a season so members can join and RSVP.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Attach to a season</p>
                <p className="text-[11px] text-muted-foreground">Shows on Home under the season card.</p>
              </div>
              <Switch
                checked={isSeasonEvent}
                onCheckedChange={(checked) => {
                  setIsSeasonEvent(checked);
                  if (checked && !seasonId) setSeasonId(activeSeason?.id || "");
                }}
              />
            </div>

            {isSeasonEvent && (
              <div className="space-y-1.5">
                <Label>Season</Label>
                <Select
                  value={seasonId || NONE}
                  onValueChange={(v) => setSeasonId(v === NONE ? "" : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select season" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {(seasons || []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}{s.is_active ? " (active)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => navigate("/admin")}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save event"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
