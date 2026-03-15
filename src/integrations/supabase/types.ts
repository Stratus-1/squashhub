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
          court_id: number
          created_at: string
          date: string
          end_time: string
          guest_name: string | null
          id: string
          is_friendly: boolean
          lights_requested: boolean
          opponent_id: string | null
          start_time: string
          status: string
          user_id: string
        }
        Insert: {
          challenge_id?: string | null
          club_id?: string | null
          court_id: number
          created_at?: string
          date: string
          end_time: string
          guest_name?: string | null
          id?: string
          is_friendly?: boolean
          lights_requested?: boolean
          opponent_id?: string | null
          start_time: string
          status?: string
          user_id: string
        }
        Update: {
          challenge_id?: string | null
          club_id?: string | null
          court_id?: number
          created_at?: string
          date?: string
          end_time?: string
          guest_name?: string | null
          id?: string
          is_friendly?: boolean
          lights_requested?: boolean
          opponent_id?: string | null
          start_time?: string
          status?: string
          user_id?: string
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
            foreignKeyName: "bookings_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
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
          club_id: string | null
          confirmed_by: string | null
          counter_date: string | null
          counter_time: string | null
          court_id: number | null
          created_at: string
          id: string
          opponent_id: string
          proposed_date: string | null
          proposed_time: string | null
          status: string
          updated_at: string
        }
        Insert: {
          challenger_id: string
          club_id?: string | null
          confirmed_by?: string | null
          counter_date?: string | null
          counter_time?: string | null
          court_id?: number | null
          created_at?: string
          id?: string
          opponent_id: string
          proposed_date?: string | null
          proposed_time?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          challenger_id?: string
          club_id?: string | null
          confirmed_by?: string | null
          counter_date?: string | null
          counter_time?: string | null
          court_id?: number | null
          created_at?: string
          id?: string
          opponent_id?: string
          proposed_date?: string | null
          proposed_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      club_champs: {
        Row: {
          club_id: string
          created_at: string
          end_date: string
          end_time: string
          gender: string
          id: string
          match_duration_minutes: number
          name: string
          num_groups: number
          play_days: number[]
          start_date: string
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          end_date: string
          end_time?: string
          gender: string
          id?: string
          match_duration_minutes?: number
          name: string
          num_groups?: number
          play_days?: number[]
          start_date: string
          start_time?: string
          status?: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          end_date?: string
          end_time?: string
          gender?: string
          id?: string
          match_duration_minutes?: number
          name?: string
          num_groups?: number
          play_days?: number[]
          start_date?: string
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_champs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
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
        }
        Insert: {
          champ_id: string
          club_member_id: string
          created_at?: string
          group_number?: number
          id?: string
        }
        Update: {
          champ_id?: string
          club_member_id?: string
          created_at?: string
          group_number?: number
          id?: string
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
        ]
      }
      club_champs_matches: {
        Row: {
          champ_id: string
          court_id: number | null
          created_at: string
          game_scores: string | null
          group_number: number
          id: string
          player_a_member_id: string
          player_b_member_id: string
          round_number: number
          scheduled_date: string | null
          scheduled_time: string | null
          score: string | null
          status: string
          updated_at: string
          winner_member_id: string | null
        }
        Insert: {
          champ_id: string
          court_id?: number | null
          created_at?: string
          game_scores?: string | null
          group_number: number
          id?: string
          player_a_member_id: string
          player_b_member_id: string
          round_number?: number
          scheduled_date?: string | null
          scheduled_time?: string | null
          score?: string | null
          status?: string
          updated_at?: string
          winner_member_id?: string | null
        }
        Update: {
          champ_id?: string
          court_id?: number | null
          created_at?: string
          game_scores?: string | null
          group_number?: number
          id?: string
          player_a_member_id?: string
          player_b_member_id?: string
          round_number?: number
          scheduled_date?: string | null
          scheduled_time?: string | null
          score?: string | null
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
      club_member_fee_payments: {
        Row: {
          amount: number
          club_member_id: string
          created_at: string
          fee_label: string
          fee_type: string
          id: string
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
        ]
      }
      club_members: {
        Row: {
          address: string | null
          club_id: string
          club_member_number: string | null
          email: string | null
          fee_category_id: string | null
          gender: string | null
          id: string
          id_number: string | null
          joined_at: string
          ladder_position: number | null
          name: string | null
          phone: string | null
          plays_league: boolean
          role: Database["public"]["Enums"]["club_member_role"]
          skill_level: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          club_id: string
          club_member_number?: string | null
          email?: string | null
          fee_category_id?: string | null
          gender?: string | null
          id?: string
          id_number?: string | null
          joined_at?: string
          ladder_position?: number | null
          name?: string | null
          phone?: string | null
          plays_league?: boolean
          role?: Database["public"]["Enums"]["club_member_role"]
          skill_level?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          club_id?: string
          club_member_number?: string | null
          email?: string | null
          fee_category_id?: string | null
          gender?: string | null
          id?: string
          id_number?: string | null
          joined_at?: string
          ladder_position?: number | null
          name?: string | null
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
            foreignKeyName: "club_members_fee_category_id_fkey"
            columns: ["fee_category_id"]
            isOneToOne: false
            referencedRelation: "member_fee_categories"
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
      club_secrets: {
        Row: {
          club_id: string
          created_at: string
          id: string
          payment_gateway_secret_key: string | null
          sender_email: string | null
          sender_name: string | null
          shelly_auth_key: string | null
          smtp_host: string | null
          smtp_pass: string | null
          smtp_port: number | null
          smtp_user: string | null
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          payment_gateway_secret_key?: string | null
          sender_email?: string | null
          sender_name?: string | null
          shelly_auth_key?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          payment_gateway_secret_key?: string | null
          sender_email?: string | null
          sender_name?: string | null
          shelly_auth_key?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          updated_at?: string
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
      clubs: {
        Row: {
          address: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_branch_code: string | null
          bank_name: string | null
          bank_reference: string | null
          chairman_member_id: string | null
          challenge_levels_up: number | null
          club_captain_member_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          fee_reminder_days_before: number | null
          id: string
          light_fee_per_hour: number | null
          logo_url: string | null
          member_fee_annual: number | null
          member_fee_due_month: number | null
          member_number_length: number | null
          member_number_prefix: string | null
          member_number_start: number | null
          name: string
          payment_gateway: string | null
          payment_gateway_public_key: string | null
          payment_gateway_secret_key: string | null
          phone: string | null
          secretary_member_id: string | null
          sender_email: string | null
          sender_name: string | null
          shelly_auth_key: string | null
          smtp_host: string | null
          smtp_pass: string | null
          smtp_port: number | null
          smtp_user: string | null
          subdomain: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_branch_code?: string | null
          bank_name?: string | null
          bank_reference?: string | null
          chairman_member_id?: string | null
          challenge_levels_up?: number | null
          club_captain_member_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          fee_reminder_days_before?: number | null
          id?: string
          light_fee_per_hour?: number | null
          logo_url?: string | null
          member_fee_annual?: number | null
          member_fee_due_month?: number | null
          member_number_length?: number | null
          member_number_prefix?: string | null
          member_number_start?: number | null
          name: string
          payment_gateway?: string | null
          payment_gateway_public_key?: string | null
          payment_gateway_secret_key?: string | null
          phone?: string | null
          secretary_member_id?: string | null
          sender_email?: string | null
          sender_name?: string | null
          shelly_auth_key?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          subdomain?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_branch_code?: string | null
          bank_name?: string | null
          bank_reference?: string | null
          chairman_member_id?: string | null
          challenge_levels_up?: number | null
          club_captain_member_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          fee_reminder_days_before?: number | null
          id?: string
          light_fee_per_hour?: number | null
          logo_url?: string | null
          member_fee_annual?: number | null
          member_fee_due_month?: number | null
          member_number_length?: number | null
          member_number_prefix?: string | null
          member_number_start?: number | null
          name?: string
          payment_gateway?: string | null
          payment_gateway_public_key?: string | null
          payment_gateway_secret_key?: string | null
          phone?: string | null
          secretary_member_id?: string | null
          sender_email?: string | null
          sender_name?: string | null
          shelly_auth_key?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          subdomain?: string | null
          updated_at?: string
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
          id: number
          name: string
          relay_device_id: string | null
          relay_server: string | null
        }
        Insert: {
          club_id?: string | null
          id?: number
          name: string
          relay_device_id?: string | null
          relay_server?: string | null
        }
        Update: {
          club_id?: string | null
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
      league_associations: {
        Row: {
          abbreviation: string | null
          club_id: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          fee_annual: number | null
          fee_due_month: number | null
          fee_payable_to: string | null
          fee_payment_details: string | null
          id: string
          name: string
          updated_at: string
          website: string | null
        }
        Insert: {
          abbreviation?: string | null
          club_id: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          fee_annual?: number | null
          fee_due_month?: number | null
          fee_payable_to?: string | null
          fee_payment_details?: string | null
          id?: string
          name: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          abbreviation?: string | null
          club_id?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          fee_annual?: number | null
          fee_due_month?: number | null
          fee_payable_to?: string | null
          fee_payment_details?: string | null
          id?: string
          name?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_associations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          association_id: string | null
          club_id: string
          code: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          association_id?: string | null
          club_id: string
          code?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          association_id?: string | null
          club_id?: string
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
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
          player_a: string
          player_b: string
          score: string | null
          submitted_by: string | null
          winner_id: string | null
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
          player_a: string
          player_b: string
          score?: string | null
          submitted_by?: string | null
          winner_id?: string | null
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
          player_a?: string
          player_b?: string
          score?: string | null
          submitted_by?: string | null
          winner_id?: string | null
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
          annual_fee: number
          club_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          annual_fee?: number
          club_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          annual_fee?: number
          club_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
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
      member_league_registrations: {
        Row: {
          club_member_id: string
          created_at: string
          id: string
          is_captain: boolean
          league_association_number: string | null
          league_id: string
          player_rank: number | null
          ssa_number: string | null
          updated_at: string
        }
        Insert: {
          club_member_id: string
          created_at?: string
          id?: string
          is_captain?: boolean
          league_association_number?: string | null
          league_id: string
          player_rank?: number | null
          ssa_number?: string | null
          updated_at?: string
        }
        Update: {
          club_member_id?: string
          created_at?: string
          id?: string
          is_captain?: boolean
          league_association_number?: string | null
          league_id?: string
          player_rank?: number | null
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
      national_body_fees: {
        Row: {
          abbreviation: string | null
          body_name: string
          club_id: string
          created_at: string
          fee_annual: number | null
          fee_due_month: number | null
          fee_payable_to: string | null
          fee_payment_details: string | null
          id: string
          updated_at: string
        }
        Insert: {
          abbreviation?: string | null
          body_name?: string
          club_id: string
          created_at?: string
          fee_annual?: number | null
          fee_due_month?: number | null
          fee_payable_to?: string | null
          fee_payment_details?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          abbreviation?: string | null
          body_name?: string
          club_id?: string
          created_at?: string
          fee_annual?: number | null
          fee_due_month?: number | null
          fee_payable_to?: string | null
          fee_payment_details?: string | null
          id?: string
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
          created_at: string
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
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
    }
    Views: {
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
      admin_reorder_ladder: {
        Args: { gender_filter: string; player_ids: string[] }
        Returns: undefined
      }
      get_club_analytics: { Args: { days_back?: number }; Returns: Json }
      get_match_of_the_week: {
        Args: never
        Returns: {
          closeness_score: number
          game_scores: string
          match_date: string
          match_id: string
          player_a: string
          player_a_name: string
          player_b: string
          player_b_name: string
          score: string
          winner_id: string
        }[]
      }
      get_next_member_number: { Args: { _club_id: string }; Returns: string }
      get_personal_analytics: {
        Args: { days_back?: number; target_user_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_club_admin: {
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
      respond_to_booking_invite: {
        Args: { invite_token: string; new_status: string; reason?: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      club_member_role: "captain" | "admin" | "member"
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
      club_member_role: ["captain", "admin", "member"],
      integration_provider: [
        "strava",
        "apple_health",
        "samsung_health",
        "garmin",
      ],
    },
  },
} as const
