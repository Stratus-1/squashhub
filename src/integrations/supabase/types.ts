export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      access_events: {
        Row: {
          club_id: string
          club_member_id: string | null
          door_name: string | null
          event_type: string
          id: string
          occurred_at: string
          provider_person_id: string | null
          raw: Json | null
        }
        Insert: {
          club_id: string
          club_member_id?: string | null
          door_name?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          provider_person_id?: string | null
          raw?: Json | null
        }
        Update: {
          club_id?: string
          club_member_id?: string | null
          door_name?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          provider_person_id?: string | null
          raw?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "access_events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_events_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_events_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      access_provisioning_log: {
        Row: {
          action: string
          attempts: number
          club_id: string
          club_member_id: string | null
          created_at: string
          id: string
          provider: string
          request: Json | null
          response: Json | null
          status: string
        }
        Insert: {
          action: string
          attempts?: number
          club_id: string
          club_member_id?: string | null
          created_at?: string
          id?: string
          provider: string
          request?: Json | null
          response?: Json | null
          status: string
        }
        Update: {
          action?: string
          attempts?: number
          club_id?: string
          club_member_id?: string | null
          created_at?: string
          id?: string
          provider?: string
          request?: Json | null
          response?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_provisioning_log_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_provisioning_log_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_provisioning_log_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          key: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      association_affiliated_clubs: {
        Row: {
          association_tenant_id: string
          club_id: string
          created_at: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          association_tenant_id: string
          club_id: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          association_tenant_id?: string
          club_id?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "association_affiliated_clubs_association_tenant_id_fkey"
            columns: ["association_tenant_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "association_affiliated_clubs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      badge_definitions: {
        Row: {
          category: string
          created_at: string
          criteria: Json
          description: string
          icon: string
          id: string
          name: string
          slug: string
          xp_reward: number
        }
        Insert: {
          category?: string
          created_at?: string
          criteria?: Json
          description: string
          icon?: string
          id?: string
          name: string
          slug: string
          xp_reward?: number
        }
        Update: {
          category?: string
          created_at?: string
          criteria?: Json
          description?: string
          icon?: string
          id?: string
          name?: string
          slug?: string
          xp_reward?: number
        }
        Relationships: []
      }
      bar_items: {
        Row: {
          active: boolean
          category: string
          club_id: string
          cost_price: number
          created_at: string
          id: string
          image_url: string | null
          low_stock_threshold: number
          name: string
          price: number
          sort_order: number
          stock_qty: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          club_id: string
          cost_price?: number
          created_at?: string
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          name: string
          price?: number
          sort_order?: number
          stock_qty?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          club_id?: string
          cost_price?: number
          created_at?: string
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          name?: string
          price?: number
          sort_order?: number
          stock_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bar_items_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_stock_purchases: {
        Row: {
          bar_item_id: string
          club_id: string
          created_at: string
          id: string
          invoice_date: string
          invoice_number: string | null
          payment_method: string
          purchased_by: string | null
          quantity: number
          supplier: string | null
          supplier_note: string | null
          total_cost: number
          unit_cost: number
        }
        Insert: {
          bar_item_id: string
          club_id: string
          created_at?: string
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          payment_method?: string
          purchased_by?: string | null
          quantity: number
          supplier?: string | null
          supplier_note?: string | null
          total_cost?: number
          unit_cost?: number
        }
        Update: {
          bar_item_id?: string
          club_id?: string
          created_at?: string
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          payment_method?: string
          purchased_by?: string | null
          quantity?: number
          supplier?: string | null
          supplier_note?: string | null
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "bar_stock_purchases_bar_item_id_fkey"
            columns: ["bar_item_id"]
            isOneToOne: false
            referencedRelation: "bar_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_stock_purchases_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_stock_purchases_purchased_by_fkey"
            columns: ["purchased_by"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_stock_purchases_purchased_by_fkey"
            columns: ["purchased_by"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_tab_entries: {
        Row: {
          bar_item_id: string
          club_id: string
          club_member_id: string
          created_at: string
          id: string
          logged_by: string | null
          quantity: number
          settled: boolean
          settled_at: string | null
          total: number
          unit_price: number
        }
        Insert: {
          bar_item_id: string
          club_id: string
          club_member_id: string
          created_at?: string
          id?: string
          logged_by?: string | null
          quantity?: number
          settled?: boolean
          settled_at?: string | null
          total: number
          unit_price: number
        }
        Update: {
          bar_item_id?: string
          club_id?: string
          club_member_id?: string
          created_at?: string
          id?: string
          logged_by?: string | null
          quantity?: number
          settled?: boolean
          settled_at?: string | null
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "bar_tab_entries_bar_item_id_fkey"
            columns: ["bar_item_id"]
            isOneToOne: false
            referencedRelation: "bar_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_tab_entries_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_tab_entries_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_tab_entries_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_tab_entries_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_tab_entries_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_visitor_sales: {
        Row: {
          bar_item_id: string
          club_id: string
          created_at: string
          id: string
          logged_by: string | null
          note: string | null
          payment_method: string
          quantity: number
          total: number
          unit_price: number
          visitor_name: string | null
        }
        Insert: {
          bar_item_id: string
          club_id: string
          created_at?: string
          id?: string
          logged_by?: string | null
          note?: string | null
          payment_method: string
          quantity: number
          total: number
          unit_price: number
          visitor_name?: string | null
        }
        Update: {
          bar_item_id?: string
          club_id?: string
          created_at?: string
          id?: string
          logged_by?: string | null
          note?: string | null
          payment_method?: string
          quantity?: number
          total?: number
          unit_price?: number
          visitor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bar_visitor_sales_bar_item_id_fkey"
            columns: ["bar_item_id"]
            isOneToOne: false
            referencedRelation: "bar_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_visitor_sales_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_visitor_sales_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_visitor_sales_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_invites: {
        Row: {
          booking_id: string
          channel: string
          created_at: string
          decline_reason: string | null
          id: string
          invitee_email: string | null
          invitee_name: string | null
          invitee_phone: string | null
          inviter_id: string
          responded_at: string | null
          status: string
          token: string
        }
        Insert: {
          booking_id: string
          channel?: string
          created_at?: string
          decline_reason?: string | null
          id?: string
          invitee_email?: string | null
          invitee_name?: string | null
          invitee_phone?: string | null
          inviter_id: string
          responded_at?: string | null
          status?: string
          token?: string
        }
        Update: {
          booking_id?: string
          channel?: string
          created_at?: string
          decline_reason?: string | null
          id?: string
          invitee_email?: string | null
          invitee_name?: string | null
          invitee_phone?: string | null
          inviter_id?: string
          responded_at?: string | null
          status?: string
          token?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          challenge_id: string | null
          club_id: string | null
          club_member_id: string | null
          court_id: number
          created_at: string
          date: string
          end_time: string
          external_booker_name: string | null
          external_id: string | null
          guest_name: string | null
          id: string
          is_friendly: boolean
          light_fee_split: string
          lights_requested: boolean
          opponent_id: string | null
          opponent_member_id: string | null
          source: string
          start_time: string
          status: string
          user_id: string | null
        }
        Insert: {
          challenge_id?: string | null
          club_id?: string | null
          club_member_id?: string | null
          court_id: number
          created_at?: string
          date: string
          end_time: string
          external_booker_name?: string | null
          external_id?: string | null
          guest_name?: string | null
          id?: string
          is_friendly?: boolean
          light_fee_split?: string
          lights_requested?: boolean
          opponent_id?: string | null
          opponent_member_id?: string | null
          source?: string
          start_time: string
          status?: string
          user_id?: string | null
        }
        Update: {
          challenge_id?: string | null
          club_id?: string | null
          club_member_id?: string | null
          court_id?: number
          created_at?: string
          date?: string
          end_time?: string
          external_booker_name?: string | null
          external_id?: string | null
          guest_name?: string | null
          id?: string
          is_friendly?: boolean
          light_fee_split?: string
          lights_requested?: boolean
          opponent_id?: string | null
          opponent_member_id?: string | null
          source?: string
          start_time?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_opponent_member_id_fkey"
            columns: ["opponent_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_opponent_member_id_fkey"
            columns: ["opponent_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_schedules: {
        Row: {
          booking_id: string | null
          challenge_id: string
          court_id: number | null
          created_at: string
          end_time: string
          expires_at: string
          id: string
          proposed_by: string
          proposed_date: string
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          challenge_id: string
          court_id?: number | null
          created_at?: string
          end_time: string
          expires_at?: string
          id?: string
          proposed_by: string
          proposed_date: string
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          challenge_id?: string
          court_id?: number | null
          created_at?: string
          end_time?: string
          expires_at?: string
          id?: string
          proposed_by?: string
          proposed_date?: string
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_schedules_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_schedules_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_schedules_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          challenger_id: string
          challenger_member_id: string | null
          club_id: string | null
          confirmed_by: string | null
          counter_date: string | null
          counter_time: string | null
          court_id: number | null
          created_at: string
          id: string
          opponent_id: string | null
          opponent_member_id: string | null
          proposed_date: string | null
          proposed_time: string | null
          status: string
          updated_at: string
        }
        Insert: {
          challenger_id: string
          challenger_member_id?: string | null
          club_id?: string | null
          confirmed_by?: string | null
          counter_date?: string | null
          counter_time?: string | null
          court_id?: number | null
          created_at?: string
          id?: string
          opponent_id?: string | null
          opponent_member_id?: string | null
          proposed_date?: string | null
          proposed_time?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          challenger_id?: string
          challenger_member_id?: string | null
          club_id?: string | null
          confirmed_by?: string | null
          counter_date?: string | null
          counter_time?: string | null
          court_id?: number | null
          created_at?: string
          id?: string
          opponent_id?: string | null
          opponent_member_id?: string | null
          proposed_date?: string | null
          proposed_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_challenger_member_id_fkey"
            columns: ["challenger_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_challenger_member_id_fkey"
            columns: ["challenger_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_opponent_member_id_fkey"
            columns: ["opponent_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_opponent_member_id_fkey"
            columns: ["opponent_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      club_champs: {
        Row: {
          bye_handling: string
          club_id: string
          court_ids: number[]
          court_rotation_minutes: number | null
          created_at: string
          day_schedules: Json
          default_break_minutes: number
          description: string | null
          enable_playoffs: boolean
          end_date: string
          end_time: string
          entries_locked: boolean
          entry_fee_cents: number
          gender: string
          group_break_minutes: Json
          group_durations: Json
          id: string
          include_visitors: boolean
          invite_methods: string[]
          match_duration_minutes: number
          match_type: string
          name: string
          num_groups: number
          partner_mode: string
          payment_methods: string[]
          payment_required: boolean
          play_days: number[]
          registration_closes_at: string | null
          registration_mode: string
          registration_opens_at: string | null
          round_format: string
          scoring_mode: string
          source_league_id: string | null
          source_league_ids: string[]
          start_date: string
          start_time: string
          status: string
          updated_at: string
          visitor_clubs: string[]
        }
        Insert: {
          bye_handling?: string
          club_id: string
          court_ids?: number[]
          court_rotation_minutes?: number | null
          created_at?: string
          day_schedules?: Json
          default_break_minutes?: number
          description?: string | null
          enable_playoffs?: boolean
          end_date: string
          end_time?: string
          entries_locked?: boolean
          entry_fee_cents?: number
          gender: string
          group_break_minutes?: Json
          group_durations?: Json
          id?: string
          include_visitors?: boolean
          invite_methods?: string[]
          match_duration_minutes?: number
          match_type?: string
          name: string
          num_groups?: number
          partner_mode?: string
          payment_methods?: string[]
          payment_required?: boolean
          play_days?: number[]
          registration_closes_at?: string | null
          registration_mode?: string
          registration_opens_at?: string | null
          round_format?: string
          scoring_mode?: string
          source_league_id?: string | null
          source_league_ids?: string[]
          start_date: string
          start_time?: string
          status?: string
          updated_at?: string
          visitor_clubs?: string[]
        }
        Update: {
          bye_handling?: string
          club_id?: string
          court_ids?: number[]
          court_rotation_minutes?: number | null
          created_at?: string
          day_schedules?: Json
          default_break_minutes?: number
          description?: string | null
          enable_playoffs?: boolean
          end_date?: string
          end_time?: string
          entries_locked?: boolean
          entry_fee_cents?: number
          gender?: string
          group_break_minutes?: Json
          group_durations?: Json
          id?: string
          include_visitors?: boolean
          invite_methods?: string[]
          match_duration_minutes?: number
          match_type?: string
          name?: string
          num_groups?: number
          partner_mode?: string
          payment_methods?: string[]
          payment_required?: boolean
          play_days?: number[]
          registration_closes_at?: string | null
          registration_mode?: string
          registration_opens_at?: string | null
          round_format?: string
          scoring_mode?: string
          source_league_id?: string | null
          source_league_ids?: string[]
          start_date?: string
          start_time?: string
          status?: string
          updated_at?: string
          visitor_clubs?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "club_champs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_source_league_id_fkey"
            columns: ["source_league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      club_champs_entries: {
        Row: {
          champ_id: string
          club_member_id: string
          created_at: string
          group_number: number
          id: string
          order_index: number
          partner_member_id: string | null
        }
        Insert: {
          champ_id: string
          club_member_id: string
          created_at?: string
          group_number?: number
          id?: string
          order_index?: number
          partner_member_id?: string | null
        }
        Update: {
          champ_id?: string
          club_member_id?: string
          created_at?: string
          group_number?: number
          id?: string
          order_index?: number
          partner_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_champs_entries_champ_id_fkey"
            columns: ["champ_id"]
            isOneToOne: false
            referencedRelation: "club_champs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_entries_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_entries_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_entries_partner_member_id_fkey"
            columns: ["partner_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_entries_partner_member_id_fkey"
            columns: ["partner_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      club_champs_matches: {
        Row: {
          bell_ends_at: string | null
          bell_paused_seconds: number | null
          bye_member_id: string | null
          champ_id: string
          court_id: number | null
          created_at: string
          game_scores: string | null
          group_number: number
          id: string
          is_bye: boolean
          leg: string | null
          partner_a_member_id: string | null
          partner_b_member_id: string | null
          player_a_member_id: string
          player_b_member_id: string
          round_number: number
          scheduled_date: string | null
          scheduled_time: string | null
          score: string | null
          side_a_points: number | null
          side_b_points: number | null
          status: string
          updated_at: string
          winner_member_id: string | null
        }
        Insert: {
          bell_ends_at?: string | null
          bell_paused_seconds?: number | null
          bye_member_id?: string | null
          champ_id: string
          court_id?: number | null
          created_at?: string
          game_scores?: string | null
          group_number: number
          id?: string
          is_bye?: boolean
          leg?: string | null
          partner_a_member_id?: string | null
          partner_b_member_id?: string | null
          player_a_member_id: string
          player_b_member_id: string
          round_number?: number
          scheduled_date?: string | null
          scheduled_time?: string | null
          score?: string | null
          side_a_points?: number | null
          side_b_points?: number | null
          status?: string
          updated_at?: string
          winner_member_id?: string | null
        }
        Update: {
          bell_ends_at?: string | null
          bell_paused_seconds?: number | null
          bye_member_id?: string | null
          champ_id?: string
          court_id?: number | null
          created_at?: string
          game_scores?: string | null
          group_number?: number
          id?: string
          is_bye?: boolean
          leg?: string | null
          partner_a_member_id?: string | null
          partner_b_member_id?: string | null
          player_a_member_id?: string
          player_b_member_id?: string
          round_number?: number
          scheduled_date?: string | null
          scheduled_time?: string | null
          score?: string | null
          side_a_points?: number | null
          side_b_points?: number | null
          status?: string
          updated_at?: string
          winner_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_champs_matches_champ_id_fkey"
            columns: ["champ_id"]
            isOneToOne: false
            referencedRelation: "club_champs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_matches_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_matches_partner_a_member_id_fkey"
            columns: ["partner_a_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_matches_partner_a_member_id_fkey"
            columns: ["partner_a_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_matches_partner_b_member_id_fkey"
            columns: ["partner_b_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_matches_partner_b_member_id_fkey"
            columns: ["partner_b_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_matches_player_a_member_id_fkey"
            columns: ["player_a_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_matches_player_a_member_id_fkey"
            columns: ["player_a_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_matches_player_b_member_id_fkey"
            columns: ["player_b_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_matches_player_b_member_id_fkey"
            columns: ["player_b_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_matches_winner_member_id_fkey"
            columns: ["winner_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_matches_winner_member_id_fkey"
            columns: ["winner_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      club_champs_registrations: {
        Row: {
          champ_id: string
          club_member_id: string
          created_at: string
          fee_paid_cents: number
          fee_payment_id: string | null
          id: string
          invited_by_admin: boolean
          paid_at: string | null
          partner_confirmed: boolean
          partner_member_id: string | null
          payment_ref: string | null
          status: string
          updated_at: string
        }
        Insert: {
          champ_id: string
          club_member_id: string
          created_at?: string
          fee_paid_cents?: number
          fee_payment_id?: string | null
          id?: string
          invited_by_admin?: boolean
          paid_at?: string | null
          partner_confirmed?: boolean
          partner_member_id?: string | null
          payment_ref?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          champ_id?: string
          club_member_id?: string
          created_at?: string
          fee_paid_cents?: number
          fee_payment_id?: string | null
          id?: string
          invited_by_admin?: boolean
          paid_at?: string | null
          partner_confirmed?: boolean
          partner_member_id?: string | null
          payment_ref?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_champs_registrations_champ_id_fkey"
            columns: ["champ_id"]
            isOneToOne: false
            referencedRelation: "club_champs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_registrations_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_registrations_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_registrations_fee_payment_id_fkey"
            columns: ["fee_payment_id"]
            isOneToOne: false
            referencedRelation: "club_member_fee_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_registrations_partner_member_id_fkey"
            columns: ["partner_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_registrations_partner_member_id_fkey"
            columns: ["partner_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      club_email_campaign_recipients: {
        Row: {
          campaign_id: string
          club_member_id: string | null
          created_at: string
          email: string
          error_message: string | null
          id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          club_member_id?: string | null
          created_at?: string
          email: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          club_member_id?: string | null
          created_at?: string
          email?: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "club_email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      club_email_campaigns: {
        Row: {
          audience_league_id: string | null
          audience_member_ids: string[] | null
          audience_type: string
          body_html: string
          club_id: string
          created_at: string
          created_by: string | null
          failed_count: number
          id: string
          name: string
          sent_at: string | null
          sent_count: number
          status: string
          subject: string
          template_id: string | null
          total_recipients: number
          updated_at: string
        }
        Insert: {
          audience_league_id?: string | null
          audience_member_ids?: string[] | null
          audience_type: string
          body_html: string
          club_id: string
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          name?: string
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject: string
          template_id?: string | null
          total_recipients?: number
          updated_at?: string
        }
        Update: {
          audience_league_id?: string | null
          audience_member_ids?: string[] | null
          audience_type?: string
          body_html?: string
          club_id?: string
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          name?: string
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          template_id?: string | null
          total_recipients?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_email_campaigns_audience_league_id_fkey"
            columns: ["audience_league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_email_campaigns_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "club_email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      club_email_templates: {
        Row: {
          body_html: string
          club_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_html?: string
          club_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          subject?: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          club_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_email_templates_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_event_courts: {
        Row: {
          court_id: number
          event_id: string
          id: string
        }
        Insert: {
          court_id: number
          event_id: string
          id?: string
        }
        Update: {
          court_id?: number
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_event_courts_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_event_courts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "club_events"
            referencedColumns: ["id"]
          },
        ]
      }
      club_event_instance_rsvps: {
        Row: {
          club_member_id: string
          created_at: string
          id: string
          instance_id: string
          status: string
          updated_at: string
        }
        Insert: {
          club_member_id: string
          created_at?: string
          id?: string
          instance_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          club_member_id?: string
          created_at?: string
          id?: string
          instance_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_event_instance_rsvps_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_event_instance_rsvps_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_event_instance_rsvps_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "club_event_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      club_event_instances: {
        Row: {
          created_at: string
          event_id: string
          id: string
          instance_date: string
          light_fee_total: number
          status: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          instance_date: string
          light_fee_total?: number
          status?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          instance_date?: string
          light_fee_total?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_event_instances_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "club_events"
            referencedColumns: ["id"]
          },
        ]
      }
      club_event_rsvps: {
        Row: {
          club_member_id: string
          created_at: string
          event_id: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          club_member_id: string
          created_at?: string
          event_id: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          club_member_id?: string
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_event_rsvps_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_event_rsvps_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "club_events"
            referencedColumns: ["id"]
          },
        ]
      }
      club_events: {
        Row: {
          booked_by_member_id: string | null
          club_id: string
          created_at: string
          created_by: string
          day_of_week: number
          description: string | null
          end_time: string
          event_type: string
          id: string
          invite_scope: string
          invite_scope_id: string | null
          is_club_booking: boolean
          light_fee_split: string
          num_instances: number
          recurrence: string
          reminder_hours: number
          start_date: string
          start_time: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          booked_by_member_id?: string | null
          club_id: string
          created_at?: string
          created_by: string
          day_of_week: number
          description?: string | null
          end_time: string
          event_type?: string
          id?: string
          invite_scope?: string
          invite_scope_id?: string | null
          is_club_booking?: boolean
          light_fee_split?: string
          num_instances?: number
          recurrence?: string
          reminder_hours?: number
          start_date?: string
          start_time: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          booked_by_member_id?: string | null
          club_id?: string
          created_at?: string
          created_by?: string
          day_of_week?: number
          description?: string | null
          end_time?: string
          event_type?: string
          id?: string
          invite_scope?: string
          invite_scope_id?: string | null
          is_club_booking?: boolean
          light_fee_split?: string
          num_instances?: number
          recurrence?: string
          reminder_hours?: number
          start_date?: string
          start_time?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_events_booked_by_member_id_fkey"
            columns: ["booked_by_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_events_booked_by_member_id_fkey"
            columns: ["booked_by_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_fees_payable: {
        Row: {
          active: boolean
          amount: number
          basis: string
          club_id: string
          created_at: string
          due_day: number
          due_month: number
          id: string
          notes: string | null
          payee_name: string
          payee_ref_id: string | null
          payee_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number
          basis?: string
          club_id: string
          created_at?: string
          due_day?: number
          due_month?: number
          id?: string
          notes?: string | null
          payee_name: string
          payee_ref_id?: string | null
          payee_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          basis?: string
          club_id?: string
          created_at?: string
          due_day?: number
          due_month?: number
          id?: string
          notes?: string | null
          payee_name?: string
          payee_ref_id?: string | null
          payee_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_fees_payable_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_journal_entries: {
        Row: {
          account: Database["public"]["Enums"]["gl_account"]
          club_id: string
          club_member_id: string | null
          created_at: string
          credit: number
          debit: number
          description: string
          fee_payment_id: string | null
          id: string
          journal_ref: string
          transaction_id: string | null
        }
        Insert: {
          account: Database["public"]["Enums"]["gl_account"]
          club_id: string
          club_member_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          description: string
          fee_payment_id?: string | null
          id?: string
          journal_ref?: string
          transaction_id?: string | null
        }
        Update: {
          account?: Database["public"]["Enums"]["gl_account"]
          club_id?: string
          club_member_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          description?: string
          fee_payment_id?: string | null
          id?: string
          journal_ref?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_journal_entries_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_journal_entries_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_journal_entries_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_journal_entries_fee_payment_id_fkey"
            columns: ["fee_payment_id"]
            isOneToOne: false
            referencedRelation: "club_member_fee_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_journal_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "member_credit_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      club_member_fee_payments: {
        Row: {
          amount: number
          club_member_id: string
          created_at: string
          fee_label: string
          fee_type: string
          id: string
          is_pass_through: boolean
          linked_fee_payment_id: string | null
          paid: boolean
          paid_at: string | null
          season_year: number
          updated_at: string
        }
        Insert: {
          amount?: number
          club_member_id: string
          created_at?: string
          fee_label: string
          fee_type: string
          id?: string
          is_pass_through?: boolean
          linked_fee_payment_id?: string | null
          paid?: boolean
          paid_at?: string | null
          season_year?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          club_member_id?: string
          created_at?: string
          fee_label?: string
          fee_type?: string
          id?: string
          is_pass_through?: boolean
          linked_fee_payment_id?: string | null
          paid?: boolean
          paid_at?: string | null
          season_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_member_fee_payments_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_member_fee_payments_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_member_fee_payments_linked_fee_payment_id_fkey"
            columns: ["linked_fee_payment_id"]
            isOneToOne: false
            referencedRelation: "club_member_fee_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      club_member_ladder_history: {
        Row: {
          change_source: string
          changed_by: string | null
          club_id: string
          club_member_id: string
          created_at: string
          id: string
          new_position: number | null
          old_position: number | null
        }
        Insert: {
          change_source?: string
          changed_by?: string | null
          club_id: string
          club_member_id: string
          created_at?: string
          id?: string
          new_position?: number | null
          old_position?: number | null
        }
        Update: {
          change_source?: string
          changed_by?: string | null
          club_id?: string
          club_member_id?: string
          created_at?: string
          id?: string
          new_position?: number | null
          old_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "club_member_ladder_history_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_member_ladder_history_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      club_member_permissions: {
        Row: {
          club_member_id: string
          created_at: string
          custom_permissions: string[]
          id: string
          is_full_admin: boolean
          permission_role_id: string | null
          updated_at: string
        }
        Insert: {
          club_member_id: string
          created_at?: string
          custom_permissions?: string[]
          id?: string
          is_full_admin?: boolean
          permission_role_id?: string | null
          updated_at?: string
        }
        Update: {
          club_member_id?: string
          created_at?: string
          custom_permissions?: string[]
          id?: string
          is_full_admin?: boolean
          permission_role_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_member_permissions_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: true
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_member_permissions_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: true
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_member_permissions_permission_role_id_fkey"
            columns: ["permission_role_id"]
            isOneToOne: false
            referencedRelation: "club_permission_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_members: {
        Row: {
          address: string | null
          avatar_url: string | null
          club_id: string
          club_member_number: string | null
          email: string | null
          enable_league_association_id: string | null
          face_consent_at: string | null
          face_provider_person_id: string | null
          face_provisioned_at: string | null
          fee_category_id: string | null
          gender: string | null
          home_club_id: string | null
          home_club_name: string | null
          id: string
          id_number: string | null
          is_league_only_membership: boolean
          joined_at: string
          ladder_position: number | null
          name: string | null
          pending_captain_claim: boolean
          phone: string | null
          plays_league: boolean
          role: Database["public"]["Enums"]["club_member_role"]
          skill_level: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          club_id: string
          club_member_number?: string | null
          email?: string | null
          enable_league_association_id?: string | null
          face_consent_at?: string | null
          face_provider_person_id?: string | null
          face_provisioned_at?: string | null
          fee_category_id?: string | null
          gender?: string | null
          home_club_id?: string | null
          home_club_name?: string | null
          id?: string
          id_number?: string | null
          is_league_only_membership?: boolean
          joined_at?: string
          ladder_position?: number | null
          name?: string | null
          pending_captain_claim?: boolean
          phone?: string | null
          plays_league?: boolean
          role?: Database["public"]["Enums"]["club_member_role"]
          skill_level?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          club_id?: string
          club_member_number?: string | null
          email?: string | null
          enable_league_association_id?: string | null
          face_consent_at?: string | null
          face_provider_person_id?: string | null
          face_provisioned_at?: string | null
          fee_category_id?: string | null
          gender?: string | null
          home_club_id?: string | null
          home_club_name?: string | null
          id?: string
          id_number?: string | null
          is_league_only_membership?: boolean
          joined_at?: string
          ladder_position?: number | null
          name?: string | null
          pending_captain_claim?: boolean
          phone?: string | null
          plays_league?: boolean
          role?: Database["public"]["Enums"]["club_member_role"]
          skill_level?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_members_enable_league_association_id_fkey"
            columns: ["enable_league_association_id"]
            isOneToOne: false
            referencedRelation: "association_member_affiliations_v"
            referencedColumns: ["league_association_id"]
          },
          {
            foreignKeyName: "club_members_enable_league_association_id_fkey"
            columns: ["enable_league_association_id"]
            isOneToOne: false
            referencedRelation: "league_associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_members_fee_category_id_fkey"
            columns: ["fee_category_id"]
            isOneToOne: false
            referencedRelation: "member_fee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_members_home_club_id_fkey"
            columns: ["home_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_permission_roles: {
        Row: {
          club_id: string
          created_at: string
          id: string
          is_full_admin: boolean
          permissions: string[]
          role_name: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          is_full_admin?: boolean
          permissions?: string[]
          role_name: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          is_full_admin?: boolean
          permissions?: string[]
          role_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_permission_roles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_secrets: {
        Row: {
          access_control_api_key: string | null
          access_control_api_url: string | null
          access_control_type: string | null
          access_provider: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_branch_code: string | null
          bank_name: string | null
          bank_reference: string | null
          club_id: string
          created_at: string
          fluss_api_token: string | null
          fluss_default_device_id: string | null
          id: string
          payment_gateway_credentials: Json | null
          payment_gateway_secret_key: string | null
          relay_device_type: string
          sender_email: string | null
          sender_name: string | null
          shelly_auth_key: string | null
          smtp_host: string | null
          smtp_pass: string | null
          smtp_port: number | null
          smtp_user: string | null
          updated_at: string
          zk_area_id: string | null
          zk_base_url: string | null
          zk_door_group: string | null
          zk_password: string | null
          zk_username: string | null
          zk_webhook_secret: string | null
        }
        Insert: {
          access_control_api_key?: string | null
          access_control_api_url?: string | null
          access_control_type?: string | null
          access_provider?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_branch_code?: string | null
          bank_name?: string | null
          bank_reference?: string | null
          club_id: string
          created_at?: string
          fluss_api_token?: string | null
          fluss_default_device_id?: string | null
          id?: string
          payment_gateway_credentials?: Json | null
          payment_gateway_secret_key?: string | null
          relay_device_type?: string
          sender_email?: string | null
          sender_name?: string | null
          shelly_auth_key?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          updated_at?: string
          zk_area_id?: string | null
          zk_base_url?: string | null
          zk_door_group?: string | null
          zk_password?: string | null
          zk_username?: string | null
          zk_webhook_secret?: string | null
        }
        Update: {
          access_control_api_key?: string | null
          access_control_api_url?: string | null
          access_control_type?: string | null
          access_provider?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_branch_code?: string | null
          bank_name?: string | null
          bank_reference?: string | null
          club_id?: string
          created_at?: string
          fluss_api_token?: string | null
          fluss_default_device_id?: string | null
          id?: string
          payment_gateway_credentials?: Json | null
          payment_gateway_secret_key?: string | null
          relay_device_type?: string
          sender_email?: string | null
          sender_name?: string | null
          shelly_auth_key?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          updated_at?: string
          zk_area_id?: string | null
          zk_base_url?: string | null
          zk_door_group?: string | null
          zk_password?: string | null
          zk_username?: string | null
          zk_webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_secrets_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_subscriptions: {
        Row: {
          amount_due: number
          cancelled_at: string | null
          club_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          last_payment_at: string | null
          member_count: number
          plan_id: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          amount_due?: number
          cancelled_at?: string | null
          club_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          last_payment_at?: string | null
          member_count?: number
          plan_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          amount_due?: number
          cancelled_at?: string | null
          club_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          last_payment_at?: string | null
          member_count?: number
          plan_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_subscriptions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      club_visitor_home_clubs: {
        Row: {
          club_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_visitor_home_clubs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_visitors: {
        Row: {
          category: string
          club_id: string
          created_at: string
          email: string | null
          first_name: string
          home_club_name: string
          id: string
          last_name: string
          member_number: string | null
          phone: string | null
        }
        Insert: {
          category?: string
          club_id: string
          created_at?: string
          email?: string | null
          first_name: string
          home_club_name: string
          id?: string
          last_name: string
          member_number?: string | null
          phone?: string | null
        }
        Update: {
          category?: string
          club_id?: string
          created_at?: string
          email?: string | null
          first_name?: string
          home_club_name?: string
          id?: string
          last_name?: string
          member_number?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_visitors_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          address: string | null
          auto_number_existing_onboarding: boolean
          booking_slot_minutes: number
          chairman_member_id: string | null
          challenge_levels_up: number | null
          club_captain_member_id: string | null
          contact_person_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          email_disclaimer: string | null
          email_signature_html: string | null
          external_booking_label: string | null
          external_booking_provider: string | null
          external_booking_url: string | null
          face_enrolment_required: boolean
          fee_reminder_days_before: number | null
          fill_top_down_enabled: boolean
          fill_up_leagues_enabled: boolean
          free_tier_until: string | null
          gobook_url: string | null
          honesty_bar_enabled: boolean
          id: string
          league_fee_due_month: number
          league_member_annual_fee: number
          league_week_start_dow: number
          light_fee_per_hour: number | null
          lights_integration_enabled: boolean
          logo_url: string | null
          max_bookings_per_day: number
          max_member_events_per_month: number
          max_peak_bookings_per_day: number
          member_fee_annual: number | null
          member_fee_due_month: number | null
          member_number_length: number | null
          member_number_prefix: string | null
          member_number_start: number | null
          mixed_ladder_enabled: boolean
          name: string
          nsa_club_id: string | null
          participation_active: boolean
          payment_gateway: string | null
          payment_gateway_public_key: string | null
          peak_weekday_end: string
          peak_weekday_start: string
          peak_weekend_end: string
          peak_weekend_start: string
          phone: string | null
          roster_seeded_at: string | null
          secretary_member_id: string | null
          shelly_integration_enabled: boolean
          shelly_supply_mode: string | null
          sla_accepted_at: string | null
          sla_accepted_by: string | null
          sla_accepted_name: string | null
          sla_accepted_role: string | null
          sla_billing_option: string | null
          sla_version: string | null
          subdomain: string | null
          tenant_type: string
          updated_at: string
          uses_gobook: boolean
        }
        Insert: {
          address?: string | null
          auto_number_existing_onboarding?: boolean
          booking_slot_minutes?: number
          chairman_member_id?: string | null
          challenge_levels_up?: number | null
          club_captain_member_id?: string | null
          contact_person_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_disclaimer?: string | null
          email_signature_html?: string | null
          external_booking_label?: string | null
          external_booking_provider?: string | null
          external_booking_url?: string | null
          face_enrolment_required?: boolean
          fee_reminder_days_before?: number | null
          fill_top_down_enabled?: boolean
          fill_up_leagues_enabled?: boolean
          free_tier_until?: string | null
          gobook_url?: string | null
          honesty_bar_enabled?: boolean
          id?: string
          league_fee_due_month?: number
          league_member_annual_fee?: number
          league_week_start_dow?: number
          light_fee_per_hour?: number | null
          lights_integration_enabled?: boolean
          logo_url?: string | null
          max_bookings_per_day?: number
          max_member_events_per_month?: number
          max_peak_bookings_per_day?: number
          member_fee_annual?: number | null
          member_fee_due_month?: number | null
          member_number_length?: number | null
          member_number_prefix?: string | null
          member_number_start?: number | null
          mixed_ladder_enabled?: boolean
          name: string
          nsa_club_id?: string | null
          participation_active?: boolean
          payment_gateway?: string | null
          payment_gateway_public_key?: string | null
          peak_weekday_end?: string
          peak_weekday_start?: string
          peak_weekend_end?: string
          peak_weekend_start?: string
          phone?: string | null
          roster_seeded_at?: string | null
          secretary_member_id?: string | null
          shelly_integration_enabled?: boolean
          shelly_supply_mode?: string | null
          sla_accepted_at?: string | null
          sla_accepted_by?: string | null
          sla_accepted_name?: string | null
          sla_accepted_role?: string | null
          sla_billing_option?: string | null
          sla_version?: string | null
          subdomain?: string | null
          tenant_type?: string
          updated_at?: string
          uses_gobook?: boolean
        }
        Update: {
          address?: string | null
          auto_number_existing_onboarding?: boolean
          booking_slot_minutes?: number
          chairman_member_id?: string | null
          challenge_levels_up?: number | null
          club_captain_member_id?: string | null
          contact_person_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_disclaimer?: string | null
          email_signature_html?: string | null
          external_booking_label?: string | null
          external_booking_provider?: string | null
          external_booking_url?: string | null
          face_enrolment_required?: boolean
          fee_reminder_days_before?: number | null
          fill_top_down_enabled?: boolean
          fill_up_leagues_enabled?: boolean
          free_tier_until?: string | null
          gobook_url?: string | null
          honesty_bar_enabled?: boolean
          id?: string
          league_fee_due_month?: number
          league_member_annual_fee?: number
          league_week_start_dow?: number
          light_fee_per_hour?: number | null
          lights_integration_enabled?: boolean
          logo_url?: string | null
          max_bookings_per_day?: number
          max_member_events_per_month?: number
          max_peak_bookings_per_day?: number
          member_fee_annual?: number | null
          member_fee_due_month?: number | null
          member_number_length?: number | null
          member_number_prefix?: string | null
          member_number_start?: number | null
          mixed_ladder_enabled?: boolean
          name?: string
          nsa_club_id?: string | null
          participation_active?: boolean
          payment_gateway?: string | null
          payment_gateway_public_key?: string | null
          peak_weekday_end?: string
          peak_weekday_start?: string
          peak_weekend_end?: string
          peak_weekend_start?: string
          phone?: string | null
          roster_seeded_at?: string | null
          secretary_member_id?: string | null
          shelly_integration_enabled?: boolean
          shelly_supply_mode?: string | null
          sla_accepted_at?: string | null
          sla_accepted_by?: string | null
          sla_accepted_name?: string | null
          sla_accepted_role?: string | null
          sla_billing_option?: string | null
          sla_version?: string | null
          subdomain?: string | null
          tenant_type?: string
          updated_at?: string
          uses_gobook?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "clubs_chairman_member_id_fkey"
            columns: ["chairman_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_chairman_member_id_fkey"
            columns: ["chairman_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_club_captain_member_id_fkey"
            columns: ["club_captain_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_club_captain_member_id_fkey"
            columns: ["club_captain_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_secretary_member_id_fkey"
            columns: ["secretary_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_secretary_member_id_fkey"
            columns: ["secretary_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          club_id: string | null
          fluss_device_id: string | null
          id: number
          name: string
          relay_device_id: string | null
          relay_server: string | null
        }
        Insert: {
          club_id?: string | null
          fluss_device_id?: string | null
          id?: number
          name: string
          relay_device_id?: string | null
          relay_server?: string | null
        }
        Update: {
          club_id?: string | null
          fluss_device_id?: string | null
          id?: number
          name?: string
          relay_device_id?: string | null
          relay_server?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      fee_payments: {
        Row: {
          amount: number
          club_id: string | null
          created_at: string
          due_date: string | null
          fee_label: string
          fee_type: string
          id: string
          paid: boolean
          paid_at: string | null
          payment_method: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          club_id?: string | null
          created_at?: string
          due_date?: string | null
          fee_label?: string
          fee_type?: string
          id?: string
          paid?: boolean
          paid_at?: string | null
          payment_method?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          club_id?: string | null
          created_at?: string
          due_date?: string | null
          fee_label?: string
          fee_type?: string
          id?: string
          paid?: boolean
          paid_at?: string | null
          payment_method?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "member_credit_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_posts: {
        Row: {
          club_id: string | null
          content: string | null
          created_at: string
          id: string
          metadata: Json | null
          reference_id: string | null
          reference_type: string | null
          type: string
          user_id: string
        }
        Insert: {
          club_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          user_id: string
        }
        Update: {
          club_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      feed_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations_accounts: {
        Row: {
          connected_at: string
          display_name: string | null
          id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          provider_user_id: string | null
          scopes: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          display_name?: string | null
          id?: string
          provider: Database["public"]["Enums"]["integration_provider"]
          provider_user_id?: string | null
          scopes?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string
          display_name?: string | null
          id?: string
          provider?: Database["public"]["Enums"]["integration_provider"]
          provider_user_id?: string | null
          scopes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      integrations_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string | null
          id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          raw: Json | null
          refresh_token: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at?: string | null
          id?: string
          provider: Database["public"]["Enums"]["integration_provider"]
          raw?: Json | null
          refresh_token?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          provider?: Database["public"]["Enums"]["integration_provider"]
          raw?: Json | null
          refresh_token?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ladder_adjustment_log: {
        Row: {
          applied_at: string
          applied_by: string | null
          association_id: string | null
          batch_id: string
          club_id: string
          club_member_id: string
          fixture_id: string | null
          id: string
          new_position: number
          old_position: number | null
          reason: string
          round_id: string | null
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          association_id?: string | null
          batch_id: string
          club_id: string
          club_member_id: string
          fixture_id?: string | null
          id?: string
          new_position: number
          old_position?: number | null
          reason: string
          round_id?: string | null
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          association_id?: string | null
          batch_id?: string
          club_id?: string
          club_member_id?: string
          fixture_id?: string | null
          id?: string
          new_position?: number
          old_position?: number | null
          reason?: string
          round_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ladder_adjustment_log_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "association_member_affiliations_v"
            referencedColumns: ["league_association_id"]
          },
          {
            foreignKeyName: "ladder_adjustment_log_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "league_associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ladder_adjustment_log_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ladder_adjustment_log_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ladder_adjustment_log_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      league_associations: {
        Row: {
          abbreviation: string | null
          active: boolean
          affects_ladder: boolean
          club_id: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          due_day: number
          external_club_id: string | null
          external_source: string | null
          fee_annual: number | null
          fee_class: string
          fee_due_month: number | null
          fee_payable_to: string | null
          fee_payment_details: string | null
          id: string
          members_pay_directly: boolean
          name: string
          platform_association_id: string | null
          pro_rate: boolean
          scope: string
          tenant_association_id: string | null
          updated_at: string
          website: string | null
          week_start_dow: number | null
        }
        Insert: {
          abbreviation?: string | null
          active?: boolean
          affects_ladder?: boolean
          club_id: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          due_day?: number
          external_club_id?: string | null
          external_source?: string | null
          fee_annual?: number | null
          fee_class?: string
          fee_due_month?: number | null
          fee_payable_to?: string | null
          fee_payment_details?: string | null
          id?: string
          members_pay_directly?: boolean
          name: string
          platform_association_id?: string | null
          pro_rate?: boolean
          scope?: string
          tenant_association_id?: string | null
          updated_at?: string
          website?: string | null
          week_start_dow?: number | null
        }
        Update: {
          abbreviation?: string | null
          active?: boolean
          affects_ladder?: boolean
          club_id?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          due_day?: number
          external_club_id?: string | null
          external_source?: string | null
          fee_annual?: number | null
          fee_class?: string
          fee_due_month?: number | null
          fee_payable_to?: string | null
          fee_payment_details?: string | null
          id?: string
          members_pay_directly?: boolean
          name?: string
          platform_association_id?: string | null
          pro_rate?: boolean
          scope?: string
          tenant_association_id?: string | null
          updated_at?: string
          website?: string | null
          week_start_dow?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "league_associations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_associations_platform_association_id_fkey"
            columns: ["platform_association_id"]
            isOneToOne: false
            referencedRelation: "platform_league_associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_associations_tenant_association_id_fkey"
            columns: ["tenant_association_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      league_fixture_lineups: {
        Row: {
          assigned_by: string | null
          club_id: string
          club_member_id: string
          created_at: string
          fixture_id: string
          id: string
          league_id: string
          position: number
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          club_id: string
          club_member_id: string
          created_at?: string
          fixture_id: string
          id?: string
          league_id: string
          position: number
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          club_id?: string
          club_member_id?: string
          created_at?: string
          fixture_id?: string
          id?: string
          league_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_fixture_lineups_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fixture_lineups_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fixture_lineups_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fixture_lineups_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fixture_lineups_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fixture_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "platform_league_fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fixture_lineups_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_fixture_penalties: {
        Row: {
          club_id: string | null
          fixture_id: string
          id: string
          league_id: string | null
          nsa_team_id: number | null
          penalty_points: number
          reasons: Json
          scraped_at: string
          team_name: string | null
          team_side: string
        }
        Insert: {
          club_id?: string | null
          fixture_id: string
          id?: string
          league_id?: string | null
          nsa_team_id?: number | null
          penalty_points?: number
          reasons?: Json
          scraped_at?: string
          team_name?: string | null
          team_side: string
        }
        Update: {
          club_id?: string | null
          fixture_id?: string
          id?: string
          league_id?: string | null
          nsa_team_id?: number | null
          penalty_points?: number
          reasons?: Json
          scraped_at?: string
          team_name?: string | null
          team_side?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_fixture_penalties_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fixture_penalties_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_fixture_results: {
        Row: {
          away_bonus_points: number
          away_captain_signature: string | null
          away_penalty_points: number
          away_total_games: number
          away_total_points: number
          created_at: string
          fixture_id: string
          home_bonus_points: number
          home_captain_signature: string | null
          home_penalty_points: number
          home_total_games: number
          home_total_points: number
          id: string
          match_format: Json | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          winner: string | null
        }
        Insert: {
          away_bonus_points?: number
          away_captain_signature?: string | null
          away_penalty_points?: number
          away_total_games?: number
          away_total_points?: number
          created_at?: string
          fixture_id: string
          home_bonus_points?: number
          home_captain_signature?: string | null
          home_penalty_points?: number
          home_total_games?: number
          home_total_points?: number
          id?: string
          match_format?: Json | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          winner?: string | null
        }
        Update: {
          away_bonus_points?: number
          away_captain_signature?: string | null
          away_penalty_points?: number
          away_total_games?: number
          away_total_points?: number
          created_at?: string
          fixture_id?: string
          home_bonus_points?: number
          home_captain_signature?: string | null
          home_penalty_points?: number
          home_total_games?: number
          home_total_points?: number
          id?: string
          match_format?: Json | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_fixture_results_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: true
            referencedRelation: "platform_league_fixtures"
            referencedColumns: ["id"]
          },
        ]
      }
      league_marker_locks: {
        Row: {
          acquired_at: string
          fixture_id: string
          heartbeat_at: string
          id: string
          position: number
          user_id: string
          user_name: string
        }
        Insert: {
          acquired_at?: string
          fixture_id: string
          heartbeat_at?: string
          id?: string
          position: number
          user_id: string
          user_name: string
        }
        Update: {
          acquired_at?: string
          fixture_id?: string
          heartbeat_at?: string
          id?: string
          position?: number
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      league_match_results: {
        Row: {
          away_games_won: number
          away_player_code: string | null
          away_player_name: string | null
          created_at: string
          current_game: Json | null
          fixture_id: string
          forfeit_side: string | null
          game_scores: Json | null
          home_games_won: number
          home_player_code: string | null
          home_player_name: string | null
          id: string
          is_forfeit: boolean
          position: number
          updated_at: string
          winner: string | null
        }
        Insert: {
          away_games_won?: number
          away_player_code?: string | null
          away_player_name?: string | null
          created_at?: string
          current_game?: Json | null
          fixture_id: string
          forfeit_side?: string | null
          game_scores?: Json | null
          home_games_won?: number
          home_player_code?: string | null
          home_player_name?: string | null
          id?: string
          is_forfeit?: boolean
          position: number
          updated_at?: string
          winner?: string | null
        }
        Update: {
          away_games_won?: number
          away_player_code?: string | null
          away_player_name?: string | null
          created_at?: string
          current_game?: Json | null
          fixture_id?: string
          forfeit_side?: string | null
          game_scores?: Json | null
          home_games_won?: number
          home_player_code?: string | null
          home_player_name?: string | null
          id?: string
          is_forfeit?: boolean
          position?: number
          updated_at?: string
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_match_results_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "platform_league_fixtures"
            referencedColumns: ["id"]
          },
        ]
      }
      league_rounds: {
        Row: {
          association_id: string
          auto_create_bookings: boolean
          club_id: string
          court_ids: number[]
          created_at: string
          created_by: string | null
          end_date: string | null
          end_time: string
          id: string
          name: string
          notes: string | null
          play_dows: number[]
          round_date: string
          round_number: number
          slot_minutes: number
          start_time: string
          status: string
          updated_at: string
          venue_name: string
        }
        Insert: {
          association_id: string
          auto_create_bookings?: boolean
          club_id: string
          court_ids?: number[]
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          end_time?: string
          id?: string
          name: string
          notes?: string | null
          play_dows?: number[]
          round_date: string
          round_number: number
          slot_minutes?: number
          start_time?: string
          status?: string
          updated_at?: string
          venue_name?: string
        }
        Update: {
          association_id?: string
          auto_create_bookings?: boolean
          club_id?: string
          court_ids?: number[]
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          end_time?: string
          id?: string
          name?: string
          notes?: string | null
          play_dows?: number[]
          round_date?: string
          round_number?: number
          slot_minutes?: number
          start_time?: string
          status?: string
          updated_at?: string
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_rounds_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "association_member_affiliations_v"
            referencedColumns: ["league_association_id"]
          },
          {
            foreignKeyName: "league_rounds_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "league_associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_rounds_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      league_rules: {
        Row: {
          allow_multi_team_registration: boolean
          association_id: string | null
          bonus_points_mode: string
          bonus_points_value: number
          club_id: string | null
          created_at: string
          cross_gender_subs_allowed: boolean
          enforce_sub_rules: boolean
          fill_up_leagues_enabled: boolean
          forfeit_allowed: boolean
          games_format: string
          id: string
          league_id: string | null
          let_stroke_enabled: boolean
          marker_must_be_qualified: boolean
          marker_required: boolean
          max_position_movement_per_week: number | null
          max_timeouts_per_player: number
          notes: string | null
          original_player_bonus_enabled: boolean
          original_player_bonus_value: number
          points_per_game: number | null
          share_bonus_on_tie: boolean
          sub_direction: string
          team_size: number
          team_size_mode: string
          team_win_bonus_enabled: boolean
          team_win_bonus_value: number
          tiebreak_at: number | null
          tiebreak_method: string
          updated_at: string
          win_by: number
        }
        Insert: {
          allow_multi_team_registration?: boolean
          association_id?: string | null
          bonus_points_mode?: string
          bonus_points_value?: number
          club_id?: string | null
          created_at?: string
          cross_gender_subs_allowed?: boolean
          enforce_sub_rules?: boolean
          fill_up_leagues_enabled?: boolean
          forfeit_allowed?: boolean
          games_format?: string
          id?: string
          league_id?: string | null
          let_stroke_enabled?: boolean
          marker_must_be_qualified?: boolean
          marker_required?: boolean
          max_position_movement_per_week?: number | null
          max_timeouts_per_player?: number
          notes?: string | null
          original_player_bonus_enabled?: boolean
          original_player_bonus_value?: number
          points_per_game?: number | null
          share_bonus_on_tie?: boolean
          sub_direction?: string
          team_size?: number
          team_size_mode?: string
          team_win_bonus_enabled?: boolean
          team_win_bonus_value?: number
          tiebreak_at?: number | null
          tiebreak_method?: string
          updated_at?: string
          win_by?: number
        }
        Update: {
          allow_multi_team_registration?: boolean
          association_id?: string | null
          bonus_points_mode?: string
          bonus_points_value?: number
          club_id?: string | null
          created_at?: string
          cross_gender_subs_allowed?: boolean
          enforce_sub_rules?: boolean
          fill_up_leagues_enabled?: boolean
          forfeit_allowed?: boolean
          games_format?: string
          id?: string
          league_id?: string | null
          let_stroke_enabled?: boolean
          marker_must_be_qualified?: boolean
          marker_required?: boolean
          max_position_movement_per_week?: number | null
          max_timeouts_per_player?: number
          notes?: string | null
          original_player_bonus_enabled?: boolean
          original_player_bonus_value?: number
          points_per_game?: number | null
          share_bonus_on_tie?: boolean
          sub_direction?: string
          team_size?: number
          team_size_mode?: string
          team_win_bonus_enabled?: boolean
          team_win_bonus_value?: number
          tiebreak_at?: number | null
          tiebreak_method?: string
          updated_at?: string
          win_by?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_rules_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "platform_league_associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_rules_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_rules_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_week_availability: {
        Row: {
          club_id: string
          club_member_id: string
          created_at: string
          id: string
          marked_by: string | null
          week_start_date: string
        }
        Insert: {
          club_id: string
          club_member_id: string
          created_at?: string
          id?: string
          marked_by?: string | null
          week_start_date: string
        }
        Update: {
          club_id?: string
          club_member_id?: string
          created_at?: string
          id?: string
          marked_by?: string | null
          week_start_date?: string
        }
        Relationships: []
      }
      league_week_lineups: {
        Row: {
          club_id: string
          club_member_id: string
          created_at: string
          created_by: string | null
          guest_from_league_id: string | null
          id: string
          is_guest: boolean
          league_id: string
          position: number
          updated_at: string
          week_start_date: string
        }
        Insert: {
          club_id: string
          club_member_id: string
          created_at?: string
          created_by?: string | null
          guest_from_league_id?: string | null
          id?: string
          is_guest?: boolean
          league_id: string
          position: number
          updated_at?: string
          week_start_date: string
        }
        Update: {
          club_id?: string
          club_member_id?: string
          created_at?: string
          created_by?: string | null
          guest_from_league_id?: string | null
          id?: string
          is_guest?: boolean
          league_id?: string
          position?: number
          updated_at?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_week_lineups_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_week_lineups_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_week_lineups_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      league_week_player_status: {
        Row: {
          cascaded_from_league_id: string | null
          club_id: string
          club_member_id: string
          created_at: string
          id: string
          league_id: string
          notes: string | null
          status: string
          updated_at: string
          updated_by: string | null
          week_start_date: string
        }
        Insert: {
          cascaded_from_league_id?: string | null
          club_id: string
          club_member_id: string
          created_at?: string
          id?: string
          league_id: string
          notes?: string | null
          status: string
          updated_at?: string
          updated_by?: string | null
          week_start_date: string
        }
        Update: {
          cascaded_from_league_id?: string | null
          club_id?: string
          club_member_id?: string
          created_at?: string
          id?: string
          league_id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_week_player_status_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_week_player_status_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_week_player_status_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      league_week_unavailability: {
        Row: {
          club_id: string
          club_member_id: string
          created_at: string
          id: string
          marked_by: string | null
          week_start_date: string
        }
        Insert: {
          club_id: string
          club_member_id: string
          created_at?: string
          id?: string
          marked_by?: string | null
          week_start_date: string
        }
        Update: {
          club_id?: string
          club_member_id?: string
          created_at?: string
          id?: string
          marked_by?: string | null
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_week_unavailability_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_week_unavailability_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_week_unavailability_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          allow_cross_gender_guests: boolean
          association_id: string | null
          captain_member_id: string | null
          club_id: string
          code: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          nsa_team_code: string | null
          nsa_team_id: string | null
          reserves_per_team: number
          updated_at: string
        }
        Insert: {
          allow_cross_gender_guests?: boolean
          association_id?: string | null
          captain_member_id?: string | null
          club_id: string
          code?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          nsa_team_code?: string | null
          nsa_team_id?: string | null
          reserves_per_team?: number
          updated_at?: string
        }
        Update: {
          allow_cross_gender_guests?: boolean
          association_id?: string | null
          captain_member_id?: string | null
          club_id?: string
          code?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          nsa_team_code?: string | null
          nsa_team_id?: string | null
          reserves_per_team?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "association_member_affiliations_v"
            referencedColumns: ["league_association_id"]
          },
          {
            foreignKeyName: "leagues_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "league_associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      light_sessions: {
        Row: {
          booking_id: string
          club_id: string
          court_id: number
          created_at: string
          duration_minutes: number | null
          ended_at: string | null
          fee_charged: number | null
          fee_per_hour: number | null
          id: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          booking_id: string
          club_id: string
          court_id: number
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          fee_charged?: number | null
          fee_per_hour?: number | null
          id?: string
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          club_id?: string
          court_id?: number
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          fee_charged?: number | null
          fee_per_hour?: number | null
          id?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "light_sessions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "light_sessions_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      live_marker_sessions: {
        Row: {
          club_id: string | null
          court_number: string | null
          created_at: string
          expires_at: string
          id: string
          marker_user_id: string | null
          pair_code: string
          paired_at: string | null
          state: Json
          updated_at: string
        }
        Insert: {
          club_id?: string | null
          court_number?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          marker_user_id?: string | null
          pair_code: string
          paired_at?: string | null
          state?: Json
          updated_at?: string
        }
        Update: {
          club_id?: string | null
          court_number?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          marker_user_id?: string | null
          pair_code?: string
          paired_at?: string | null
          state?: Json
          updated_at?: string
        }
        Relationships: []
      }
      match_disputes: {
        Row: {
          created_at: string
          id: string
          match_id: string
          raised_by: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          raised_by: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          raised_by?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_disputes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          challenge_id: string | null
          club_id: string | null
          confirmed: boolean
          court_id: number | null
          created_at: string
          disputed: boolean
          duration_s: number | null
          game_scores: string | null
          id: string
          match_date: string
          notes: string | null
          player_a: string | null
          player_a_member_id: string | null
          player_b: string | null
          player_b_member_id: string | null
          score: string | null
          submitted_by: string | null
          submitted_by_member_id: string | null
          winner_id: string | null
          winner_member_id: string | null
        }
        Insert: {
          challenge_id?: string | null
          club_id?: string | null
          confirmed?: boolean
          court_id?: number | null
          created_at?: string
          disputed?: boolean
          duration_s?: number | null
          game_scores?: string | null
          id?: string
          match_date?: string
          notes?: string | null
          player_a?: string | null
          player_a_member_id?: string | null
          player_b?: string | null
          player_b_member_id?: string | null
          score?: string | null
          submitted_by?: string | null
          submitted_by_member_id?: string | null
          winner_id?: string | null
          winner_member_id?: string | null
        }
        Update: {
          challenge_id?: string | null
          club_id?: string | null
          confirmed?: boolean
          court_id?: number | null
          created_at?: string
          disputed?: boolean
          duration_s?: number | null
          game_scores?: string | null
          id?: string
          match_date?: string
          notes?: string | null
          player_a?: string | null
          player_a_member_id?: string | null
          player_b?: string | null
          player_b_member_id?: string | null
          score?: string | null
          submitted_by?: string | null
          submitted_by_member_id?: string | null
          winner_id?: string | null
          winner_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_player_a_member_id_fkey"
            columns: ["player_a_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_player_a_member_id_fkey"
            columns: ["player_a_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_player_b_member_id_fkey"
            columns: ["player_b_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_player_b_member_id_fkey"
            columns: ["player_b_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_submitted_by_member_id_fkey"
            columns: ["submitted_by_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_submitted_by_member_id_fkey"
            columns: ["submitted_by_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_member_id_fkey"
            columns: ["winner_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_member_id_fkey"
            columns: ["winner_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_association_affiliations: {
        Row: {
          active: boolean
          association_id: string
          club_member_id: string
          created_at: string
          deactivated_at: string | null
          id: string
          joined_at: string
          league_association_number: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          association_id: string
          club_member_id: string
          created_at?: string
          deactivated_at?: string | null
          id?: string
          joined_at?: string
          league_association_number?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          association_id?: string
          club_member_id?: string
          created_at?: string
          deactivated_at?: string | null
          id?: string
          joined_at?: string
          league_association_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_association_affiliations_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "association_member_affiliations_v"
            referencedColumns: ["league_association_id"]
          },
          {
            foreignKeyName: "member_association_affiliations_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "league_associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_association_affiliations_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_association_affiliations_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_credit_transactions: {
        Row: {
          amount: number
          club_id: string
          club_member_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          description: string | null
          id: string
          method: string | null
          proof_url: string | null
          reference: string | null
          status: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          club_id: string
          club_member_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          method?: string | null
          proof_url?: string | null
          reference?: string | null
          status?: string
          type?: string
          user_id: string
        }
        Update: {
          amount?: number
          club_id?: string
          club_member_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          method?: string | null
          proof_url?: string | null
          reference?: string | null
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_credit_transactions_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_credit_transactions_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_fee_categories: {
        Row: {
          active: boolean
          annual_fee: number
          club_id: string
          created_at: string
          description: string | null
          due_day: number
          due_month: number
          fee_class: string
          id: string
          name: string
          pro_rate: boolean
          show_on_landing: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          annual_fee?: number
          club_id: string
          created_at?: string
          description?: string | null
          due_day?: number
          due_month?: number
          fee_class?: string
          id?: string
          name: string
          pro_rate?: boolean
          show_on_landing?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          annual_fee?: number
          club_id?: string
          created_at?: string
          description?: string | null
          due_day?: number
          due_month?: number
          fee_class?: string
          id?: string
          name?: string
          pro_rate?: boolean
          show_on_landing?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_fee_categories_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      member_gobook_credentials: {
        Row: {
          club_member_id: string
          court_manager_membership_number: string | null
          created_at: string
          gobook_password_ciphertext: string
          gobook_password_iv: string
          gobook_pin: string | null
          gobook_username: string
          id: string
          is_sync_source: boolean
          last_verification_status: string | null
          last_verified_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          club_member_id: string
          court_manager_membership_number?: string | null
          created_at?: string
          gobook_password_ciphertext: string
          gobook_password_iv: string
          gobook_pin?: string | null
          gobook_username: string
          id?: string
          is_sync_source?: boolean
          last_verification_status?: string | null
          last_verified_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          club_member_id?: string
          court_manager_membership_number?: string | null
          created_at?: string
          gobook_password_ciphertext?: string
          gobook_password_iv?: string
          gobook_pin?: string | null
          gobook_username?: string
          id?: string
          is_sync_source?: boolean
          last_verification_status?: string | null
          last_verified_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_gobook_credentials_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: true
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_gobook_credentials_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: true
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_league_registrations: {
        Row: {
          club_member_id: string
          created_at: string
          id: string
          is_captain: boolean
          is_reserve: boolean
          league_association_number: string | null
          league_id: string | null
          player_rank: number | null
          reserve_order: number | null
          ssa_number: string | null
          updated_at: string
        }
        Insert: {
          club_member_id: string
          created_at?: string
          id?: string
          is_captain?: boolean
          is_reserve?: boolean
          league_association_number?: string | null
          league_id?: string | null
          player_rank?: number | null
          reserve_order?: number | null
          ssa_number?: string | null
          updated_at?: string
        }
        Update: {
          club_member_id?: string
          created_at?: string
          id?: string
          is_captain?: boolean
          is_reserve?: boolean
          league_association_number?: string | null
          league_id?: string | null
          player_rank?: number | null
          reserve_order?: number | null
          ssa_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_league_registrations_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_league_registrations_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_league_registrations_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      member_league_registrations_audit: {
        Row: {
          action: string
          actor_user_id: string | null
          changed_at: string
          club_id: string | null
          club_member_id: string | null
          id: string
          league_id: string | null
          new_is_captain: boolean | null
          new_is_reserve: boolean | null
          new_league_association_number: string | null
          new_player_rank: number | null
          old_is_captain: boolean | null
          old_is_reserve: boolean | null
          old_league_association_number: string | null
          old_player_rank: number | null
          registration_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          changed_at?: string
          club_id?: string | null
          club_member_id?: string | null
          id?: string
          league_id?: string | null
          new_is_captain?: boolean | null
          new_is_reserve?: boolean | null
          new_league_association_number?: string | null
          new_player_rank?: number | null
          old_is_captain?: boolean | null
          old_is_reserve?: boolean | null
          old_league_association_number?: string | null
          old_player_rank?: number | null
          registration_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          changed_at?: string
          club_id?: string | null
          club_member_id?: string | null
          id?: string
          league_id?: string | null
          new_is_captain?: boolean | null
          new_is_reserve?: boolean | null
          new_league_association_number?: string | null
          new_player_rank?: number | null
          old_is_captain?: boolean | null
          old_is_reserve?: boolean | null
          old_league_association_number?: string | null
          old_player_rank?: number | null
          registration_id?: string | null
        }
        Relationships: []
      }
      member_nsa_credentials: {
        Row: {
          club_member_id: string
          created_at: string
          id: string
          last_verification_status: string | null
          last_verified_at: string | null
          nsa_password_ciphertext: string
          nsa_password_iv: string
          nsa_username: string
          updated_at: string
          user_id: string
        }
        Insert: {
          club_member_id: string
          created_at?: string
          id?: string
          last_verification_status?: string | null
          last_verified_at?: string | null
          nsa_password_ciphertext: string
          nsa_password_iv: string
          nsa_username: string
          updated_at?: string
          user_id: string
        }
        Update: {
          club_member_id?: string
          created_at?: string
          id?: string
          last_verification_status?: string | null
          last_verified_at?: string | null
          nsa_password_ciphertext?: string
          nsa_password_iv?: string
          nsa_username?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_nsa_credentials_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: true
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_nsa_credentials_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: true
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      national_body_fees: {
        Row: {
          abbreviation: string | null
          active: boolean
          body_name: string
          club_id: string
          created_at: string
          due_day: number
          fee_annual: number | null
          fee_class: string
          fee_due_month: number | null
          fee_payable_to: string | null
          fee_payment_details: string | null
          fee_type: string
          id: string
          pro_rate: boolean
          updated_at: string
        }
        Insert: {
          abbreviation?: string | null
          active?: boolean
          body_name?: string
          club_id: string
          created_at?: string
          due_day?: number
          fee_annual?: number | null
          fee_class?: string
          fee_due_month?: number | null
          fee_payable_to?: string | null
          fee_payment_details?: string | null
          fee_type?: string
          id?: string
          pro_rate?: boolean
          updated_at?: string
        }
        Update: {
          abbreviation?: string | null
          active?: boolean
          body_name?: string
          club_id?: string
          created_at?: string
          due_day?: number
          fee_annual?: number | null
          fee_class?: string
          fee_due_month?: number | null
          fee_payable_to?: string | null
          fee_payment_details?: string | null
          fee_type?: string
          id?: string
          pro_rate?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "national_body_fees_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          club_member_id: string | null
          created_at: string
          data: Json | null
          id: string
          message: string
          read: boolean
          title: string
          type: string
          url: string | null
          user_id: string | null
        }
        Insert: {
          club_member_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          message: string
          read?: boolean
          title: string
          type?: string
          url?: string | null
          user_id?: string | null
        }
        Update: {
          club_member_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      nsa_rubber_history: {
        Row: {
          category: string | null
          created_at: string
          fixture_date: string
          games_against: number | null
          games_for: number | null
          id: string
          is_home: boolean
          league_label: string | null
          nsa_fixture_id: number
          nsa_league_id: number | null
          player_code: string
          player_name: string | null
          points_against: number | null
          points_for: number | null
          position: number
          round: number | null
          rubbers_against: number | null
          rubbers_for: number | null
          scraped_at: string
          team_code: string
          won: boolean | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          fixture_date: string
          games_against?: number | null
          games_for?: number | null
          id?: string
          is_home: boolean
          league_label?: string | null
          nsa_fixture_id: number
          nsa_league_id?: number | null
          player_code: string
          player_name?: string | null
          points_against?: number | null
          points_for?: number | null
          position: number
          round?: number | null
          rubbers_against?: number | null
          rubbers_for?: number | null
          scraped_at?: string
          team_code: string
          won?: boolean | null
        }
        Update: {
          category?: string | null
          created_at?: string
          fixture_date?: string
          games_against?: number | null
          games_for?: number | null
          id?: string
          is_home?: boolean
          league_label?: string | null
          nsa_fixture_id?: number
          nsa_league_id?: number | null
          player_code?: string
          player_name?: string | null
          points_against?: number | null
          points_for?: number | null
          position?: number
          round?: number | null
          rubbers_against?: number | null
          rubbers_for?: number | null
          scraped_at?: string
          team_code?: string
          won?: boolean | null
        }
        Relationships: []
      }
      platform_league_associations: {
        Row: {
          created_at: string
          external_season: string | null
          external_source: string | null
          id: string
          last_fixtures_sync_at: string | null
          last_fixtures_sync_summary: string | null
          last_members_sync_at: string | null
          last_members_sync_summary: string | null
          name: string
          region: string
          season_year: number
          short_code: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_season?: string | null
          external_source?: string | null
          id?: string
          last_fixtures_sync_at?: string | null
          last_fixtures_sync_summary?: string | null
          last_members_sync_at?: string | null
          last_members_sync_summary?: string | null
          name: string
          region?: string
          season_year?: number
          short_code: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_season?: string | null
          external_source?: string | null
          id?: string
          last_fixtures_sync_at?: string | null
          last_fixtures_sync_summary?: string | null
          last_members_sync_at?: string | null
          last_members_sync_summary?: string | null
          name?: string
          region?: string
          season_year?: number
          short_code?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_league_fixtures: {
        Row: {
          association_id: string
          away_team_code: string
          booking_id: string | null
          court_id: number | null
          created_at: string
          division: string
          end_time: string | null
          external_id: string | null
          fixture_date: string
          game_scores: string | null
          home_team_code: string
          id: string
          notes: string | null
          nsa_fixture_id: number | null
          nsa_submission_notes: string | null
          nsa_submitted_at: string | null
          nsa_submitted_by: string | null
          round_id: string | null
          score: string | null
          start_time: string | null
          status: string
          updated_at: string
          venue_name: string
          winner_team_code: string | null
        }
        Insert: {
          association_id: string
          away_team_code: string
          booking_id?: string | null
          court_id?: number | null
          created_at?: string
          division: string
          end_time?: string | null
          external_id?: string | null
          fixture_date: string
          game_scores?: string | null
          home_team_code: string
          id?: string
          notes?: string | null
          nsa_fixture_id?: number | null
          nsa_submission_notes?: string | null
          nsa_submitted_at?: string | null
          nsa_submitted_by?: string | null
          round_id?: string | null
          score?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
          venue_name: string
          winner_team_code?: string | null
        }
        Update: {
          association_id?: string
          away_team_code?: string
          booking_id?: string | null
          court_id?: number | null
          created_at?: string
          division?: string
          end_time?: string | null
          external_id?: string | null
          fixture_date?: string
          game_scores?: string | null
          home_team_code?: string
          id?: string
          notes?: string | null
          nsa_fixture_id?: number | null
          nsa_submission_notes?: string | null
          nsa_submitted_at?: string | null
          nsa_submitted_by?: string | null
          round_id?: string | null
          score?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
          venue_name?: string
          winner_team_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_league_fixtures_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "platform_league_associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_league_fixtures_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_league_fixtures_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_league_fixtures_nsa_submitted_by_fkey"
            columns: ["nsa_submitted_by"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_league_fixtures_nsa_submitted_by_fkey"
            columns: ["nsa_submitted_by"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_league_fixtures_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "league_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_league_members: {
        Row: {
          affiliation: string
          association_id: string
          club_name: string
          created_at: string
          first_name: string
          id: string
          league_matches: number | null
          qualifications: string | null
          surname: string
          updated_at: string
          user_code: string
          user_state: string
        }
        Insert: {
          affiliation?: string
          association_id: string
          club_name?: string
          created_at?: string
          first_name: string
          id?: string
          league_matches?: number | null
          qualifications?: string | null
          surname: string
          updated_at?: string
          user_code: string
          user_state?: string
        }
        Update: {
          affiliation?: string
          association_id?: string
          club_name?: string
          created_at?: string
          first_name?: string
          id?: string
          league_matches?: number | null
          qualifications?: string | null
          surname?: string
          updated_at?: string
          user_code?: string
          user_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_league_members_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "platform_league_associations"
            referencedColumns: ["id"]
          },
        ]
      }
      player_availability: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          start_time: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          losses: number
          matches_played: number
          name: string
          phone: string | null
          rank: number | null
          updated_at: string
          wins: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          losses?: number
          matches_played?: number
          name?: string
          phone?: string | null
          rank?: number | null
          updated_at?: string
          wins?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          losses?: number
          matches_played?: number
          name?: string
          phone?: string | null
          rank?: number | null
          updated_at?: string
          wins?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_bookings: {
        Row: {
          active: boolean
          club_id: string | null
          court_id: number
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          start_time: string
          user_id: string
        }
        Insert: {
          active?: boolean
          club_id?: string | null
          court_id: number
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
          user_id: string
        }
        Update: {
          active?: boolean
          club_id?: string | null
          court_id?: number
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_bookings_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      season_awards: {
        Row: {
          award_label: string
          award_type: string
          created_at: string
          id: string
          season_id: string
          stat_value: string | null
          user_id: string
        }
        Insert: {
          award_label?: string
          award_type: string
          created_at?: string
          id?: string
          season_id: string
          stat_value?: string | null
          user_id: string
        }
        Update: {
          award_label?: string
          award_type?: string
          created_at?: string
          id?: string
          season_id?: string
          stat_value?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          end_date: string
          id: string
          name: string
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          name: string
          start_date: string
          status?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          status?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          active: boolean
          billing_cycle: string
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          minimum_charge: number
          name: string
          price_per_member: number
          trial_days: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_cycle?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          minimum_charge?: number
          name: string
          price_per_member?: number
          trial_days?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_cycle?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          minimum_charge?: number
          name?: string
          price_per_member?: number
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          attachments: Json
          body: string
          created_at: string
          id: string
          sender_id: string
          thread_id: string
        }
        Insert: {
          attachments?: Json
          body: string
          created_at?: string
          id?: string
          sender_id: string
          thread_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_threads: {
        Row: {
          assigned_to: string | null
          created_at: string
          id: string
          last_message_at: string | null
          last_message_by: string | null
          last_message_preview: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_by?: string | null
          last_message_preview?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_by?: string | null
          last_message_preview?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badge_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_streaks: {
        Row: {
          best_play_streak: number
          best_win_streak: number
          current_play_streak: number
          current_win_streak: number
          id: string
          last_match_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          best_play_streak?: number
          best_win_streak?: number
          current_play_streak?: number
          current_win_streak?: number
          id?: string
          last_match_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          best_play_streak?: number
          best_win_streak?: number
          current_play_streak?: number
          current_win_streak?: number
          id?: string
          last_match_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      xp_events: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string
          reference_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason: string
          reference_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      yoco_payment_sessions: {
        Row: {
          amount: number
          bar_tab_entry_ids: string[]
          champ_registration_id: string | null
          club_id: string
          club_member_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          fee_ids: string[]
          id: string
          purpose: string
          status: string
          updated_at: string
          user_id: string | null
          yoco_checkout_id: string | null
          yoco_redirect_url: string | null
        }
        Insert: {
          amount: number
          bar_tab_entry_ids?: string[]
          champ_registration_id?: string | null
          club_id: string
          club_member_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          fee_ids?: string[]
          id?: string
          purpose: string
          status?: string
          updated_at?: string
          user_id?: string | null
          yoco_checkout_id?: string | null
          yoco_redirect_url?: string | null
        }
        Update: {
          amount?: number
          bar_tab_entry_ids?: string[]
          champ_registration_id?: string | null
          club_id?: string
          club_member_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          fee_ids?: string[]
          id?: string
          purpose?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          yoco_checkout_id?: string | null
          yoco_redirect_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yoco_payment_sessions_champ_registration_id_fkey"
            columns: ["champ_registration_id"]
            isOneToOne: false
            referencedRelation: "club_champs_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yoco_payment_sessions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      association_member_affiliations_v: {
        Row: {
          active: boolean | null
          affiliation_id: string | null
          association_tenant_id: string | null
          club_id: string | null
          club_member_id: string | null
          club_name: string | null
          club_subdomain: string | null
          gender: string | null
          joined_at: string | null
          league_association_id: string | null
          league_association_number: string | null
          league_fee_annual: number | null
          league_name: string | null
          member_email: string | null
          member_name: string | null
          members_pay_directly: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_associations_tenant_association_id_fkey"
            columns: ["association_tenant_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_association_affiliations_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_delegates_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_association_affiliations_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      club_delegates_public: {
        Row: {
          club_id: string | null
          id: string | null
          name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _match_rollups_for_member: {
        Args: { target_member_id: string }
        Returns: {
          created_at: string
          duration_s: number
          game_scores: string
          is_player_a: boolean
          is_win: boolean
          match_date: string
          match_id: string
          opponent_id: string
          points_against: number
          points_for: number
          score: string
          sets_against: number
          sets_for: number
        }[]
      }
      accept_tournament_invite: {
        Args: { p_accept: boolean; p_registration_id: string }
        Returns: Json
      }
      admin_list_unclaimed_club_members: {
        Args: { _club_id: string }
        Returns: {
          club_subdomain: string
          email: string
          full_name: string
          league_name: string
          member_id: string
          nsa_number: string
          phone: string
        }[]
      }
      admin_reorder_ladder: {
        Args: { gender_filter: string; player_ids: string[] }
        Returns: undefined
      }
      apply_ladder_adjustments: {
        Args: {
          _adjustments: Json
          _association_id: string
          _club_id: string
          _fixture_id: string
          _summary?: string
        }
        Returns: string
      }
      assign_role_to_member: {
        Args: { _club_id: string; _member_id: string; _role_name: string }
        Returns: undefined
      }
      can_mark_bells_match: {
        Args: { _match_id: string; _user_id: string }
        Returns: boolean
      }
      captain_list_unclaimed_teammates: {
        Args: { _club_member_id: string }
        Returns: {
          club_subdomain: string
          email: string
          full_name: string
          league_name: string
          member_id: string
          nsa_number: string
          phone: string
        }[]
      }
      claim_member_by_league_number: {
        Args: {
          _club_id?: string
          _club_member_id: string
          _club_member_number?: string
          _email: string
          _league_number: string
          _phone?: string
        }
        Returns: string
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_platform_association_for_league: {
        Args: { _association_id: string }
        Returns: string
      }
      get_champ_host: {
        Args: { _champ_id: string }
        Returns: {
          club_name: string
          subdomain: string
        }[]
      }
      get_club_analytics:
        | { Args: { days_back?: number }; Returns: Json }
        | { Args: { days_back?: number; p_club_id?: string }; Returns: Json }
      get_club_bank_details: {
        Args: { _club_id: string }
        Returns: {
          bank_account_name: string
          bank_account_number: string
          bank_branch_code: string
          bank_name: string
          bank_reference: string
        }[]
      }
      get_club_member_count: { Args: { _club_id: string }; Returns: number }
      get_clubs_with_admins: {
        Args: never
        Returns: {
          club_id: string
        }[]
      }
      get_head_to_head: {
        Args: { limit_count?: number; target_user_id: string }
        Returns: {
          avg_duration_min: number
          last_match_date: string
          losses: number
          matches: number
          opponent_id: string
          opponent_name: string
          points_against: number
          points_for: number
          sets_against: number
          sets_for: number
          win_rate: number
          wins: number
        }[]
      }
      get_head_to_head_by_member: {
        Args: { limit_count?: number; target_member_id: string }
        Returns: {
          avg_duration_min: number
          last_match_date: string
          losses: number
          matches: number
          opponent_id: string
          opponent_name: string
          points_against: number
          points_for: number
          sets_against: number
          sets_for: number
          win_rate: number
          wins: number
        }[]
      }
      get_match_of_the_week:
        | {
            Args: never
            Returns: {
              closeness_score: number
              game_scores: string
              match_date: string
              match_id: string
              player_a: string
              player_a_member_id: string
              player_a_name: string
              player_b: string
              player_b_member_id: string
              player_b_name: string
              score: string
              winner_id: string
              winner_member_id: string
            }[]
          }
        | {
            Args: { p_club_id?: string }
            Returns: {
              closeness_score: number
              game_scores: string
              match_date: string
              match_id: string
              player_a: string
              player_a_member_id: string
              player_a_name: string
              player_b: string
              player_b_member_id: string
              player_b_name: string
              score: string
              winner_id: string
              winner_member_id: string
            }[]
          }
      get_next_member_number: { Args: { _club_id: string }; Returns: string }
      get_personal_analytics:
        | {
            Args: { days_back?: number; target_user_id: string }
            Returns: Json
          }
        | {
            Args: {
              days_back?: number
              p_club_id?: string
              target_user_id: string
            }
            Returns: Json
          }
      get_squash_totals: { Args: { target_user_id: string }; Returns: Json }
      get_squash_totals_by_member: {
        Args: { target_member_id: string }
        Returns: Json
      }
      get_team_captain_codes: {
        Args: { _team_codes: string[] }
        Returns: {
          captain_code: string
          team_code: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_bells_participant_member: {
        Args: { _member_id: string }
        Returns: boolean
      }
      is_club_admin: {
        Args: { _club_id: string; _user_id: string }
        Returns: boolean
      }
      is_club_admin_or_permitted: {
        Args: { _club_id: string; _permission: string; _user_id: string }
        Returns: boolean
      }
      is_club_league_player: {
        Args: { _club_id: string; _user_id: string }
        Returns: boolean
      }
      is_club_mate: {
        Args: { _other_user_id: string; _user_id: string }
        Returns: boolean
      }
      is_club_member: {
        Args: { _club_id: string; _user_id: string }
        Returns: boolean
      }
      is_league_captain: {
        Args: { _league_id: string; _user_id: string }
        Returns: boolean
      }
      is_member_owner: { Args: { _member_id: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      lookup_existing_member_for_signup: {
        Args: {
          _club_id: string
          _email: string
          _number?: string
          _phone?: string
        }
        Returns: {
          has_number: boolean
          has_phone: boolean
          id: string
          masked_name: string
        }[]
      }
      lookup_league_player_by_nsa: {
        Args: { _club_subdomain?: string; _nsa_number: string }
        Returns: {
          already_claimed: boolean
          club_id: string
          club_name: string
          club_subdomain: string
          full_name: string
          gender: string
          league_name: string
          masked_name: string
          member_id: string
        }[]
      }
      lookup_member_by_league_number: {
        Args: { _club_id: string; _league_number: string }
        Returns: {
          association_name: string
          id: string
          masked_name: string
        }[]
      }
      member_has_permission: {
        Args: { _member_id: string; _permission: string }
        Returns: boolean
      }
      move_player_to_league_pool: {
        Args: {
          p_club_id: string
          p_club_member_id: string
          p_source_league_id: string
          p_target_league_id: string
          p_week_start_date: string
        }
        Returns: undefined
      }
      move_player_to_lineup: {
        Args: {
          p_club_id: string
          p_club_member_id: string
          p_target_league_id: string
          p_target_position: number
          p_week_start_date: string
        }
        Returns: undefined
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      next_bottom_ladder_position: {
        Args: { _club_id: string; _gender: string }
        Returns: number
      }
      next_league_week_start: {
        Args: { _dow: number; _from: string }
        Returns: string
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reset_club_finances: { Args: { p_club_id: string }; Returns: Json }
      respond_league_week_availability: {
        Args: {
          _club_member_id: string
          _response: string
          _week_start_date: string
        }
        Returns: undefined
      }
      respond_to_booking_invite: {
        Args: { invite_token: string; new_status: string; reason?: string }
        Returns: undefined
      }
      save_bells_match_result: {
        Args: {
          _match_id: string
          _side_a_points: number
          _side_b_points: number
        }
        Returns: {
          bell_ends_at: string | null
          bell_paused_seconds: number | null
          bye_member_id: string | null
          champ_id: string
          court_id: number | null
          created_at: string
          game_scores: string | null
          group_number: number
          id: string
          is_bye: boolean
          leg: string | null
          partner_a_member_id: string | null
          partner_b_member_id: string | null
          player_a_member_id: string
          player_b_member_id: string
          round_number: number
          scheduled_date: string | null
          scheduled_time: string | null
          score: string | null
          side_a_points: number | null
          side_b_points: number | null
          status: string
          updated_at: string
          winner_member_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "club_champs_matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_league_players_by_name: {
        Args: { _club_subdomain?: string; _query: string }
        Returns: {
          already_claimed: boolean
          club_name: string
          club_subdomain: string
          masked_name: string
          member_id: string
          nsa_number: string
        }[]
      }
      seed_member_default_fees: {
        Args: { p_club_member_id: string }
        Returns: undefined
      }
      sync_bells_match_state: {
        Args: {
          _bell_ends_at?: string
          _bell_paused_seconds?: number
          _match_id: string
          _patch_timer?: boolean
          _side_a_points: number
          _side_b_points: number
          _status?: string
        }
        Returns: {
          bell_ends_at: string | null
          bell_paused_seconds: number | null
          bye_member_id: string | null
          champ_id: string
          court_id: number | null
          created_at: string
          game_scores: string | null
          group_number: number
          id: string
          is_bye: boolean
          leg: string | null
          partner_a_member_id: string | null
          partner_b_member_id: string | null
          player_a_member_id: string
          player_b_member_id: string
          round_number: number
          scheduled_date: string | null
          scheduled_time: string | null
          score: string | null
          side_a_points: number | null
          side_b_points: number | null
          status: string
          updated_at: string
          winner_member_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "club_champs_matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      viewer_is_opposing_captain_for_registration: {
        Args: {
          _reg_club_member_id: string
          _reg_league_id: string
          _viewer_user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      club_member_role: "captain" | "admin" | "member" | "visitor"
      gl_account:
        | "debtors"
        | "fee_income"
        | "bank"
        | "creditors"
        | "bar_income"
        | "bar_expense"
        | "bank_current"
        | "cash"
        | "membership_income"
        | "league_fees_income"
        | "national_body_income"
        | "league_fees_expense"
        | "national_body_expense"
        | "maintenance"
        | "electricity"
        | "rent"
        | "bank_charges"
        | "gateway_fees"
        | "general_expense"
        | "association_payable"
        | "tournament_income"
        | "light_fees_income"
      integration_provider:
        | "strava"
        | "apple_health"
        | "samsung_health"
        | "garmin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      club_member_role: ["captain", "admin", "member", "visitor"],
      gl_account: [
        "debtors",
        "fee_income",
        "bank",
        "creditors",
        "bar_income",
        "bar_expense",
        "bank_current",
        "cash",
        "membership_income",
        "league_fees_income",
        "national_body_income",
        "league_fees_expense",
        "national_body_expense",
        "maintenance",
        "electricity",
        "rent",
        "bank_charges",
        "gateway_fees",
        "general_expense",
        "association_payable",
        "tournament_income",
        "light_fees_income",
      ],
      integration_provider: [
        "strava",
        "apple_health",
        "samsung_health",
        "garmin",
      ],
    },
  },
} as const
