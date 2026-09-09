import { supabase } from "@/integrations/supabase/client";

/**
 * Adapter between the older admin event screens (which expect a single
 * `starts_at`/`ends_at` timestamp) and the real schema, where club events live
 * in `club_events` with `start_date` + `start_time`/`end_time`.
 *
 * Source of truth stays `club_events`; nothing here creates a parallel model.
 */

export type ClubEventRow = {
  id: string;
  club_id: string;
  title: string;
  description: string | null;
  start_date: string;
  start_time: string;
  end_time: string;
  day_of_week: number;
  recurrence: string;
  num_instances: number;
  event_type: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type AdminEventView = {
  id: string;
  club_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
  event_type: string;
  recurrence: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const CLUB_EVENT_COLUMNS =
  "id,club_id,title,description,start_date,start_time,end_time,day_of_week,recurrence,num_instances,event_type,status,created_by,created_at,updated_at";

function localIso(date: string, time: string | null) {
  if (!date) return "";
  const t = (time || "00:00").slice(0, 5);
  return `${date}T${t}:00`;
}

export function toAdminEventView(row: ClubEventRow): AdminEventView {
  return {
    id: row.id,
    club_id: row.club_id,
    title: row.title,
    description: row.description ?? null,
    starts_at: localIso(row.start_date, row.start_time),
    ends_at: row.end_time ? localIso(row.start_date, row.end_time) : null,
    status: row.status,
    event_type: row.event_type,
    recurrence: row.recurrence,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Splits a local `yyyy-MM-ddTHH:mm` value into the club_events fields. */
export function splitLocalDateTime(value: string) {
  const [datePart, timePart = "18:00"] = value.split("T");
  const date = new Date(`${datePart}T${timePart.slice(0, 5)}:00`);
  return {
    date: datePart,
    time: `${timePart.slice(0, 5)}:00`,
    dayOfWeek: Number.isNaN(date.getTime()) ? 0 : date.getDay(),
  };
}

export async function fetchAdminEvents(limit = 200): Promise<AdminEventView[]> {
  const { data, error } = await supabase
    .from("club_events")
    .select(CLUB_EVENT_COLUMNS)
    .order("start_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data || []) as unknown as ClubEventRow[]).map(toAdminEventView);
}

export async function fetchAdminEventsInRange(from: string, to: string, limit = 250): Promise<AdminEventView[]> {
  const { data, error } = await supabase
    .from("club_events")
    .select(CLUB_EVENT_COLUMNS)
    .gte("start_date", from)
    .lte("start_date", to)
    .order("start_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data || []) as unknown as ClubEventRow[]).map(toAdminEventView);
}

export async function fetchAdminEvent(id: string): Promise<AdminEventView | null> {
  const { data, error } = await supabase
    .from("club_events")
    .select(CLUB_EVENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toAdminEventView(data as unknown as ClubEventRow) : null;
}

export type SaveAdminEventInput = {
  id?: string | null;
  clubId?: string | null;
  title: string;
  description: string | null;
  startsAtLocal: string;
  endsAtLocal: string | null;
  status: string;
  createdBy?: string | null;
};

export async function saveAdminEvent(input: SaveAdminEventInput): Promise<{ id: string }> {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  if (!input.startsAtLocal) throw new Error("Start time is required");

  const start = splitLocalDateTime(input.startsAtLocal);
  const end = input.endsAtLocal ? splitLocalDateTime(input.endsAtLocal) : null;

  const patch: Record<string, unknown> = {
    title,
    description: input.description,
    start_date: start.date,
    start_time: start.time,
    end_time: end?.time || start.time,
    day_of_week: start.dayOfWeek,
    status: input.status,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("club_events")
      .update(patch as never)
      .eq("id", input.id)
      .select("id")
      .single();
    if (error) throw error;
    return data as { id: string };
  }

  if (!input.clubId) throw new Error("No club selected for this event");
  if (!input.createdBy) throw new Error("You must be signed in to create an event");

  const { data, error } = await supabase
    .from("club_events")
    .insert({
      ...patch,
      club_id: input.clubId,
      created_by: input.createdBy,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}
