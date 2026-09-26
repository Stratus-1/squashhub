import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Charges visitor fees for bookings whose start time has arrived and which
// were not cancelled. Runs every 15 minutes via pg_cron; the daily reminders
// job remains as a backstop for anything missed. Idempotent: the RPC refuses
// to charge a booking twice.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const nowTime = now.toISOString().slice(11, 19) // HH:MM:SS UTC

    const { data: bookings, error } = await supabaseAdmin
      .from('bookings')
      .select('id, club_member_id, guest_name, opponent_member_id')
      .eq('status', 'active')
      .is('visitor_fee_charged_at', null)
      .eq('date', today)
      .lte('start_time', nowTime)
      .limit(1000)

    if (error) throw error

    const candidateIds = [...new Set((bookings || []).map((b: any) => b.club_member_id).filter(Boolean))]
    const visitorMemberIds = new Set<string>()
    if (candidateIds.length) {
      const { data: visitorMembers } = await supabaseAdmin
        .from('club_members')
        .select('id')
        .in('id', candidateIds)
        .eq('role', 'visitor')
      for (const m of visitorMembers || []) visitorMemberIds.add((m as any).id)
    }

    let charged = 0
    let attempted = 0
    for (const b of bookings || []) {
      const broughtVisitor = !!b.guest_name && !b.opponent_member_id
      const visitorBooked = b.club_member_id && visitorMemberIds.has(b.club_member_id)
      if (!broughtVisitor && !visitorBooked) continue
      attempted += 1
      try {
        const { data: didCharge } = await supabaseAdmin.rpc('charge_visitor_booking_fee', { p_booking_id: b.id })
        if (didCharge) charged += 1
      } catch (e) {
        console.error('visitor fee charge failed', b.id, e)
      }
    }

    return new Response(JSON.stringify({ ok: true, candidates: (bookings || []).length, attempted, charged }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (e) {
    console.error('charge-visitor-fees failed', e)
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
