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
    PostgrestVersion: "14.5"
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
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          club_id: string | null
          club_member_id: string | null
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
          workflow_key: string | null
        }
        Insert: {
          club_id?: string | null
          club_member_id?: string | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
          workflow_key?: string | null
        }
        Update: {
          club_id?: string | null
          club_member_id?: string | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          workflow_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feedback: {
        Row: {
          answer: string | null
          club_id: string | null
          conversation_id: string | null
          created_at: string
          id: string
          question: string
          rating: string | null
          route: string | null
          topic: string | null
          unanswered: boolean
          user_id: string
        }
        Insert: {
          answer?: string | null
          club_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          question: string
          rating?: string | null
          route?: string | null
          topic?: string | null
          unanswered?: boolean
          user_id: string
        }
        Update: {
          answer?: string | null
          club_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          question?: string
          rating?: string | null
          route?: string | null
          topic?: string | null
          unanswered?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          action_key: string | null
          action_params: Json
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          workflow_key: string | null
          workflow_step: number | null
        }
        Insert: {
          action_key?: string | null
          action_params?: Json
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          workflow_key?: string | null
          workflow_step?: number | null
        }
        Update: {
          action_key?: string | null
          action_params?: Json
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          workflow_key?: string | null
          workflow_step?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_user_preferences: {
        Row: {
          created_at: string
          rate: number
          response_style: string | null
          speak_replies: boolean
          updated_at: string
          user_id: string
          voice: string | null
        }
        Insert: {
          created_at?: string
          rate?: number
          response_style?: string | null
          speak_replies?: boolean
          updated_at?: string
          user_id: string
          voice?: string | null
        }
        Update: {
          created_at?: string
          rate?: number
          response_style?: string | null
          speak_replies?: boolean
          updated_at?: string
          user_id?: string
          voice?: string | null
        }
        Relationships: []
      }
      app_releases: {
        Row: {
          build_id: string
          created_at: string
          id: string
          notes: string | null
          released_at: string
          rollout_percent: number
          severity: string
          target_club_ids: string[]
          updated_at: string
        }
        Insert: {
          build_id: string
          created_at?: string
          id?: string
          notes?: string | null
          released_at?: string
          rollout_percent?: number
          severity?: string
          target_club_ids?: string[]
          updated_at?: string
        }
        Update: {
          build_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          released_at?: string
          rollout_percent?: number
          severity?: string
          target_club_ids?: string[]
          updated_at?: string
        }
        Relationships: []
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
      association_fee_items: {
        Row: {
          active: boolean
          amount: number
          association_club_id: string
          basis: string
          created_at: string
          created_by: string | null
          direction: string
          id: string
          label: string
          league_association_id: string | null
          league_id: string | null
          notes: string | null
          season_year: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number
          association_club_id: string
          basis?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          label: string
          league_association_id?: string | null
          league_id?: string | null
          notes?: string | null
          season_year?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          association_club_id?: string
          basis?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          label?: string
          league_association_id?: string | null
          league_id?: string | null
          notes?: string | null
          season_year?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "association_fee_items_association_club_id_fkey"
            columns: ["association_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "association_fee_items_league_association_id_fkey"
            columns: ["league_association_id"]
            isOneToOne: false
            referencedRelation: "association_member_affiliations_v"
            referencedColumns: ["league_association_id"]
          },
          {
            foreignKeyName: "association_fee_items_league_association_id_fkey"
            columns: ["league_association_id"]
            isOneToOne: false
            referencedRelation: "league_associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "association_fee_items_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      association_ranking_settings: {
        Row: {
          association_id: string
          best_n: number
          clean_sweep_bonus: number
          close_loss_bonus: number
          created_at: string
          league_step: number
          loss_points: number
          opponent_scale: number
          position_step: number
          position_top_weight: number
          reserve_factor: number
          season_decay: Json
          updated_at: string
          win_points: number
        }
        Insert: {
          association_id: string
          best_n?: number
          clean_sweep_bonus?: number
          close_loss_bonus?: number
          created_at?: string
          league_step?: number
          loss_points?: number
          opponent_scale?: number
          position_step?: number
          position_top_weight?: number
          reserve_factor?: number
          season_decay?: Json
          updated_at?: string
          win_points?: number
        }
        Update: {
          association_id?: string
          best_n?: number
          clean_sweep_bonus?: number
          close_loss_bonus?: number
          created_at?: string
          league_step?: number
          loss_points?: number
          opponent_scale?: number
          position_step?: number
          position_top_weight?: number
          reserve_factor?: number
          season_decay?: Json
          updated_at?: string
          win_points?: number
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_label: string | null
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          club_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          org_id: string | null
          reason: string | null
        }
        Insert: {
          action: string
          actor_label?: string | null
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          club_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          org_id?: string | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor_label?: string | null
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          club_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          org_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
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
      bar_guest_tabs: {
        Row: {
          closed_at: string | null
          club_id: string
          club_member_id: string | null
          created_at: string
          guest_name: string
          id: string
          opened_at: string
          settled_method: string | null
          status: string
          token: string
        }
        Insert: {
          closed_at?: string | null
          club_id: string
          club_member_id?: string | null
          created_at?: string
          guest_name: string
          id?: string
          opened_at?: string
          settled_method?: string | null
          status?: string
          token?: string
        }
        Update: {
          closed_at?: string | null
          club_id?: string
          club_member_id?: string | null
          created_at?: string
          guest_name?: string
          id?: string
          opened_at?: string
          settled_method?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "bar_guest_tabs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_guest_tabs_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_items: {
        Row: {
          active: boolean
          barcode: string | null
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
          barcode?: string | null
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
          barcode?: string | null
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
            referencedRelation: "club_members"
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
          guest_tab_id: string | null
          id: string
          logged_by: string | null
          note: string | null
          payment_method: string
          payment_reference: string | null
          payment_status: string
          quantity: number
          total: number
          unit_price: number
          visitor_name: string | null
        }
        Insert: {
          bar_item_id: string
          club_id: string
          created_at?: string
          guest_tab_id?: string | null
          id?: string
          logged_by?: string | null
          note?: string | null
          payment_method: string
          payment_reference?: string | null
          payment_status?: string
          quantity: number
          total: number
          unit_price: number
          visitor_name?: string | null
        }
        Update: {
          bar_item_id?: string
          club_id?: string
          created_at?: string
          guest_tab_id?: string | null
          id?: string
          logged_by?: string | null
          note?: string | null
          payment_method?: string
          payment_reference?: string | null
          payment_status?: string
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
            foreignKeyName: "bar_visitor_sales_guest_tab_id_fkey"
            columns: ["guest_tab_id"]
            isOneToOne: false
            referencedRelation: "bar_guest_tabs"
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
          booking_type: string
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
          ops_note: string | null
          ops_photo_url: string | null
          ops_purpose: string | null
          shelly_schedule_off_id: string | null
          shelly_schedule_on_id: string | null
          source: string
          start_time: string
          status: string
          user_id: string | null
        }
        Insert: {
          booking_type?: string
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
          ops_note?: string | null
          ops_photo_url?: string | null
          ops_purpose?: string | null
          shelly_schedule_off_id?: string | null
          shelly_schedule_on_id?: string | null
          source?: string
          start_time: string
          status?: string
          user_id?: string | null
        }
        Update: {
          booking_type?: string
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
          ops_note?: string | null
          ops_photo_url?: string | null
          ops_purpose?: string | null
          shelly_schedule_off_id?: string | null
          shelly_schedule_on_id?: string | null
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
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      champ_doubles_pairs: {
        Row: {
          accepted_at: string | null
          champ_id: string
          created_at: string
          group_number: number
          id: string
          locked_at: string | null
          member_a: string
          member_b: string
          note: string | null
          origin: string
          payer_member_id: string | null
          pays_for_partner: boolean
          proposed_by: string
          responded_at: string | null
          responded_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          champ_id: string
          created_at?: string
          group_number: number
          id?: string
          locked_at?: string | null
          member_a: string
          member_b: string
          note?: string | null
          origin?: string
          payer_member_id?: string | null
          pays_for_partner?: boolean
          proposed_by: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          champ_id?: string
          created_at?: string
          group_number?: number
          id?: string
          locked_at?: string | null
          member_a?: string
          member_b?: string
          note?: string | null
          origin?: string
          payer_member_id?: string | null
          pays_for_partner?: boolean
          proposed_by?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "champ_doubles_pairs_champ_id_fkey"
            columns: ["champ_id"]
            isOneToOne: false
            referencedRelation: "club_champs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "champ_doubles_pairs_champ_id_fkey"
            columns: ["champ_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "champ_doubles_pairs_member_a_fkey"
            columns: ["member_a"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "champ_doubles_pairs_member_b_fkey"
            columns: ["member_b"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "champ_doubles_pairs_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "champ_doubles_pairs_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      champ_marker_locks: {
        Row: {
          created_at: string
          heartbeat_at: string
          match_id: string
          takeover_declined_at: string | null
          takeover_requested_at: string | null
          takeover_requested_by: string | null
          takeover_requested_name: string | null
          user_id: string
          user_name: string
        }
        Insert: {
          created_at?: string
          heartbeat_at?: string
          match_id: string
          takeover_declined_at?: string | null
          takeover_requested_at?: string | null
          takeover_requested_by?: string | null
          takeover_requested_name?: string | null
          user_id: string
          user_name?: string
        }
        Update: {
          created_at?: string
          heartbeat_at?: string
          match_id?: string
          takeover_declined_at?: string | null
          takeover_requested_at?: string | null
          takeover_requested_by?: string | null
          takeover_requested_name?: string | null
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "champ_marker_locks_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "club_champs_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      club_ai_settings: {
        Row: {
          actions_enabled: boolean
          audience: string
          club_id: string
          created_at: string
          default_rate: number
          default_voice: string | null
          enabled: boolean
          response_style: string
          text_chat_enabled: boolean
          updated_at: string
          voice_input_enabled: boolean
          voice_output_enabled: boolean
        }
        Insert: {
          actions_enabled?: boolean
          audience?: string
          club_id: string
          created_at?: string
          default_rate?: number
          default_voice?: string | null
          enabled?: boolean
          response_style?: string
          text_chat_enabled?: boolean
          updated_at?: string
          voice_input_enabled?: boolean
          voice_output_enabled?: boolean
        }
        Update: {
          actions_enabled?: boolean
          audience?: string
          club_id?: string
          created_at?: string
          default_rate?: number
          default_voice?: string | null
          enabled?: boolean
          response_style?: string
          text_chat_enabled?: boolean
          updated_at?: string
          voice_input_enabled?: boolean
          voice_output_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "club_ai_settings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_association_payable_batches: {
        Row: {
          bank_account: string | null
          basis: string | null
          club_id: string
          created_at: string
          created_by: string | null
          id: string
          journal_ref_raise: string | null
          journal_ref_settle: string | null
          member_count: number
          national_body_fee_id: string | null
          notes: string | null
          paid_amount: number | null
          paid_at: string | null
          payable_fee_id: string | null
          payment_reference: string | null
          season_label: string
          status: string
          total_amount: number
          unit_amount: number | null
          updated_at: string
        }
        Insert: {
          bank_account?: string | null
          basis?: string | null
          club_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_ref_raise?: string | null
          journal_ref_settle?: string | null
          member_count?: number
          national_body_fee_id?: string | null
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payable_fee_id?: string | null
          payment_reference?: string | null
          season_label: string
          status?: string
          total_amount?: number
          unit_amount?: number | null
          updated_at?: string
        }
        Update: {
          bank_account?: string | null
          basis?: string | null
          club_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_ref_raise?: string | null
          journal_ref_settle?: string | null
          member_count?: number
          national_body_fee_id?: string | null
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payable_fee_id?: string | null
          payment_reference?: string | null
          season_label?: string
          status?: string
          total_amount?: number
          unit_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_association_payable_batches_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_association_payable_batches_payable_fee_id_fkey"
            columns: ["payable_fee_id"]
            isOneToOne: false
            referencedRelation: "club_fees_payable"
            referencedColumns: ["id"]
          },
        ]
      }
      club_association_payable_lines: {
        Row: {
          amount: number
          batch_id: string
          club_member_id: string
          created_at: string
          id: string
          league_number: string | null
          paid: boolean
          paid_at: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          batch_id: string
          club_member_id: string
          created_at?: string
          id?: string
          league_number?: string | null
          paid?: boolean
          paid_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          batch_id?: string
          club_member_id?: string
          created_at?: string
          id?: string
          league_number?: string | null
          paid?: boolean
          paid_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_association_payable_lines_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "club_association_payable_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_association_payable_lines_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      club_bank_rules: {
        Row: {
          account: Database["public"]["Enums"]["gl_account"] | null
          club_id: string
          created_at: string
          custom_account_id: string | null
          direction: string
          discard: boolean
          hit_count: number
          id: string
          match_key: string
          member_id: string | null
          updated_at: string
        }
        Insert: {
          account?: Database["public"]["Enums"]["gl_account"] | null
          club_id: string
          created_at?: string
          custom_account_id?: string | null
          direction?: string
          discard?: boolean
          hit_count?: number
          id?: string
          match_key: string
          member_id?: string | null
          updated_at?: string
        }
        Update: {
          account?: Database["public"]["Enums"]["gl_account"] | null
          club_id?: string
          created_at?: string
          custom_account_id?: string | null
          direction?: string
          discard?: boolean
          hit_count?: number
          id?: string
          match_key?: string
          member_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_bank_rules_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_bank_rules_custom_account_id_fkey"
            columns: ["custom_account_id"]
            isOneToOne: false
            referencedRelation: "club_gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_bank_rules_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      club_bank_statements: {
        Row: {
          account: Database["public"]["Enums"]["gl_account"]
          closing_balance: number | null
          club_id: string
          created_at: string
          file_name: string
          id: string
          imported_by: string | null
          is_first_statement: boolean
          opening_balance: number | null
          period_end: string | null
          period_start: string | null
          row_count: number
          source_format: string
          updated_at: string
        }
        Insert: {
          account?: Database["public"]["Enums"]["gl_account"]
          closing_balance?: number | null
          club_id: string
          created_at?: string
          file_name: string
          id?: string
          imported_by?: string | null
          is_first_statement?: boolean
          opening_balance?: number | null
          period_end?: string | null
          period_start?: string | null
          row_count?: number
          source_format?: string
          updated_at?: string
        }
        Update: {
          account?: Database["public"]["Enums"]["gl_account"]
          closing_balance?: number | null
          club_id?: string
          created_at?: string
          file_name?: string
          id?: string
          imported_by?: string | null
          is_first_statement?: boolean
          opening_balance?: number | null
          period_end?: string | null
          period_start?: string | null
          row_count?: number
          source_format?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_bank_statements_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_bank_transactions: {
        Row: {
          amount: number
          balance: number | null
          club_id: string
          created_at: string
          description: string
          fingerprint: string
          id: string
          journal_ref: string | null
          matched_account: Database["public"]["Enums"]["gl_account"] | null
          matched_custom_account_id: string | null
          matched_member_id: string | null
          notes: string | null
          reference: string | null
          statement_id: string | null
          status: string
          txn_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          balance?: number | null
          club_id: string
          created_at?: string
          description?: string
          fingerprint: string
          id?: string
          journal_ref?: string | null
          matched_account?: Database["public"]["Enums"]["gl_account"] | null
          matched_custom_account_id?: string | null
          matched_member_id?: string | null
          notes?: string | null
          reference?: string | null
          statement_id?: string | null
          status?: string
          txn_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          balance?: number | null
          club_id?: string
          created_at?: string
          description?: string
          fingerprint?: string
          id?: string
          journal_ref?: string | null
          matched_account?: Database["public"]["Enums"]["gl_account"] | null
          matched_custom_account_id?: string | null
          matched_member_id?: string | null
          notes?: string | null
          reference?: string | null
          statement_id?: string | null
          status?: string
          txn_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_bank_transactions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_bank_transactions_matched_custom_account_id_fkey"
            columns: ["matched_custom_account_id"]
            isOneToOne: false
            referencedRelation: "club_gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_bank_transactions_matched_member_id_fkey"
            columns: ["matched_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_bank_transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "club_bank_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      club_billing_audit: {
        Row: {
          changed_by: string | null
          changed_by_name: string | null
          club_id: string
          created_at: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string | null
          club_id: string
          created_at?: string
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string | null
          club_id?: string
          created_at?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_billing_audit_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_billing_profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          club_id: string
          company_name: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          emails: string[]
          id: string
          phone: string | null
          po_number: string | null
          postal_code: string | null
          province: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          club_id: string
          company_name?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          emails?: string[]
          id?: string
          phone?: string | null
          po_number?: string | null
          postal_code?: string | null
          province?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          club_id?: string
          company_name?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          emails?: string[]
          id?: string
          phone?: string | null
          po_number?: string | null
          postal_code?: string | null
          province?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_billing_profiles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_capabilities: {
        Row: {
          capability: string
          club_id: string
          created_at: string
          disabled_at: string | null
          enabled: boolean
          enabled_at: string | null
          enabled_by: string | null
          id: string
          updated_at: string
        }
        Insert: {
          capability: string
          club_id: string
          created_at?: string
          disabled_at?: string | null
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          capability?: string
          club_id?: string
          created_at?: string
          disabled_at?: string | null
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_capabilities_club_id_fkey"
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
          order_index: number
          partner_member_id: string | null
          pool_number: number | null
        }
        Insert: {
          champ_id: string
          club_member_id: string
          created_at?: string
          group_number?: number
          id?: string
          order_index?: number
          partner_member_id?: string | null
          pool_number?: number | null
        }
        Update: {
          champ_id?: string
          club_member_id?: string
          created_at?: string
          group_number?: number
          id?: string
          order_index?: number
          partner_member_id?: string | null
          pool_number?: number | null
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
            foreignKeyName: "club_champs_entries_champ_id_fkey"
            columns: ["champ_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
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
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      club_champs_matches: {
        Row: {
          bell_ends_at: string | null
          bell_paused_seconds: number | null
          booking_id: string | null
          bracket_position: number | null
          bye_member_id: string | null
          champ_id: string
          court_id: number | null
          created_at: string
          forfeit_member_id: string | null
          game_scores: string | null
          group_number: number
          handicap_a: number
          handicap_b: number
          handicap_locked: boolean
          id: string
          is_bye: boolean
          leg: string | null
          partner_a_member_id: string | null
          partner_b_member_id: string | null
          placeholder_a: string | null
          placeholder_b: string | null
          play_by: string | null
          player_a_member_id: string | null
          player_b_member_id: string | null
          pool_number: number | null
          round_id: string | null
          round_number: number
          scheduled_date: string | null
          scheduled_time: string | null
          score: string | null
          section_number: number | null
          side_a_points: number | null
          side_b_points: number | null
          stage: string
          stage_label: string | null
          status: string
          updated_at: string
          winner_member_id: string | null
        }
        Insert: {
          bell_ends_at?: string | null
          bell_paused_seconds?: number | null
          booking_id?: string | null
          bracket_position?: number | null
          bye_member_id?: string | null
          champ_id: string
          court_id?: number | null
          created_at?: string
          forfeit_member_id?: string | null
          game_scores?: string | null
          group_number: number
          handicap_a?: number
          handicap_b?: number
          handicap_locked?: boolean
          id?: string
          is_bye?: boolean
          leg?: string | null
          partner_a_member_id?: string | null
          partner_b_member_id?: string | null
          placeholder_a?: string | null
          placeholder_b?: string | null
          play_by?: string | null
          player_a_member_id?: string | null
          player_b_member_id?: string | null
          pool_number?: number | null
          round_id?: string | null
          round_number?: number
          scheduled_date?: string | null
          scheduled_time?: string | null
          score?: string | null
          section_number?: number | null
          side_a_points?: number | null
          side_b_points?: number | null
          stage?: string
          stage_label?: string | null
          status?: string
          updated_at?: string
          winner_member_id?: string | null
        }
        Update: {
          bell_ends_at?: string | null
          bell_paused_seconds?: number | null
          booking_id?: string | null
          bracket_position?: number | null
          bye_member_id?: string | null
          champ_id?: string
          court_id?: number | null
          created_at?: string
          forfeit_member_id?: string | null
          game_scores?: string | null
          group_number?: number
          handicap_a?: number
          handicap_b?: number
          handicap_locked?: boolean
          id?: string
          is_bye?: boolean
          leg?: string | null
          partner_a_member_id?: string | null
          partner_b_member_id?: string | null
          placeholder_a?: string | null
          placeholder_b?: string | null
          play_by?: string | null
          player_a_member_id?: string | null
          player_b_member_id?: string | null
          pool_number?: number | null
          round_id?: string | null
          round_number?: number
          scheduled_date?: string | null
          scheduled_time?: string | null
          score?: string | null
          section_number?: number | null
          side_a_points?: number | null
          side_b_points?: number | null
          stage?: string
          stage_label?: string | null
          status?: string
          updated_at?: string
          winner_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_champs_matches_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_matches_champ_id_fkey"
            columns: ["champ_id"]
            isOneToOne: false
            referencedRelation: "club_champs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_matches_champ_id_fkey"
            columns: ["champ_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
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
            foreignKeyName: "club_champs_matches_forfeit_member_id_fkey"
            columns: ["forfeit_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
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
            referencedRelation: "club_members"
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
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_matches_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "club_champs_rounds"
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
          confirmation_source: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          declined_at: string | null
          division_choices: number[]
          fee_paid_cents: number
          fee_payment_id: string | null
          id: string
          invite_revoked_at: string | null
          invite_token: string | null
          invite_token_created_at: string | null
          invite_viewed_at: string | null
          invited_at: string | null
          invited_by_admin: boolean
          paid_at: string | null
          partner_confirmed: boolean
          partner_member_id: string | null
          payment_ref: string | null
          proof_uploaded_at: string | null
          proof_uploaded_by: string | null
          proof_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          champ_id: string
          club_member_id: string
          confirmation_source?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          declined_at?: string | null
          division_choices?: number[]
          fee_paid_cents?: number
          fee_payment_id?: string | null
          id?: string
          invite_revoked_at?: string | null
          invite_token?: string | null
          invite_token_created_at?: string | null
          invite_viewed_at?: string | null
          invited_at?: string | null
          invited_by_admin?: boolean
          paid_at?: string | null
          partner_confirmed?: boolean
          partner_member_id?: string | null
          payment_ref?: string | null
          proof_uploaded_at?: string | null
          proof_uploaded_by?: string | null
          proof_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          champ_id?: string
          club_member_id?: string
          confirmation_source?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          declined_at?: string | null
          division_choices?: number[]
          fee_paid_cents?: number
          fee_payment_id?: string | null
          id?: string
          invite_revoked_at?: string | null
          invite_token?: string | null
          invite_token_created_at?: string | null
          invite_viewed_at?: string | null
          invited_at?: string | null
          invited_by_admin?: boolean
          paid_at?: string | null
          partner_confirmed?: boolean
          partner_member_id?: string | null
          payment_ref?: string | null
          proof_uploaded_at?: string | null
          proof_uploaded_by?: string | null
          proof_url?: string | null
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
            foreignKeyName: "club_champs_registrations_champ_id_fkey"
            columns: ["champ_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
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
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      club_champs_rounds: {
        Row: {
          champ_id: string
          created_at: string
          generated_at: string | null
          generated_by: string | null
          group_number: number
          id: string
          label: string | null
          notes: string | null
          play_by: string | null
          round_number: number
          round_type: string
          scheduling_mode: string
          section_number: number
          status: string
          updated_at: string
        }
        Insert: {
          champ_id: string
          created_at?: string
          generated_at?: string | null
          generated_by?: string | null
          group_number?: number
          id?: string
          label?: string | null
          notes?: string | null
          play_by?: string | null
          round_number: number
          round_type?: string
          scheduling_mode?: string
          section_number?: number
          status?: string
          updated_at?: string
        }
        Update: {
          champ_id?: string
          created_at?: string
          generated_at?: string | null
          generated_by?: string | null
          group_number?: number
          id?: string
          label?: string | null
          notes?: string | null
          play_by?: string | null
          round_number?: number
          round_type?: string
          scheduling_mode?: string
          section_number?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_champs_rounds_champ_id_fkey"
            columns: ["champ_id"]
            isOneToOne: false
            referencedRelation: "club_champs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_champs_rounds_champ_id_fkey"
            columns: ["champ_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      club_claim_requests: {
        Row: {
          claimed_role: string
          club_id: string
          created_at: string
          id: string
          note: string | null
          requester_email: string | null
          requester_name: string
          requester_phone: string | null
          requester_user_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          claimed_role?: string
          club_id: string
          created_at?: string
          id?: string
          note?: string | null
          requester_email?: string | null
          requester_name?: string
          requester_phone?: string | null
          requester_user_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          claimed_role?: string
          club_id?: string
          created_at?: string
          id?: string
          note?: string | null
          requester_email?: string | null
          requester_name?: string
          requester_phone?: string | null
          requester_user_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_claim_requests_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_data_bundles: {
        Row: {
          archived_at: string | null
          baseline_bytes: number
          club_id: string
          cost: number | null
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          purchased_at: string
          size_mb: number
          updated_at: string
          used_bytes: number
        }
        Insert: {
          archived_at?: string | null
          baseline_bytes?: number
          club_id: string
          cost?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          purchased_at?: string
          size_mb: number
          updated_at?: string
          used_bytes?: number
        }
        Update: {
          archived_at?: string | null
          baseline_bytes?: number
          club_id?: string
          cost?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          purchased_at?: string
          size_mb?: number
          updated_at?: string
          used_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_data_bundles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_devices: {
        Row: {
          auto_off_minutes: number | null
          ble_mac: string | null
          category: string
          club_id: string
          control_mode: string
          created_at: string
          created_by: string | null
          enabled: boolean
          icon: string | null
          id: string
          last_error: string | null
          last_state: boolean | null
          last_state_at: string | null
          location: string | null
          name: string
          notes: string | null
          provider: string
          pulse_ms: number
          shelly_channel: number
          shelly_device_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          auto_off_minutes?: number | null
          ble_mac?: string | null
          category: string
          club_id: string
          control_mode?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          icon?: string | null
          id?: string
          last_error?: string | null
          last_state?: boolean | null
          last_state_at?: string | null
          location?: string | null
          name: string
          notes?: string | null
          provider?: string
          pulse_ms?: number
          shelly_channel?: number
          shelly_device_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          auto_off_minutes?: number | null
          ble_mac?: string | null
          category?: string
          club_id?: string
          control_mode?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          icon?: string | null
          id?: string
          last_error?: string | null
          last_state?: boolean | null
          last_state_at?: string | null
          location?: string | null
          name?: string
          notes?: string | null
          provider?: string
          pulse_ms?: number
          shelly_channel?: number
          shelly_device_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_devices_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
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
      club_gl_accounts: {
        Row: {
          base_account: Database["public"]["Enums"]["gl_account"] | null
          category: string
          club_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          base_account?: Database["public"]["Enums"]["gl_account"] | null
          category: string
          club_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          base_account?: Database["public"]["Enums"]["gl_account"] | null
          category?: string
          club_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_gl_accounts_club_id_fkey"
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
          custom_account_id: string | null
          debit: number
          description: string
          fee_payment_id: string | null
          id: string
          journal_ref: string
          reverses_journal_ref: string | null
          transaction_id: string | null
        }
        Insert: {
          account: Database["public"]["Enums"]["gl_account"]
          club_id: string
          club_member_id?: string | null
          created_at?: string
          credit?: number
          custom_account_id?: string | null
          debit?: number
          description: string
          fee_payment_id?: string | null
          id?: string
          journal_ref?: string
          reverses_journal_ref?: string | null
          transaction_id?: string | null
        }
        Update: {
          account?: Database["public"]["Enums"]["gl_account"]
          club_id?: string
          club_member_id?: string | null
          created_at?: string
          credit?: number
          custom_account_id?: string | null
          debit?: number
          description?: string
          fee_payment_id?: string | null
          id?: string
          journal_ref?: string
          reverses_journal_ref?: string | null
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
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_journal_entries_custom_account_id_fkey"
            columns: ["custom_account_id"]
            isOneToOne: false
            referencedRelation: "club_gl_accounts"
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
          invoice_due_date: string | null
          invoice_email_sent_at: string | null
          invoice_email_status: string | null
          invoice_issued_at: string | null
          invoice_number: string | null
          invoice_send_date: string | null
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
          invoice_due_date?: string | null
          invoice_email_sent_at?: string | null
          invoice_email_status?: string | null
          invoice_issued_at?: string | null
          invoice_number?: string | null
          invoice_send_date?: string | null
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
          invoice_due_date?: string | null
          invoice_email_sent_at?: string | null
          invoice_email_status?: string | null
          invoice_issued_at?: string | null
          invoice_number?: string | null
          invoice_send_date?: string | null
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
          access_suspended_at: string | null
          address: string | null
          applied_at: string | null
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          billing_exempt: boolean
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
          is_pending_approval: boolean
          joined_at: string
          ladder_position: number | null
          name: string | null
          occupation: string | null
          pending_captain_claim: boolean
          person_id: string | null
          phone: string | null
          plays_league: boolean
          ranking_points: number
          role: Database["public"]["Enums"]["club_member_role"]
          skill_level: string | null
          skills: string[]
          skills_other: string | null
          skills_updated_at: string | null
          status: Database["public"]["Enums"]["member_status"]
          suspended_at: string | null
          suspension_cleared_at: string | null
          suspension_manual: boolean
          suspension_outstanding: number | null
          suspension_reason: string | null
          suspension_status: Database["public"]["Enums"]["member_suspension_status"]
          updated_at: string
          user_id: string | null
          volunteer_willing: boolean
          whatsapp_opt_out: boolean
        }
        Insert: {
          access_suspended_at?: string | null
          address?: string | null
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          billing_exempt?: boolean
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
          is_pending_approval?: boolean
          joined_at?: string
          ladder_position?: number | null
          name?: string | null
          occupation?: string | null
          pending_captain_claim?: boolean
          person_id?: string | null
          phone?: string | null
          plays_league?: boolean
          ranking_points?: number
          role?: Database["public"]["Enums"]["club_member_role"]
          skill_level?: string | null
          skills?: string[]
          skills_other?: string | null
          skills_updated_at?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          suspended_at?: string | null
          suspension_cleared_at?: string | null
          suspension_manual?: boolean
          suspension_outstanding?: number | null
          suspension_reason?: string | null
          suspension_status?: Database["public"]["Enums"]["member_suspension_status"]
          updated_at?: string
          user_id?: string | null
          volunteer_willing?: boolean
          whatsapp_opt_out?: boolean
        }
        Update: {
          access_suspended_at?: string | null
          address?: string | null
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          billing_exempt?: boolean
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
          is_pending_approval?: boolean
          joined_at?: string
          ladder_position?: number | null
          name?: string | null
          occupation?: string | null
          pending_captain_claim?: boolean
          person_id?: string | null
          phone?: string | null
          plays_league?: boolean
          ranking_points?: number
          role?: Database["public"]["Enums"]["club_member_role"]
          skill_level?: string | null
          skills?: string[]
          skills_other?: string | null
          skills_updated_at?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          suspended_at?: string | null
          suspension_cleared_at?: string | null
          suspension_manual?: boolean
          suspension_outstanding?: number | null
          suspension_reason?: string | null
          suspension_status?: Database["public"]["Enums"]["member_suspension_status"]
          updated_at?: string
          user_id?: string | null
          volunteer_willing?: boolean
          whatsapp_opt_out?: boolean
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
            foreignKeyName: "club_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
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
      club_membership_rule_versions: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          documents: Json
          id: string
          rules_text: string
          version: number
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          documents?: Json
          id?: string
          rules_text?: string
          version: number
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          documents?: Json
          id?: string
          rules_text?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_membership_rule_versions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_membership_rules: {
        Row: {
          acceptance_statement: string
          club_id: string
          created_at: string
          current_version: number
          documents: Json
          id: string
          require_acceptance: boolean
          rules_text: string
          show_on_landing: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          acceptance_statement?: string
          club_id: string
          created_at?: string
          current_version?: number
          documents?: Json
          id?: string
          require_acceptance?: boolean
          rules_text?: string
          show_on_landing?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          acceptance_statement?: string
          club_id?: string
          created_at?: string
          current_version?: number
          documents?: Json
          id?: string
          require_acceptance?: boolean
          rules_text?: string
          show_on_landing?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_membership_rules_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
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
      club_ranking_rule_versions: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          note: string | null
          settings: Json
          version: number
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          note?: string | null
          settings: Json
          version: number
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          note?: string | null
          settings?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_ranking_rule_versions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_ranking_snapshot_entries: {
        Row: {
          club_id: string
          club_member_id: string
          created_at: string
          id: string
          ladder_position: number | null
          rank: number
          ranking_points: number
          snapshot_id: string
        }
        Insert: {
          club_id: string
          club_member_id: string
          created_at?: string
          id?: string
          ladder_position?: number | null
          rank: number
          ranking_points?: number
          snapshot_id: string
        }
        Update: {
          club_id?: string
          club_member_id?: string
          created_at?: string
          id?: string
          ladder_position?: number | null
          rank?: number
          ranking_points?: number
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_ranking_snapshot_entries_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_ranking_snapshot_entries_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_ranking_snapshot_entries_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "club_ranking_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      club_ranking_snapshots: {
        Row: {
          club_id: string
          created_at: string
          id: string
          member_count: number
          period_start: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          member_count?: number
          period_start: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          member_count?: number
          period_start?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_ranking_snapshots_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_router_alert_settings: {
        Row: {
          club_id: string
          created_at: string
          id: string
          notify_email: boolean
          notify_offline: boolean
          notify_push: boolean
          recipients: string[]
          thresholds: number[]
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          notify_email?: boolean
          notify_offline?: boolean
          notify_push?: boolean
          recipients?: string[]
          thresholds?: number[]
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          notify_email?: boolean
          notify_offline?: boolean
          notify_push?: boolean
          recipients?: string[]
          thresholds?: number[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_router_alert_settings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_router_alerts: {
        Row: {
          bundle_id: string | null
          channels: string[]
          club_id: string
          id: string
          kind: string
          message: string | null
          sent_at: string
          threshold: number | null
        }
        Insert: {
          bundle_id?: string | null
          channels?: string[]
          club_id: string
          id?: string
          kind?: string
          message?: string | null
          sent_at?: string
          threshold?: number | null
        }
        Update: {
          bundle_id?: string | null
          channels?: string[]
          club_id?: string
          id?: string
          kind?: string
          message?: string | null
          sent_at?: string
          threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "club_router_alerts_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "club_data_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_router_alerts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_router_configs: {
        Row: {
          club_id: string
          created_at: string
          driver: string
          enabled: boolean
          host: string | null
          id: string
          last_polled_at: string | null
          last_status: Json
          model: string | null
          notes: string | null
          poll_interval_minutes: number
          port: number | null
          updated_at: string
          use_https: boolean
        }
        Insert: {
          club_id: string
          created_at?: string
          driver?: string
          enabled?: boolean
          host?: string | null
          id?: string
          last_polled_at?: string | null
          last_status?: Json
          model?: string | null
          notes?: string | null
          poll_interval_minutes?: number
          port?: number | null
          updated_at?: string
          use_https?: boolean
        }
        Update: {
          club_id?: string
          created_at?: string
          driver?: string
          enabled?: boolean
          host?: string | null
          id?: string
          last_polled_at?: string | null
          last_status?: Json
          model?: string | null
          notes?: string | null
          poll_interval_minutes?: number
          port?: number | null
          updated_at?: string
          use_https?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "club_router_configs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_router_polls: {
        Row: {
          bundle_id: string | null
          club_id: string
          created_at: string
          error: string | null
          id: string
          online: boolean
          polled_at: string
          raw: Json
          signal_strength: number | null
          signal_unit: string | null
          total_bytes: number | null
          uptime_seconds: number | null
        }
        Insert: {
          bundle_id?: string | null
          club_id: string
          created_at?: string
          error?: string | null
          id?: string
          online?: boolean
          polled_at?: string
          raw?: Json
          signal_strength?: number | null
          signal_unit?: string | null
          total_bytes?: number | null
          uptime_seconds?: number | null
        }
        Update: {
          bundle_id?: string | null
          club_id?: string
          created_at?: string
          error?: string | null
          id?: string
          online?: boolean
          polled_at?: string
          raw?: Json
          signal_strength?: number | null
          signal_unit?: string | null
          total_bytes?: number | null
          uptime_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "club_router_polls_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "club_data_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_router_polls_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_rule_acceptances: {
        Row: {
          accepted_at: string
          club_id: string
          club_member_id: string | null
          created_at: string
          id: string
          statement: string
          user_id: string
          version: number
        }
        Insert: {
          accepted_at?: string
          club_id: string
          club_member_id?: string | null
          created_at?: string
          id?: string
          statement?: string
          user_id?: string
          version?: number
        }
        Update: {
          accepted_at?: string
          club_id?: string
          club_member_id?: string | null
          created_at?: string
          id?: string
          statement?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_rule_acceptances_club_id_fkey"
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
          ble_fallback_enabled: boolean
          club_id: string
          created_at: string
          fluss_api_token: string | null
          fluss_default_device_id: string | null
          gobook_api_password: string | null
          gobook_api_username: string | null
          id: string
          payment_gateway_credentials: Json | null
          payment_gateway_secret_key: string | null
          relay_device_type: string
          router_api_token: string | null
          router_password: string | null
          router_username: string | null
          sender_email: string | null
          sender_name: string | null
          shelly_auth_key: string | null
          shelly_ble_control_password: string | null
          shelly_door_ble_mac: string | null
          shelly_door_channel: number | null
          shelly_door_device_id: string | null
          shelly_door_pulse_ms: number | null
          shelly_server_url: string | null
          smtp_host: string | null
          smtp_pass: string | null
          smtp_port: number | null
          smtp_user: string | null
          updated_at: string
          whatsapp_account_sid: string | null
          whatsapp_auth_token: string | null
          whatsapp_from: string | null
          wifi_charge_enabled: boolean
          wifi_enabled: boolean
          wifi_fee_id: string | null
          wifi_hidden: boolean
          wifi_monthly_fee: number
          wifi_notes: string | null
          wifi_password: string | null
          wifi_security: string
          wifi_ssid: string | null
          wifi_visitors_allowed: boolean
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
          ble_fallback_enabled?: boolean
          club_id: string
          created_at?: string
          fluss_api_token?: string | null
          fluss_default_device_id?: string | null
          gobook_api_password?: string | null
          gobook_api_username?: string | null
          id?: string
          payment_gateway_credentials?: Json | null
          payment_gateway_secret_key?: string | null
          relay_device_type?: string
          router_api_token?: string | null
          router_password?: string | null
          router_username?: string | null
          sender_email?: string | null
          sender_name?: string | null
          shelly_auth_key?: string | null
          shelly_ble_control_password?: string | null
          shelly_door_ble_mac?: string | null
          shelly_door_channel?: number | null
          shelly_door_device_id?: string | null
          shelly_door_pulse_ms?: number | null
          shelly_server_url?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          updated_at?: string
          whatsapp_account_sid?: string | null
          whatsapp_auth_token?: string | null
          whatsapp_from?: string | null
          wifi_charge_enabled?: boolean
          wifi_enabled?: boolean
          wifi_fee_id?: string | null
          wifi_hidden?: boolean
          wifi_monthly_fee?: number
          wifi_notes?: string | null
          wifi_password?: string | null
          wifi_security?: string
          wifi_ssid?: string | null
          wifi_visitors_allowed?: boolean
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
          ble_fallback_enabled?: boolean
          club_id?: string
          created_at?: string
          fluss_api_token?: string | null
          fluss_default_device_id?: string | null
          gobook_api_password?: string | null
          gobook_api_username?: string | null
          id?: string
          payment_gateway_credentials?: Json | null
          payment_gateway_secret_key?: string | null
          relay_device_type?: string
          router_api_token?: string | null
          router_password?: string | null
          router_username?: string | null
          sender_email?: string | null
          sender_name?: string | null
          shelly_auth_key?: string | null
          shelly_ble_control_password?: string | null
          shelly_door_ble_mac?: string | null
          shelly_door_channel?: number | null
          shelly_door_device_id?: string | null
          shelly_door_pulse_ms?: number | null
          shelly_server_url?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          updated_at?: string
          whatsapp_account_sid?: string | null
          whatsapp_auth_token?: string | null
          whatsapp_from?: string | null
          wifi_charge_enabled?: boolean
          wifi_enabled?: boolean
          wifi_fee_id?: string | null
          wifi_hidden?: boolean
          wifi_monthly_fee?: number
          wifi_notes?: string | null
          wifi_password?: string | null
          wifi_security?: string
          wifi_ssid?: string | null
          wifi_visitors_allowed?: boolean
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
      club_subscription_baselines: {
        Row: {
          amount: number
          billing_cycle: string
          club_id: string
          created_at: string
          currency: string
          effective_from: string
          federation_id: string | null
          id: string
          member_count: number
          note: string | null
          region: string | null
          set_by: string | null
          set_by_name: string | null
        }
        Insert: {
          amount?: number
          billing_cycle?: string
          club_id: string
          created_at?: string
          currency?: string
          effective_from?: string
          federation_id?: string | null
          id?: string
          member_count: number
          note?: string | null
          region?: string | null
          set_by?: string | null
          set_by_name?: string | null
        }
        Update: {
          amount?: number
          billing_cycle?: string
          club_id?: string
          created_at?: string
          currency?: string
          effective_from?: string
          federation_id?: string | null
          id?: string
          member_count?: number
          note?: string | null
          region?: string | null
          set_by?: string | null
          set_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_subscription_baselines_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
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
          club_id: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          club_id?: string | null
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
          home_club_name?: string
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
      club_whatsapp_invoices: {
        Row: {
          club_id: string
          created_at: string
          currency: string
          id: string
          issued_at: string
          marketing_count: number
          message_count: number
          paid_at: string | null
          period_end: string
          period_start: string
          service_count: number
          status: string
          subtotal: number
          total: number
          updated_at: string
          utility_count: number
          vat_amount: number
        }
        Insert: {
          club_id: string
          created_at?: string
          currency?: string
          id?: string
          issued_at?: string
          marketing_count?: number
          message_count?: number
          paid_at?: string | null
          period_end: string
          period_start: string
          service_count?: number
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          utility_count?: number
          vat_amount?: number
        }
        Update: {
          club_id?: string
          created_at?: string
          currency?: string
          id?: string
          issued_at?: string
          marketing_count?: number
          message_count?: number
          paid_at?: string | null
          period_end?: string
          period_start?: string
          service_count?: number
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          utility_count?: number
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_whatsapp_invoices_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_wifi_subscriptions: {
        Row: {
          active: boolean
          auto_renew: boolean
          cancelled_at: string | null
          club_id: string
          club_member_id: string
          created_at: string
          current_period_end: string
          id: string
          last_billed_period: string | null
          monthly_fee: number
          started_at: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_renew?: boolean
          cancelled_at?: string | null
          club_id: string
          club_member_id: string
          created_at?: string
          current_period_end?: string
          id?: string
          last_billed_period?: string | null
          monthly_fee?: number
          started_at?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_renew?: boolean
          cancelled_at?: string | null
          club_id?: string
          club_member_id?: string
          created_at?: string
          current_period_end?: string
          id?: string
          last_billed_period?: string | null
          monthly_fee?: number
          started_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_wifi_subscriptions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_wifi_subscriptions_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: true
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          accepted_payment_methods: string[]
          address: string | null
          allow_annual_billing: boolean
          allow_biannual_billing: boolean
          annual_billing_request_note: string | null
          annual_billing_requested_at: string | null
          annual_billing_requested_by: string | null
          auto_number_existing_onboarding: boolean
          bar_account_tab_enabled: boolean
          bar_card_swipe_enabled: boolean
          bar_cash_enabled: boolean
          bar_pay_online_enabled: boolean
          baseline_amount: number | null
          baseline_currency: string | null
          baseline_cycle: string | null
          baseline_member_count: number | null
          baseline_set_at: string | null
          booking_last_slot_time: string
          booking_open_time: string
          booking_slot_minutes: number
          chairman_member_id: string | null
          challenge_levels_up: number | null
          champ_result_emails: boolean
          club_captain_member_id: string | null
          contact_person_name: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          currency_symbol: string
          door_auto_unlock_enabled: boolean
          door_auto_unlock_radius_m: number
          door_geofence_enabled: boolean
          door_geofence_radius_m: number
          door_latitude: number | null
          door_longitude: number | null
          dynamic_court_reflow_enabled: boolean
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
          gateway_fee_pct_capitec: number | null
          gateway_fee_pct_card_intl: number | null
          gateway_fee_pct_card_local: number | null
          gateway_fee_pct_wallet: number | null
          gobook_api_enabled: boolean
          gobook_provider_id: number | null
          gobook_service_id: number | null
          gobook_url: string | null
          honesty_bar_enabled: boolean
          host_cleaning_fee_cents_per_day: number
          host_court_fee_cents_per_hour: number
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
          member_activation_mode: string
          member_fee_annual: number | null
          member_fee_due_month: number | null
          member_number_length: number | null
          member_number_prefix: string | null
          member_number_start: number | null
          min_booking_balance: number | null
          mixed_ladder_enabled: boolean
          name: string
          next_invoice_seq: number
          nsa_club_id: string | null
          participation_active: boolean
          payment_gateway: string | null
          payment_gateway_fee_percent: number | null
          payment_gateway_public_key: string | null
          payment_gateways: string[]
          peak_weekday_end: string
          peak_weekday_start: string
          peak_weekend_end: string
          peak_weekend_start: string
          phone: string | null
          points_base_win: number
          points_favourite_win_min: number
          points_from_challenges: boolean
          points_from_leagues: boolean
          points_from_tournaments: boolean
          points_loser_deduction: number
          points_upset_bonus_per_rank: number
          public_applications_enabled: boolean
          ranking_points_enabled: boolean
          roster_seeded_at: string | null
          secretary_member_id: string | null
          shelly_integration_enabled: boolean
          shelly_supply_mode: string | null
          show_delegates_on_landing: boolean
          sla_accepted_at: string | null
          sla_accepted_by: string | null
          sla_accepted_name: string | null
          sla_accepted_role: string | null
          sla_billing_option: string | null
          sla_payment_method: string | null
          sla_version: string | null
          subdomain: string | null
          suspension_rules: Json
          tenant_type: string
          treasurer_member_id: string | null
          updated_at: string
          uses_gobook: boolean
          variance_threshold_pct: number | null
          visitor_booking_fee: number
          visitor_home_clubs_enabled: boolean
          visitors_access_control: boolean
          visitors_can_book: boolean
          whatsapp_enabled: boolean
          whatsapp_opted_in_at: string | null
          whatsapp_opted_in_by: string | null
          whatsapp_rate_override: number | null
          whatsapp_sender_mode: string
        }
        Insert: {
          accepted_payment_methods?: string[]
          address?: string | null
          allow_annual_billing?: boolean
          allow_biannual_billing?: boolean
          annual_billing_request_note?: string | null
          annual_billing_requested_at?: string | null
          annual_billing_requested_by?: string | null
          auto_number_existing_onboarding?: boolean
          bar_account_tab_enabled?: boolean
          bar_card_swipe_enabled?: boolean
          bar_cash_enabled?: boolean
          bar_pay_online_enabled?: boolean
          baseline_amount?: number | null
          baseline_currency?: string | null
          baseline_cycle?: string | null
          baseline_member_count?: number | null
          baseline_set_at?: string | null
          booking_last_slot_time?: string
          booking_open_time?: string
          booking_slot_minutes?: number
          chairman_member_id?: string | null
          challenge_levels_up?: number | null
          champ_result_emails?: boolean
          club_captain_member_id?: string | null
          contact_person_name?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          currency_symbol?: string
          door_auto_unlock_enabled?: boolean
          door_auto_unlock_radius_m?: number
          door_geofence_enabled?: boolean
          door_geofence_radius_m?: number
          door_latitude?: number | null
          door_longitude?: number | null
          dynamic_court_reflow_enabled?: boolean
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
          gateway_fee_pct_capitec?: number | null
          gateway_fee_pct_card_intl?: number | null
          gateway_fee_pct_card_local?: number | null
          gateway_fee_pct_wallet?: number | null
          gobook_api_enabled?: boolean
          gobook_provider_id?: number | null
          gobook_service_id?: number | null
          gobook_url?: string | null
          honesty_bar_enabled?: boolean
          host_cleaning_fee_cents_per_day?: number
          host_court_fee_cents_per_hour?: number
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
          member_activation_mode?: string
          member_fee_annual?: number | null
          member_fee_due_month?: number | null
          member_number_length?: number | null
          member_number_prefix?: string | null
          member_number_start?: number | null
          min_booking_balance?: number | null
          mixed_ladder_enabled?: boolean
          name: string
          next_invoice_seq?: number
          nsa_club_id?: string | null
          participation_active?: boolean
          payment_gateway?: string | null
          payment_gateway_fee_percent?: number | null
          payment_gateway_public_key?: string | null
          payment_gateways?: string[]
          peak_weekday_end?: string
          peak_weekday_start?: string
          peak_weekend_end?: string
          peak_weekend_start?: string
          phone?: string | null
          points_base_win?: number
          points_favourite_win_min?: number
          points_from_challenges?: boolean
          points_from_leagues?: boolean
          points_from_tournaments?: boolean
          points_loser_deduction?: number
          points_upset_bonus_per_rank?: number
          public_applications_enabled?: boolean
          ranking_points_enabled?: boolean
          roster_seeded_at?: string | null
          secretary_member_id?: string | null
          shelly_integration_enabled?: boolean
          shelly_supply_mode?: string | null
          show_delegates_on_landing?: boolean
          sla_accepted_at?: string | null
          sla_accepted_by?: string | null
          sla_accepted_name?: string | null
          sla_accepted_role?: string | null
          sla_billing_option?: string | null
          sla_payment_method?: string | null
          sla_version?: string | null
          subdomain?: string | null
          suspension_rules?: Json
          tenant_type?: string
          treasurer_member_id?: string | null
          updated_at?: string
          uses_gobook?: boolean
          variance_threshold_pct?: number | null
          visitor_booking_fee?: number
          visitor_home_clubs_enabled?: boolean
          visitors_access_control?: boolean
          visitors_can_book?: boolean
          whatsapp_enabled?: boolean
          whatsapp_opted_in_at?: string | null
          whatsapp_opted_in_by?: string | null
          whatsapp_rate_override?: number | null
          whatsapp_sender_mode?: string
        }
        Update: {
          accepted_payment_methods?: string[]
          address?: string | null
          allow_annual_billing?: boolean
          allow_biannual_billing?: boolean
          annual_billing_request_note?: string | null
          annual_billing_requested_at?: string | null
          annual_billing_requested_by?: string | null
          auto_number_existing_onboarding?: boolean
          bar_account_tab_enabled?: boolean
          bar_card_swipe_enabled?: boolean
          bar_cash_enabled?: boolean
          bar_pay_online_enabled?: boolean
          baseline_amount?: number | null
          baseline_currency?: string | null
          baseline_cycle?: string | null
          baseline_member_count?: number | null
          baseline_set_at?: string | null
          booking_last_slot_time?: string
          booking_open_time?: string
          booking_slot_minutes?: number
          chairman_member_id?: string | null
          challenge_levels_up?: number | null
          champ_result_emails?: boolean
          club_captain_member_id?: string | null
          contact_person_name?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          currency_symbol?: string
          door_auto_unlock_enabled?: boolean
          door_auto_unlock_radius_m?: number
          door_geofence_enabled?: boolean
          door_geofence_radius_m?: number
          door_latitude?: number | null
          door_longitude?: number | null
          dynamic_court_reflow_enabled?: boolean
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
          gateway_fee_pct_capitec?: number | null
          gateway_fee_pct_card_intl?: number | null
          gateway_fee_pct_card_local?: number | null
          gateway_fee_pct_wallet?: number | null
          gobook_api_enabled?: boolean
          gobook_provider_id?: number | null
          gobook_service_id?: number | null
          gobook_url?: string | null
          honesty_bar_enabled?: boolean
          host_cleaning_fee_cents_per_day?: number
          host_court_fee_cents_per_hour?: number
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
          member_activation_mode?: string
          member_fee_annual?: number | null
          member_fee_due_month?: number | null
          member_number_length?: number | null
          member_number_prefix?: string | null
          member_number_start?: number | null
          min_booking_balance?: number | null
          mixed_ladder_enabled?: boolean
          name?: string
          next_invoice_seq?: number
          nsa_club_id?: string | null
          participation_active?: boolean
          payment_gateway?: string | null
          payment_gateway_fee_percent?: number | null
          payment_gateway_public_key?: string | null
          payment_gateways?: string[]
          peak_weekday_end?: string
          peak_weekday_start?: string
          peak_weekend_end?: string
          peak_weekend_start?: string
          phone?: string | null
          points_base_win?: number
          points_favourite_win_min?: number
          points_from_challenges?: boolean
          points_from_leagues?: boolean
          points_from_tournaments?: boolean
          points_loser_deduction?: number
          points_upset_bonus_per_rank?: number
          public_applications_enabled?: boolean
          ranking_points_enabled?: boolean
          roster_seeded_at?: string | null
          secretary_member_id?: string | null
          shelly_integration_enabled?: boolean
          shelly_supply_mode?: string | null
          show_delegates_on_landing?: boolean
          sla_accepted_at?: string | null
          sla_accepted_by?: string | null
          sla_accepted_name?: string | null
          sla_accepted_role?: string | null
          sla_billing_option?: string | null
          sla_payment_method?: string | null
          sla_version?: string | null
          subdomain?: string | null
          suspension_rules?: Json
          tenant_type?: string
          treasurer_member_id?: string | null
          updated_at?: string
          uses_gobook?: boolean
          variance_threshold_pct?: number | null
          visitor_booking_fee?: number
          visitor_home_clubs_enabled?: boolean
          visitors_access_control?: boolean
          visitors_can_book?: boolean
          whatsapp_enabled?: boolean
          whatsapp_opted_in_at?: string | null
          whatsapp_opted_in_by?: string | null
          whatsapp_rate_override?: number | null
          whatsapp_sender_mode?: string
        }
        Relationships: [
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
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_secretary_member_id_fkey"
            columns: ["secretary_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_treasurer_member_id_fkey"
            columns: ["treasurer_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      comms_campaigns: {
        Row: {
          action: Json
          audience_filter: Json
          audience_league_id: string | null
          audience_member_ids: string[]
          audience_type: string
          channels: string[]
          club_id: string
          content: Json
          created_at: string
          created_by: string | null
          failed_count: number
          id: string
          last_error: string | null
          name: string
          scheduled_for: string | null
          secondary_action: Json | null
          sent_at: string | null
          sent_count: number
          skipped_count: number
          started_at: string | null
          status: string
          template_id: string | null
          total_recipients: number
          updated_at: string
        }
        Insert: {
          action?: Json
          audience_filter?: Json
          audience_league_id?: string | null
          audience_member_ids?: string[]
          audience_type?: string
          channels?: string[]
          club_id: string
          content?: Json
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          last_error?: string | null
          name?: string
          scheduled_for?: string | null
          secondary_action?: Json | null
          sent_at?: string | null
          sent_count?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          template_id?: string | null
          total_recipients?: number
          updated_at?: string
        }
        Update: {
          action?: Json
          audience_filter?: Json
          audience_league_id?: string | null
          audience_member_ids?: string[]
          audience_type?: string
          channels?: string[]
          club_id?: string
          content?: Json
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          last_error?: string | null
          name?: string
          scheduled_for?: string | null
          secondary_action?: Json | null
          sent_at?: string | null
          sent_count?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          template_id?: string | null
          total_recipients?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comms_campaigns_audience_league_id_fkey"
            columns: ["audience_league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comms_campaigns_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comms_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "comms_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      comms_deliveries: {
        Row: {
          campaign_id: string
          channel: string
          club_id: string
          club_member_id: string | null
          created_at: string
          error_message: string | null
          id: string
          recipient_name: string | null
          sent_at: string | null
          status: string
          target: string | null
        }
        Insert: {
          campaign_id: string
          channel: string
          club_id: string
          club_member_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          target?: string | null
        }
        Update: {
          campaign_id?: string
          channel?: string
          club_id?: string
          club_member_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comms_deliveries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "comms_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comms_deliveries_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      comms_template_versions: {
        Row: {
          body: string
          channel: string
          content_sid: string | null
          created_at: string
          id: string
          subject: string
          template_id: string
          updated_at: string
        }
        Insert: {
          body?: string
          channel: string
          content_sid?: string | null
          created_at?: string
          id?: string
          subject?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          content_sid?: string | null
          created_at?: string
          id?: string
          subject?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comms_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "comms_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      comms_templates: {
        Row: {
          action: Json
          category: string
          club_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          secondary_action: Json | null
          updated_at: string
        }
        Insert: {
          action?: Json
          category?: string
          club_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          secondary_action?: Json | null
          updated_at?: string
        }
        Update: {
          action?: Json
          category?: string
          club_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          secondary_action?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comms_templates_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      court_reflow_log: {
        Row: {
          club_id: string | null
          created_at: string
          fixture_date: string | null
          from_court_id: number | null
          from_start_time: string | null
          id: string
          moved_id: string
          moved_kind: string
          reason: string | null
          source_id: string
          source_kind: string
          to_court_id: number | null
          to_start_time: string | null
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          fixture_date?: string | null
          from_court_id?: number | null
          from_start_time?: string | null
          id?: string
          moved_id: string
          moved_kind: string
          reason?: string | null
          source_id: string
          source_kind: string
          to_court_id?: number | null
          to_start_time?: string | null
        }
        Update: {
          club_id?: string | null
          created_at?: string
          fixture_date?: string | null
          from_court_id?: number | null
          from_start_time?: string | null
          id?: string
          moved_id?: string
          moved_kind?: string
          reason?: string | null
          source_id?: string
          source_kind?: string
          to_court_id?: number | null
          to_start_time?: string | null
        }
        Relationships: []
      }
      courts: {
        Row: {
          club_id: string | null
          fluss_device_id: string | null
          id: number
          is_external: boolean
          name: string
          relay_ble_mac: string | null
          relay_channel: number
          relay_device_id: string | null
          relay_server: string | null
          venue_name: string | null
        }
        Insert: {
          club_id?: string | null
          fluss_device_id?: string | null
          id?: number
          is_external?: boolean
          name: string
          relay_ble_mac?: string | null
          relay_channel?: number
          relay_device_id?: string | null
          relay_server?: string | null
          venue_name?: string | null
        }
        Update: {
          club_id?: string | null
          fluss_device_id?: string | null
          id?: number
          is_external?: boolean
          name?: string
          relay_ble_mac?: string | null
          relay_channel?: number
          relay_device_id?: string | null
          relay_server?: string | null
          venue_name?: string | null
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
      email_outbox: {
        Row: {
          attempts: number
          body: string
          cc_emails: string[] | null
          club_id: string
          club_member_id: string | null
          created_at: string
          created_by: string | null
          cta_label: string | null
          id: string
          kind: string
          last_error: string | null
          recipient_email: string
          recipient_name: string | null
          ref_id: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
          url: string | null
        }
        Insert: {
          attempts?: number
          body?: string
          cc_emails?: string[] | null
          club_id: string
          club_member_id?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          recipient_email: string
          recipient_name?: string | null
          ref_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          attempts?: number
          body?: string
          cc_emails?: string[] | null
          club_id?: string
          club_member_id?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          recipient_email?: string
          recipient_name?: string | null
          ref_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox_state: {
        Row: {
          id: boolean
          lease_until: string | null
          paused: boolean
          updated_at: string
        }
        Insert: {
          id?: boolean
          lease_until?: string | null
          paused?: boolean
          updated_at?: string
        }
        Update: {
          id?: boolean
          lease_until?: string | null
          paused?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          club_id: string | null
          context: Json | null
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
          club_id?: string | null
          context?: Json | null
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
          club_id?: string | null
          context?: Json | null
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
          max_emails_per_hour: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          max_emails_per_hour?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          max_emails_per_hour?: number
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
      external_ids: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          external_id: string
          id: string
          source_metadata: Json
          source_system: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          external_id: string
          id?: string
          source_metadata?: Json
          source_system: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          external_id?: string
          id?: string
          source_metadata?: Json
          source_system?: string
          updated_at?: string
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
      help_videos: {
        Row: {
          category: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          is_active: boolean
          provider: string
          role_tag: string
          sort_order: number
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_id: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean
          provider?: string
          role_tag?: string
          sort_order?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean
          provider?: string
          role_tag?: string
          sort_order?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_id?: string
        }
        Relationships: []
      }
      impersonation_log: {
        Row: {
          admin_user_id: string
          club_id: string | null
          created_at: string
          id: string
          target_club_member_id: string | null
          target_user_id: string
        }
        Insert: {
          admin_user_id: string
          club_id?: string | null
          created_at?: string
          id?: string
          target_club_member_id?: string | null
          target_user_id: string
        }
        Update: {
          admin_user_id?: string
          club_id?: string | null
          created_at?: string
          id?: string
          target_club_member_id?: string | null
          target_user_id?: string
        }
        Relationships: []
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
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      ladder_configs: {
        Row: {
          accept_deadline_hours: number
          activated_at: string | null
          affects_club_ranking: boolean
          challenge_levels_up: number
          club_id: string
          complete_deadline_days: number
          created_at: string
          format: string
          id: string
          is_active: boolean
          ladder_auto_apply: boolean
          ladder_from_leagues: boolean
          ladder_from_tournaments: boolean
          league_movement_policy: string | null
          max_active_incoming: number
          max_active_outgoing: number
          movement_policy: string
          pyramid_row_sizes: Json | null
          ranking_auto_approve: boolean
          ranking_mirror_margin: number
          ranking_sync_mode: string
          rematch_cooldown_days: number
          tournament_movement_policy: string | null
          updated_at: string
        }
        Insert: {
          accept_deadline_hours?: number
          activated_at?: string | null
          affects_club_ranking?: boolean
          challenge_levels_up?: number
          club_id: string
          complete_deadline_days?: number
          created_at?: string
          format?: string
          id?: string
          is_active?: boolean
          ladder_auto_apply?: boolean
          ladder_from_leagues?: boolean
          ladder_from_tournaments?: boolean
          league_movement_policy?: string | null
          max_active_incoming?: number
          max_active_outgoing?: number
          movement_policy?: string
          pyramid_row_sizes?: Json | null
          ranking_auto_approve?: boolean
          ranking_mirror_margin?: number
          ranking_sync_mode?: string
          rematch_cooldown_days?: number
          tournament_movement_policy?: string | null
          updated_at?: string
        }
        Update: {
          accept_deadline_hours?: number
          activated_at?: string | null
          affects_club_ranking?: boolean
          challenge_levels_up?: number
          club_id?: string
          complete_deadline_days?: number
          created_at?: string
          format?: string
          id?: string
          is_active?: boolean
          ladder_auto_apply?: boolean
          ladder_from_leagues?: boolean
          ladder_from_tournaments?: boolean
          league_movement_policy?: string | null
          max_active_incoming?: number
          max_active_outgoing?: number
          movement_policy?: string
          pyramid_row_sizes?: Json | null
          ranking_auto_approve?: boolean
          ranking_mirror_margin?: number
          ranking_sync_mode?: string
          rematch_cooldown_days?: number
          tournament_movement_policy?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ladder_configs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      ladder_moves_pending: {
        Row: {
          club_id: string
          created_at: string
          id: string
          loser_member_id: string
          loser_position: number | null
          movement: string
          reviewed_at: string | null
          reviewed_by: string | null
          source: string | null
          source_id: string | null
          status: string
          updated_at: string
          winner_member_id: string
          winner_position: number | null
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          loser_member_id: string
          loser_position?: number | null
          movement?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          source_id?: string | null
          status?: string
          updated_at?: string
          winner_member_id: string
          winner_position?: number | null
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          loser_member_id?: string
          loser_position?: number | null
          movement?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          source_id?: string | null
          status?: string
          updated_at?: string
          winner_member_id?: string
          winner_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ladder_moves_pending_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ladder_moves_pending_loser_member_id_fkey"
            columns: ["loser_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ladder_moves_pending_winner_member_id_fkey"
            columns: ["winner_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      league_association_national_bodies: {
        Row: {
          active: boolean
          created_at: string
          id: string
          league_association_id: string
          national_body_fee_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          league_association_id: string
          national_body_fee_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          league_association_id?: string
          national_body_fee_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_association_national_bodies_league_association_id_fkey"
            columns: ["league_association_id"]
            isOneToOne: false
            referencedRelation: "association_member_affiliations_v"
            referencedColumns: ["league_association_id"]
          },
          {
            foreignKeyName: "league_association_national_bodies_league_association_id_fkey"
            columns: ["league_association_id"]
            isOneToOne: false
            referencedRelation: "league_associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_association_national_bodies_national_body_fee_id_fkey"
            columns: ["national_body_fee_id"]
            isOneToOne: false
            referencedRelation: "national_body_fees"
            referencedColumns: ["id"]
          },
        ]
      }
      league_associations: {
        Row: {
          abbreviation: string | null
          active: boolean
          affects_ladder: boolean
          category: string | null
          club_id: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          debit_order_eligible: boolean
          debit_order_rail: string
          discipline: string
          due_day: number
          external_club_id: string | null
          external_source: string | null
          fee_annual: number | null
          fee_class: string
          fee_due_month: number | null
          fee_payable_to: string | null
          fee_payment_details: string | null
          fill_up_leagues_enabled: boolean | null
          id: string
          members_pay_directly: boolean
          name: string
          platform_association_id: string | null
          pro_rate: boolean
          require_mixed_pair: boolean
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
          category?: string | null
          club_id: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          debit_order_eligible?: boolean
          debit_order_rail?: string
          discipline?: string
          due_day?: number
          external_club_id?: string | null
          external_source?: string | null
          fee_annual?: number | null
          fee_class?: string
          fee_due_month?: number | null
          fee_payable_to?: string | null
          fee_payment_details?: string | null
          fill_up_leagues_enabled?: boolean | null
          id?: string
          members_pay_directly?: boolean
          name: string
          platform_association_id?: string | null
          pro_rate?: boolean
          require_mixed_pair?: boolean
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
          category?: string | null
          club_id?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          debit_order_eligible?: boolean
          debit_order_rail?: string
          discipline?: string
          due_day?: number
          external_club_id?: string | null
          external_source?: string | null
          fee_annual?: number | null
          fee_class?: string
          fee_due_month?: number | null
          fee_payable_to?: string | null
          fee_payment_details?: string | null
          fill_up_leagues_enabled?: boolean | null
          id?: string
          members_pay_directly?: boolean
          name?: string
          platform_association_id?: string | null
          pro_rate?: boolean
          require_mixed_pair?: boolean
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
          pair_id: string | null
          partner_member_id: string | null
          position: number
          rubber_type: string
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
          pair_id?: string | null
          partner_member_id?: string | null
          position: number
          rubber_type?: string
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
          pair_id?: string | null
          partner_member_id?: string | null
          position?: number
          rubber_type?: string
          updated_at?: string
        }
        Relationships: [
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
          {
            foreignKeyName: "league_fixture_lineups_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "league_team_pairs"
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
          lineup_confirmed_at: string | null
          lineup_confirmed_by: string | null
          match_format: Json | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          totals_locked: boolean
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
          lineup_confirmed_at?: string | null
          lineup_confirmed_by?: string | null
          match_format?: Json | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          totals_locked?: boolean
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
          lineup_confirmed_at?: string | null
          lineup_confirmed_by?: string | null
          match_format?: Json | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          totals_locked?: boolean
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
          away_player_member_id: string | null
          away_player_name: string | null
          away_player2_code: string | null
          away_player2_member_id: string | null
          away_player2_name: string | null
          created_at: string
          current_game: Json | null
          fixture_id: string
          forfeit_side: string | null
          game_scores: Json | null
          home_games_won: number
          home_player_code: string | null
          home_player_member_id: string | null
          home_player_name: string | null
          home_player2_code: string | null
          home_player2_member_id: string | null
          home_player2_name: string | null
          id: string
          is_forfeit: boolean
          lineup_set_at: string | null
          lineup_set_by: string | null
          participants_locked_at: string | null
          position: number
          rubber_type: string
          updated_at: string
          winner: string | null
        }
        Insert: {
          away_games_won?: number
          away_player_code?: string | null
          away_player_member_id?: string | null
          away_player_name?: string | null
          away_player2_code?: string | null
          away_player2_member_id?: string | null
          away_player2_name?: string | null
          created_at?: string
          current_game?: Json | null
          fixture_id: string
          forfeit_side?: string | null
          game_scores?: Json | null
          home_games_won?: number
          home_player_code?: string | null
          home_player_member_id?: string | null
          home_player_name?: string | null
          home_player2_code?: string | null
          home_player2_member_id?: string | null
          home_player2_name?: string | null
          id?: string
          is_forfeit?: boolean
          lineup_set_at?: string | null
          lineup_set_by?: string | null
          participants_locked_at?: string | null
          position: number
          rubber_type?: string
          updated_at?: string
          winner?: string | null
        }
        Update: {
          away_games_won?: number
          away_player_code?: string | null
          away_player_member_id?: string | null
          away_player_name?: string | null
          away_player2_code?: string | null
          away_player2_member_id?: string | null
          away_player2_name?: string | null
          created_at?: string
          current_game?: Json | null
          fixture_id?: string
          forfeit_side?: string | null
          game_scores?: Json | null
          home_games_won?: number
          home_player_code?: string | null
          home_player_member_id?: string | null
          home_player_name?: string | null
          home_player2_code?: string | null
          home_player2_member_id?: string | null
          home_player2_name?: string | null
          id?: string
          is_forfeit?: boolean
          lineup_set_at?: string | null
          lineup_set_by?: string | null
          participants_locked_at?: string | null
          position?: number
          rubber_type?: string
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
      league_participant_corrections: {
        Row: {
          corrected_by: string | null
          created_at: string
          fixture_id: string
          id: string
          new_player_code: string | null
          new_player_name: string | null
          old_player_code: string | null
          old_player_name: string | null
          position: number
          reason: string | null
          side: string
        }
        Insert: {
          corrected_by?: string | null
          created_at?: string
          fixture_id: string
          id?: string
          new_player_code?: string | null
          new_player_name?: string | null
          old_player_code?: string | null
          old_player_name?: string | null
          position: number
          reason?: string | null
          side: string
        }
        Update: {
          corrected_by?: string | null
          created_at?: string
          fixture_id?: string
          id?: string
          new_player_code?: string | null
          new_player_name?: string | null
          old_player_code?: string | null
          old_player_name?: string | null
          position?: number
          reason?: string | null
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_participant_corrections_fixture_id_fkey"
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
          season_id: string | null
          skip_dates: string[]
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
          season_id?: string | null
          skip_dates?: string[]
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
          season_id?: string | null
          skip_dates?: string[]
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
          {
            foreignKeyName: "league_rounds_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      league_rules: {
        Row: {
          allow_dual_participation: boolean
          allow_multi_fixture_per_night: boolean
          allow_multi_team_registration: boolean
          association_id: string | null
          bonus_points_mode: string
          bonus_points_value: number
          club_id: string | null
          created_at: string
          cross_gender_subs_allowed: boolean
          doubles_rubbers: number | null
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
          pairing_policy: string
          points_per_game: number | null
          reserves_per_team: number | null
          share_bonus_on_tie: boolean
          singles_rubbers: number | null
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
          allow_dual_participation?: boolean
          allow_multi_fixture_per_night?: boolean
          allow_multi_team_registration?: boolean
          association_id?: string | null
          bonus_points_mode?: string
          bonus_points_value?: number
          club_id?: string | null
          created_at?: string
          cross_gender_subs_allowed?: boolean
          doubles_rubbers?: number | null
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
          pairing_policy?: string
          points_per_game?: number | null
          reserves_per_team?: number | null
          share_bonus_on_tie?: boolean
          singles_rubbers?: number | null
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
          allow_dual_participation?: boolean
          allow_multi_fixture_per_night?: boolean
          allow_multi_team_registration?: boolean
          association_id?: string | null
          bonus_points_mode?: string
          bonus_points_value?: number
          club_id?: string | null
          created_at?: string
          cross_gender_subs_allowed?: boolean
          doubles_rubbers?: number | null
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
          pairing_policy?: string
          points_per_game?: number | null
          reserves_per_team?: number | null
          share_bonus_on_tie?: boolean
          singles_rubbers?: number | null
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
      league_seasons: {
        Row: {
          association_id: string | null
          club_id: string | null
          created_at: string
          ends_on: string | null
          id: string
          is_current: boolean
          label: string
          platform_association_id: string | null
          season_year: number
          starts_on: string | null
          status: string
          updated_at: string
        }
        Insert: {
          association_id?: string | null
          club_id?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          is_current?: boolean
          label: string
          platform_association_id?: string | null
          season_year: number
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          association_id?: string | null
          club_id?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          is_current?: boolean
          label?: string
          platform_association_id?: string | null
          season_year?: number
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_seasons_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "association_member_affiliations_v"
            referencedColumns: ["league_association_id"]
          },
          {
            foreignKeyName: "league_seasons_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "league_associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_seasons_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_seasons_platform_association_id_fkey"
            columns: ["platform_association_id"]
            isOneToOne: false
            referencedRelation: "platform_league_associations"
            referencedColumns: ["id"]
          },
        ]
      }
      league_team_pairs: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          league_id: string
          pair_label: string | null
          pair_order: number | null
          player_one_member_id: string
          player_two_member_id: string
          season_id: string | null
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          league_id: string
          pair_label?: string | null
          pair_order?: number | null
          player_one_member_id: string
          player_two_member_id: string
          season_id?: string | null
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          league_id?: string
          pair_label?: string | null
          pair_order?: number | null
          player_one_member_id?: string
          player_two_member_id?: string
          season_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_team_pairs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_team_pairs_player_one_member_id_fkey"
            columns: ["player_one_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_team_pairs_player_two_member_id_fkey"
            columns: ["player_two_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_team_pairs_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
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
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          affects_ranking_points: boolean
          allow_cross_gender_guests: boolean
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          association_id: string | null
          captain_member_id: string | null
          category: string | null
          club_id: string
          code: string | null
          created_at: string
          created_by_association_id: string | null
          division: string | null
          id: string
          is_reserve: boolean | null
          level: number | null
          level_source: string | null
          logo_url: string | null
          name: string
          nsa_team_code: string | null
          nsa_team_id: string | null
          ranking_weight: number
          reserves_per_team: number
          season_id: string | null
          season_source: string | null
          season_year: number | null
          updated_at: string
        }
        Insert: {
          affects_ranking_points?: boolean
          allow_cross_gender_guests?: boolean
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          association_id?: string | null
          captain_member_id?: string | null
          category?: string | null
          club_id: string
          code?: string | null
          created_at?: string
          created_by_association_id?: string | null
          division?: string | null
          id?: string
          is_reserve?: boolean | null
          level?: number | null
          level_source?: string | null
          logo_url?: string | null
          name: string
          nsa_team_code?: string | null
          nsa_team_id?: string | null
          ranking_weight?: number
          reserves_per_team?: number
          season_id?: string | null
          season_source?: string | null
          season_year?: number | null
          updated_at?: string
        }
        Update: {
          affects_ranking_points?: boolean
          allow_cross_gender_guests?: boolean
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          association_id?: string | null
          captain_member_id?: string | null
          category?: string | null
          club_id?: string
          code?: string | null
          created_at?: string
          created_by_association_id?: string | null
          division?: string | null
          id?: string
          is_reserve?: boolean | null
          level?: number | null
          level_source?: string | null
          logo_url?: string | null
          name?: string
          nsa_team_code?: string | null
          nsa_team_id?: string | null
          ranking_weight?: number
          reserves_per_team?: number
          season_id?: string | null
          season_source?: string | null
          season_year?: number | null
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
          {
            foreignKeyName: "leagues_created_by_association_id_fkey"
            columns: ["created_by_association_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after_json: Json | null
          before_json: Json | null
          club_id: string
          created_at: string
          id: string
          journal_ref: string
          note: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          club_id: string
          created_at?: string
          id?: string
          journal_ref: string
          note?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          club_id?: string
          created_at?: string
          id?: string
          journal_ref?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_audit_log_club_id_fkey"
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
          purpose: string
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
          purpose?: string
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
          purpose?: string
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
      match_correction_requests: {
        Row: {
          created_at: string
          id: string
          match_id: string
          proposed_game_scores: string | null
          proposed_score: string | null
          proposed_winner_member_id: string | null
          reason: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          proposed_game_scores?: string | null
          proposed_score?: string | null
          proposed_winner_member_id?: string | null
          reason: string
          requested_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          proposed_game_scores?: string | null
          proposed_score?: string | null
          proposed_winner_member_id?: string | null
          reason?: string
          requested_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_correction_requests_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "club_champs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_correction_requests_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
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
            referencedRelation: "club_members"
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
            referencedRelation: "club_members"
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
      member_account_delegations: {
        Row: {
          club_id: string
          created_at: string
          delegate_member_id: string
          grantor_member_id: string
          id: string
          requested_at: string
          requested_by_user_id: string | null
          responded_at: string | null
          revoked_at: string | null
          revoked_by_user_id: string | null
          scope: string
          status: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          delegate_member_id: string
          grantor_member_id: string
          id?: string
          requested_at?: string
          requested_by_user_id?: string | null
          responded_at?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          scope?: string
          status?: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          delegate_member_id?: string
          grantor_member_id?: string
          id?: string
          requested_at?: string
          requested_by_user_id?: string | null
          responded_at?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          scope?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_account_delegations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_account_delegations_delegate_member_id_fkey"
            columns: ["delegate_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_account_delegations_grantor_member_id_fkey"
            columns: ["grantor_member_id"]
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
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_fee_categories: {
        Row: {
          active: boolean
          annual_fee: number
          billing_period: string
          club_id: string
          created_at: string
          debit_order_eligible: boolean
          debit_order_rail: string
          description: string | null
          due_day: number
          due_month: number
          fee_class: string
          id: string
          name: string
          pro_rate: boolean
          recurring_debit_day: number | null
          recurring_enabled: boolean
          recurring_rails: string[]
          show_on_landing: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          annual_fee?: number
          billing_period?: string
          club_id: string
          created_at?: string
          debit_order_eligible?: boolean
          debit_order_rail?: string
          description?: string | null
          due_day?: number
          due_month?: number
          fee_class?: string
          id?: string
          name: string
          pro_rate?: boolean
          recurring_debit_day?: number | null
          recurring_enabled?: boolean
          recurring_rails?: string[]
          show_on_landing?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          annual_fee?: number
          billing_period?: string
          club_id?: string
          created_at?: string
          debit_order_eligible?: boolean
          debit_order_rail?: string
          description?: string | null
          due_day?: number
          due_month?: number
          fee_class?: string
          id?: string
          name?: string
          pro_rate?: boolean
          recurring_debit_day?: number | null
          recurring_enabled?: boolean
          recurring_rails?: string[]
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
          shadow_division: number | null
          shadow_player_rank: number | null
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
          shadow_division?: number | null
          shadow_player_rank?: number | null
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
          shadow_division?: number | null
          shadow_player_rank?: number | null
          ssa_number?: string | null
          updated_at?: string
        }
        Relationships: [
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
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_suspension_log: {
        Row: {
          automatic: boolean
          changed_by: string | null
          club_id: string
          club_member_id: string
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["member_suspension_status"]
          outstanding: number | null
          previous_status:
            | Database["public"]["Enums"]["member_suspension_status"]
            | null
          reason: string | null
        }
        Insert: {
          automatic?: boolean
          changed_by?: string | null
          club_id: string
          club_member_id: string
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["member_suspension_status"]
          outstanding?: number | null
          previous_status?:
            | Database["public"]["Enums"]["member_suspension_status"]
            | null
          reason?: string | null
        }
        Update: {
          automatic?: boolean
          changed_by?: string | null
          club_id?: string
          club_member_id?: string
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["member_suspension_status"]
          outstanding?: number | null
          previous_status?:
            | Database["public"]["Enums"]["member_suspension_status"]
            | null
          reason?: string | null
        }
        Relationships: []
      }
      national_body_fees: {
        Row: {
          abbreviation: string | null
          active: boolean
          billing_period: string
          body_name: string
          club_id: string
          created_at: string
          debit_order_eligible: boolean
          debit_order_rail: string
          due_day: number
          fee_annual: number | null
          fee_class: string
          fee_due_month: number | null
          fee_payable_to: string | null
          fee_payment_details: string | null
          fee_type: string
          id: string
          pro_rate: boolean
          show_on_landing: boolean
          updated_at: string
        }
        Insert: {
          abbreviation?: string | null
          active?: boolean
          billing_period?: string
          body_name?: string
          club_id: string
          created_at?: string
          debit_order_eligible?: boolean
          debit_order_rail?: string
          due_day?: number
          fee_annual?: number | null
          fee_class?: string
          fee_due_month?: number | null
          fee_payable_to?: string | null
          fee_payment_details?: string | null
          fee_type?: string
          id?: string
          pro_rate?: boolean
          show_on_landing?: boolean
          updated_at?: string
        }
        Update: {
          abbreviation?: string | null
          active?: boolean
          billing_period?: string
          body_name?: string
          club_id?: string
          created_at?: string
          debit_order_eligible?: boolean
          debit_order_rail?: string
          due_day?: number
          fee_annual?: number | null
          fee_class?: string
          fee_due_month?: number | null
          fee_payable_to?: string | null
          fee_payment_details?: string | null
          fee_type?: string
          id?: string
          pro_rate?: boolean
          show_on_landing?: boolean
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
      national_licence_products: {
        Row: {
          active: boolean
          amount: number
          billing_enabled: boolean
          code: string
          created_at: string
          id: string
          name: string
          org_id: string
          season_year: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number
          billing_enabled?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          org_id: string
          season_year: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          billing_enabled?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          season_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "national_licence_products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
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
          opponent_code: string | null
          opponent_name: string | null
          player_code: string
          player_name: string | null
          points_against: number | null
          points_for: number | null
          position: number
          round: number | null
          rubbers_against: number | null
          rubbers_for: number | null
          scraped_at: string
          season_code: string | null
          season_year: number | null
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
          opponent_code?: string | null
          opponent_name?: string | null
          player_code: string
          player_name?: string | null
          points_against?: number | null
          points_for?: number | null
          position: number
          round?: number | null
          rubbers_against?: number | null
          rubbers_for?: number | null
          scraped_at?: string
          season_code?: string | null
          season_year?: number | null
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
          opponent_code?: string | null
          opponent_name?: string | null
          player_code?: string
          player_name?: string | null
          points_against?: number | null
          points_for?: number | null
          position?: number
          round?: number | null
          rubbers_against?: number | null
          rubbers_for?: number | null
          scraped_at?: string
          season_code?: string | null
          season_year?: number | null
          team_code?: string
          won?: boolean | null
        }
        Relationships: []
      }
      nsa_sync_issues: {
        Row: {
          created_at: string
          external_ref: string | null
          id: string
          issue_type: string
          label: string | null
          payload: Json
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          run_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_ref?: string | null
          id?: string
          issue_type: string
          label?: string | null
          payload?: Json
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_ref?: string | null
          id?: string
          issue_type?: string
          label?: string | null
          payload?: Json
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nsa_sync_issues_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "nsa_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      nsa_sync_runs: {
        Row: {
          association_id: string | null
          created_at: string
          created_count: number
          details: Json
          error_count: number
          finished_at: string | null
          id: string
          kind: string
          season_code: string | null
          season_year: number | null
          seen_count: number
          skipped_count: number
          started_at: string
          status: string
          triggered_by: string | null
          updated_at: string
          updated_count: number
        }
        Insert: {
          association_id?: string | null
          created_at?: string
          created_count?: number
          details?: Json
          error_count?: number
          finished_at?: string | null
          id?: string
          kind: string
          season_code?: string | null
          season_year?: number | null
          seen_count?: number
          skipped_count?: number
          started_at?: string
          status?: string
          triggered_by?: string | null
          updated_at?: string
          updated_count?: number
        }
        Update: {
          association_id?: string | null
          created_at?: string
          created_count?: number
          details?: Json
          error_count?: number
          finished_at?: string | null
          id?: string
          kind?: string
          season_code?: string | null
          season_year?: number | null
          seen_count?: number
          skipped_count?: number
          started_at?: string
          status?: string
          triggered_by?: string | null
          updated_at?: string
          updated_count?: number
        }
        Relationships: []
      }
      organisation_admins: {
        Row: {
          active: boolean
          created_at: string
          granted_by: string | null
          id: string
          notes: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_admin_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_admin_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["org_admin_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_admins_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_relationships: {
        Row: {
          child_org_id: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          parent_org_id: string
          relationship: string
          updated_at: string
        }
        Insert: {
          child_org_id: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          parent_org_id: string
          relationship?: string
          updated_at?: string
        }
        Update: {
          child_org_id?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          parent_org_id?: string
          relationship?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_relationships_child_org_id_fkey"
            columns: ["child_org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_relationships_parent_org_id_fkey"
            columns: ["parent_org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_settings: {
        Row: {
          created_at: string
          default_association_fee_cents: number
          default_entry_fee_cents: number
          default_federation_fee_cents: number
          default_host_share_pct: number
          finance_contact_email: string | null
          finance_contact_name: string | null
          notes: string | null
          org_id: string
          payout_reference: string | null
          require_competitive_licence: boolean
          require_sanctioning: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_association_fee_cents?: number
          default_entry_fee_cents?: number
          default_federation_fee_cents?: number
          default_host_share_pct?: number
          finance_contact_email?: string | null
          finance_contact_name?: string | null
          notes?: string | null
          org_id: string
          payout_reference?: string | null
          require_competitive_licence?: boolean
          require_sanctioning?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_association_fee_cents?: number
          default_entry_fee_cents?: number
          default_federation_fee_cents?: number
          default_host_share_pct?: number
          finance_contact_email?: string | null
          finance_contact_name?: string | null
          notes?: string | null
          org_id?: string
          payout_reference?: string | null
          require_competitive_licence?: boolean
          require_sanctioning?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          abbreviation: string | null
          active: boolean
          club_id: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string
          created_at: string
          id: string
          is_internal_league: boolean
          kind: Database["public"]["Enums"]["org_kind"]
          league_association_id: string | null
          logo_url: string | null
          metadata: Json
          name: string
          platform_association_id: string | null
          slug: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          abbreviation?: string | null
          active?: boolean
          club_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          id?: string
          is_internal_league?: boolean
          kind: Database["public"]["Enums"]["org_kind"]
          league_association_id?: string | null
          logo_url?: string | null
          metadata?: Json
          name: string
          platform_association_id?: string | null
          slug?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          abbreviation?: string | null
          active?: boolean
          club_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          id?: string
          is_internal_league?: boolean
          kind?: Database["public"]["Enums"]["org_kind"]
          league_association_id?: string | null
          logo_url?: string | null
          metadata?: Json
          name?: string
          platform_association_id?: string | null
          slug?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organisations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisations_league_association_id_fkey"
            columns: ["league_association_id"]
            isOneToOne: false
            referencedRelation: "association_member_affiliations_v"
            referencedColumns: ["league_association_id"]
          },
          {
            foreignKeyName: "organisations_league_association_id_fkey"
            columns: ["league_association_id"]
            isOneToOne: false
            referencedRelation: "league_associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisations_platform_association_id_fkey"
            columns: ["platform_association_id"]
            isOneToOne: false
            referencedRelation: "platform_league_associations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_campaigns: {
        Row: {
          audience_filter: Json
          body_html: string
          created_at: string
          created_by: string | null
          daily_cap: number
          id: string
          last_run_at: string | null
          name: string
          preheader: string | null
          rate_window_hours: number
          send_delay_ms: number
          status: string
          subject: string
          updated_at: string
          video_desktop_url: string | null
          video_mobile_url: string | null
          video_thumb_url: string | null
        }
        Insert: {
          audience_filter?: Json
          body_html?: string
          created_at?: string
          created_by?: string | null
          daily_cap?: number
          id?: string
          last_run_at?: string | null
          name: string
          preheader?: string | null
          rate_window_hours?: number
          send_delay_ms?: number
          status?: string
          subject?: string
          updated_at?: string
          video_desktop_url?: string | null
          video_mobile_url?: string | null
          video_thumb_url?: string | null
        }
        Update: {
          audience_filter?: Json
          body_html?: string
          created_at?: string
          created_by?: string | null
          daily_cap?: number
          id?: string
          last_run_at?: string | null
          name?: string
          preheader?: string | null
          rate_window_hours?: number
          send_delay_ms?: number
          status?: string
          subject?: string
          updated_at?: string
          video_desktop_url?: string | null
          video_mobile_url?: string | null
          video_thumb_url?: string | null
        }
        Relationships: []
      }
      outreach_contacts: {
        Row: {
          bounced: boolean
          created_at: string
          email: string
          id: string
          is_primary: boolean
          name: string | null
          opted_out: boolean
          phone: string | null
          prospect_id: string
          role: string | null
          updated_at: string
        }
        Insert: {
          bounced?: boolean
          created_at?: string
          email: string
          id?: string
          is_primary?: boolean
          name?: string | null
          opted_out?: boolean
          phone?: string | null
          prospect_id: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          bounced?: boolean
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean
          name?: string | null
          opted_out?: boolean
          phone?: string | null
          prospect_id?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_contacts_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "outreach_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_events: {
        Row: {
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          event_type: string
          id: string
          recipient_id: string | null
          url: string | null
          user_agent: string | null
        }
        Insert: {
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          recipient_id?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          recipient_id?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "outreach_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "outreach_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_links: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          label: string | null
          target_url: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          label?: string | null
          target_url: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          label?: string | null
          target_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_prospects: {
        Row: {
          association: string | null
          city: string | null
          club_name: string
          club_subdomain: string | null
          country: string
          courts: number | null
          created_at: string
          follow_up_date: string | null
          id: string
          is_nsa: boolean
          last_contacted_at: string | null
          notes: string | null
          owner_user_id: string | null
          source: string | null
          status: string
          tags: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          association?: string | null
          city?: string | null
          club_name: string
          club_subdomain?: string | null
          country?: string
          courts?: number | null
          created_at?: string
          follow_up_date?: string | null
          id?: string
          is_nsa?: boolean
          last_contacted_at?: string | null
          notes?: string | null
          owner_user_id?: string | null
          source?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          association?: string | null
          city?: string | null
          club_name?: string
          club_subdomain?: string | null
          country?: string
          courts?: number | null
          created_at?: string
          follow_up_date?: string | null
          id?: string
          is_nsa?: boolean
          last_contacted_at?: string | null
          notes?: string | null
          owner_user_id?: string | null
          source?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      outreach_recipients: {
        Row: {
          campaign_id: string
          click_count: number
          contact_id: string
          created_at: string
          email: string
          error_message: string | null
          first_clicked_at: string | null
          first_opened_at: string | null
          follow_up_date: string | null
          id: string
          last_opened_at: string | null
          open_count: number
          prospect_id: string
          reply_note: string | null
          reply_status: string | null
          send_status: string
          sent_at: string | null
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          click_count?: number
          contact_id: string
          created_at?: string
          email: string
          error_message?: string | null
          first_clicked_at?: string | null
          first_opened_at?: string | null
          follow_up_date?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number
          prospect_id: string
          reply_note?: string | null
          reply_status?: string | null
          send_status?: string
          sent_at?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          click_count?: number
          contact_id?: string
          created_at?: string
          email?: string
          error_message?: string | null
          first_clicked_at?: string | null
          first_opened_at?: string | null
          follow_up_date?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number
          prospect_id?: string
          reply_note?: string | null
          reply_status?: string | null
          send_status?: string
          sent_at?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "outreach_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_recipients_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "outreach_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      paynow_payment_sessions: {
        Row: {
          amount: number
          champ_registration_id: string | null
          club_id: string
          club_member_id: string
          completed_at: string | null
          created_at: string
          currency: string
          description: string | null
          fee_ids: string[]
          id: string
          paynow_poll_url: string | null
          paynow_redirect_url: string | null
          paynow_reference: string | null
          purpose: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          champ_registration_id?: string | null
          club_id: string
          club_member_id: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          fee_ids?: string[]
          id?: string
          paynow_poll_url?: string | null
          paynow_redirect_url?: string | null
          paynow_reference?: string | null
          purpose: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          champ_registration_id?: string | null
          club_id?: string
          club_member_id?: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          fee_ids?: string[]
          id?: string
          paynow_poll_url?: string | null
          paynow_redirect_url?: string | null
          paynow_reference?: string | null
          purpose?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paynow_payment_sessions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paynow_payment_sessions_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string | null
          first_name: string | null
          full_name: string
          gender: string | null
          id: string
          last_name: string | null
          merged_into_person_id: string | null
          national_player_number: string | null
          nationality: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name: string
          gender?: string | null
          id?: string
          last_name?: string | null
          merged_into_person_id?: string | null
          national_player_number?: string | null
          nationality?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          last_name?: string | null
          merged_into_person_id?: string | null
          national_player_number?: string | null
          nationality?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_merged_into_person_id_fkey"
            columns: ["merged_into_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_merged_into_person_id_fkey"
            columns: ["merged_into_person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      people_duplicate_dismissals: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          person_a_id: string
          person_b_id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          person_a_id: string
          person_b_id: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          person_a_id?: string
          person_b_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_duplicate_dismissals_person_a_id_fkey"
            columns: ["person_a_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_duplicate_dismissals_person_a_id_fkey"
            columns: ["person_a_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_duplicate_dismissals_person_b_id_fkey"
            columns: ["person_b_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_duplicate_dismissals_person_b_id_fkey"
            columns: ["person_b_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      people_private: {
        Row: {
          created_at: string
          date_of_birth: string | null
          id_number: string | null
          person_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          id_number?: string | null
          person_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          id_number?: string | null
          person_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_private_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_private_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      person_affiliations: {
        Row: {
          affiliation_status: string
          billing_enabled: boolean
          created_at: string
          fee_amount: number | null
          id: string
          licence_product_id: string | null
          licence_status: string
          licence_type: string | null
          licence_valid_from: string | null
          licence_valid_to: string | null
          notes: string | null
          org_id: string
          person_id: string
          season_year: number
          updated_at: string
        }
        Insert: {
          affiliation_status?: string
          billing_enabled?: boolean
          created_at?: string
          fee_amount?: number | null
          id?: string
          licence_product_id?: string | null
          licence_status?: string
          licence_type?: string | null
          licence_valid_from?: string | null
          licence_valid_to?: string | null
          notes?: string | null
          org_id: string
          person_id: string
          season_year: number
          updated_at?: string
        }
        Update: {
          affiliation_status?: string
          billing_enabled?: boolean
          created_at?: string
          fee_amount?: number | null
          id?: string
          licence_product_id?: string | null
          licence_status?: string
          licence_type?: string | null
          licence_valid_from?: string | null
          licence_valid_to?: string | null
          notes?: string | null
          org_id?: string
          person_id?: string
          season_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_affiliations_licence_product_id_fkey"
            columns: ["licence_product_id"]
            isOneToOne: false
            referencedRelation: "national_licence_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_affiliations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_affiliations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_affiliations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_league_associations: {
        Row: {
          created_at: string
          external_season: string | null
          external_source: string | null
          id: string
          is_internal: boolean
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
          is_internal?: boolean
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
          is_internal?: boolean
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
          away_team_id: string | null
          away_team_name_snapshot: string | null
          booking_id: string | null
          court_id: number | null
          created_at: string
          division: string
          end_time: string | null
          external_id: string | null
          fixture_date: string
          game_scores: string | null
          home_team_code: string
          home_team_id: string | null
          home_team_name_snapshot: string | null
          id: string
          notes: string | null
          nsa_fixture_id: number | null
          nsa_submission_notes: string | null
          nsa_submitted_at: string | null
          nsa_submitted_by: string | null
          round_id: string | null
          score: string | null
          season_id: string | null
          start_time: string | null
          status: string
          updated_at: string
          venue_name: string
          winner_team_code: string | null
        }
        Insert: {
          association_id: string
          away_team_code: string
          away_team_id?: string | null
          away_team_name_snapshot?: string | null
          booking_id?: string | null
          court_id?: number | null
          created_at?: string
          division: string
          end_time?: string | null
          external_id?: string | null
          fixture_date: string
          game_scores?: string | null
          home_team_code: string
          home_team_id?: string | null
          home_team_name_snapshot?: string | null
          id?: string
          notes?: string | null
          nsa_fixture_id?: number | null
          nsa_submission_notes?: string | null
          nsa_submitted_at?: string | null
          nsa_submitted_by?: string | null
          round_id?: string | null
          score?: string | null
          season_id?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
          venue_name: string
          winner_team_code?: string | null
        }
        Update: {
          association_id?: string
          away_team_code?: string
          away_team_id?: string | null
          away_team_name_snapshot?: string | null
          booking_id?: string | null
          court_id?: number | null
          created_at?: string
          division?: string
          end_time?: string | null
          external_id?: string | null
          fixture_date?: string
          game_scores?: string | null
          home_team_code?: string
          home_team_id?: string | null
          home_team_name_snapshot?: string | null
          id?: string
          notes?: string | null
          nsa_fixture_id?: number | null
          nsa_submission_notes?: string | null
          nsa_submitted_at?: string | null
          nsa_submitted_by?: string | null
          round_id?: string | null
          score?: string | null
          season_id?: string | null
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
            foreignKeyName: "platform_league_fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "leagues"
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
            foreignKeyName: "platform_league_fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "leagues"
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
          {
            foreignKeyName: "platform_league_fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
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
      platform_subscription_invoices: {
        Row: {
          billing_cycle: string
          billing_details: Json | null
          billing_month: string | null
          club_id: string
          created_at: string
          currency: string
          display_currency: string | null
          display_price_per_member: number | null
          display_total: number | null
          due_date: string | null
          eft_proof_path: string | null
          eft_proof_uploaded_at: string | null
          eft_proof_uploaded_by: string | null
          eft_review_note: string | null
          eft_review_status: string | null
          eft_reviewed_at: string | null
          eft_reviewed_by: string | null
          email_sent_at: string | null
          email_status: string | null
          fx_rate_to_zar: number | null
          id: string
          invoice_kind: string
          invoice_number: string
          issued_at: string
          line_items: Json
          member_count: number
          minimum_charge: number
          paid_at: string | null
          period_end: string
          period_start: string
          plan_id: string | null
          plan_name: string
          price_per_member: number
          snapshot: Json | null
          status: string
          stitch_payment_id: string | null
          stitch_payment_link: string | null
          subscription_amount: number
          subscription_id: string | null
          subtotal: number
          total: number
          updated_at: string
          vat_amount: number
          whatsapp_amount: number
          whatsapp_message_count: number
        }
        Insert: {
          billing_cycle: string
          billing_details?: Json | null
          billing_month?: string | null
          club_id: string
          created_at?: string
          currency?: string
          display_currency?: string | null
          display_price_per_member?: number | null
          display_total?: number | null
          due_date?: string | null
          eft_proof_path?: string | null
          eft_proof_uploaded_at?: string | null
          eft_proof_uploaded_by?: string | null
          eft_review_note?: string | null
          eft_review_status?: string | null
          eft_reviewed_at?: string | null
          eft_reviewed_by?: string | null
          email_sent_at?: string | null
          email_status?: string | null
          fx_rate_to_zar?: number | null
          id?: string
          invoice_kind?: string
          invoice_number: string
          issued_at?: string
          line_items?: Json
          member_count?: number
          minimum_charge?: number
          paid_at?: string | null
          period_end: string
          period_start: string
          plan_id?: string | null
          plan_name: string
          price_per_member?: number
          snapshot?: Json | null
          status?: string
          stitch_payment_id?: string | null
          stitch_payment_link?: string | null
          subscription_amount?: number
          subscription_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          whatsapp_amount?: number
          whatsapp_message_count?: number
        }
        Update: {
          billing_cycle?: string
          billing_details?: Json | null
          billing_month?: string | null
          club_id?: string
          created_at?: string
          currency?: string
          display_currency?: string | null
          display_price_per_member?: number | null
          display_total?: number | null
          due_date?: string | null
          eft_proof_path?: string | null
          eft_proof_uploaded_at?: string | null
          eft_proof_uploaded_by?: string | null
          eft_review_note?: string | null
          eft_review_status?: string | null
          eft_reviewed_at?: string | null
          eft_reviewed_by?: string | null
          email_sent_at?: string | null
          email_status?: string | null
          fx_rate_to_zar?: number | null
          id?: string
          invoice_kind?: string
          invoice_number?: string
          issued_at?: string
          line_items?: Json
          member_count?: number
          minimum_charge?: number
          paid_at?: string | null
          period_end?: string
          period_start?: string
          plan_id?: string | null
          plan_name?: string
          price_per_member?: number
          snapshot?: Json | null
          status?: string
          stitch_payment_id?: string | null
          stitch_payment_link?: string | null
          subscription_amount?: number
          subscription_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          whatsapp_amount?: number
          whatsapp_message_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_subscription_invoices_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_subscription_invoices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_subscription_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "club_subscriptions"
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
      qr_short_codes: {
        Row: {
          active: boolean
          bar_item_id: string | null
          club_id: string
          code: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          bar_item_id?: string | null
          club_id: string
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          bar_item_id?: string | null
          club_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_short_codes_bar_item_id_fkey"
            columns: ["bar_item_id"]
            isOneToOne: false
            referencedRelation: "bar_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_short_codes_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_points_ledger: {
        Row: {
          balance_after: number
          club_id: string
          created_at: string
          created_by: string | null
          delta: number
          id: string
          member_id: string
          pending_id: string | null
          reason: string
          source_id: string | null
          source_type: string | null
        }
        Insert: {
          balance_after: number
          club_id: string
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          member_id: string
          pending_id?: string | null
          reason: string
          source_id?: string | null
          source_type?: string | null
        }
        Update: {
          balance_after?: number
          club_id?: string
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          member_id?: string
          pending_id?: string | null
          reason?: string
          source_id?: string | null
          source_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ranking_points_ledger_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranking_points_ledger_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranking_points_ledger_pending_id_fkey"
            columns: ["pending_id"]
            isOneToOne: false
            referencedRelation: "ranking_points_pending"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_points_pending: {
        Row: {
          club_id: string
          created_at: string
          id: string
          loser_delta: number
          loser_member_id: string
          loser_rank_at_match: number | null
          match_source_id: string | null
          match_source_type: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string | null
          updated_at: string
          winner_delta: number
          winner_member_id: string
          winner_rank_at_match: number | null
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          loser_delta?: number
          loser_member_id: string
          loser_rank_at_match?: number | null
          match_source_id?: string | null
          match_source_type: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
          winner_delta: number
          winner_member_id: string
          winner_rank_at_match?: number | null
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          loser_delta?: number
          loser_member_id?: string
          loser_rank_at_match?: number | null
          match_source_id?: string | null
          match_source_type?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
          winner_delta?: number
          winner_member_id?: string
          winner_rank_at_match?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ranking_points_pending_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranking_points_pending_loser_member_id_fkey"
            columns: ["loser_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranking_points_pending_winner_member_id_fkey"
            columns: ["winner_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_rubber_points: {
        Row: {
          association_id: string | null
          base_points: number
          category: string | null
          created_at: string
          fixture_date: string
          games_against: number | null
          games_for: number | null
          id: string
          league_label: string | null
          league_weight: number
          nsa_fixture_id: number | null
          opponent_factor: number
          person_id: string | null
          player_code: string
          player_name: string | null
          points: number
          position: number | null
          position_weight: number
          season_year: number
          team_code: string | null
          won: boolean | null
        }
        Insert: {
          association_id?: string | null
          base_points?: number
          category?: string | null
          created_at?: string
          fixture_date: string
          games_against?: number | null
          games_for?: number | null
          id?: string
          league_label?: string | null
          league_weight?: number
          nsa_fixture_id?: number | null
          opponent_factor?: number
          person_id?: string | null
          player_code: string
          player_name?: string | null
          points?: number
          position?: number | null
          position_weight?: number
          season_year: number
          team_code?: string | null
          won?: boolean | null
        }
        Update: {
          association_id?: string | null
          base_points?: number
          category?: string | null
          created_at?: string
          fixture_date?: string
          games_against?: number | null
          games_for?: number | null
          id?: string
          league_label?: string | null
          league_weight?: number
          nsa_fixture_id?: number | null
          opponent_factor?: number
          person_id?: string | null
          player_code?: string
          player_name?: string | null
          points?: number
          position?: number | null
          position_weight?: number
          season_year?: number
          team_code?: string | null
          won?: boolean | null
        }
        Relationships: []
      }
      ranking_snapshot_entries: {
        Row: {
          association_id: string | null
          category: string | null
          club_label: string | null
          created_at: string
          id: string
          person_id: string | null
          player_code: string
          player_name: string | null
          previous_rank: number | null
          rank: number
          rubbers_counted: number
          score: number
          season_breakdown: Json
          snapshot_id: string
        }
        Insert: {
          association_id?: string | null
          category?: string | null
          club_label?: string | null
          created_at?: string
          id?: string
          person_id?: string | null
          player_code: string
          player_name?: string | null
          previous_rank?: number | null
          rank: number
          rubbers_counted?: number
          score?: number
          season_breakdown?: Json
          snapshot_id: string
        }
        Update: {
          association_id?: string | null
          category?: string | null
          club_label?: string | null
          created_at?: string
          id?: string
          person_id?: string | null
          player_code?: string
          player_name?: string | null
          previous_rank?: number | null
          rank?: number
          rubbers_counted?: number
          score?: number
          season_breakdown?: Json
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ranking_snapshot_entries_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "ranking_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_snapshots: {
        Row: {
          association_id: string | null
          basis_seasons: number[]
          computed_at: string
          created_at: string
          id: string
          player_count: number
          settings: Json
        }
        Insert: {
          association_id?: string | null
          basis_seasons?: number[]
          computed_at?: string
          created_at?: string
          id?: string
          player_count?: number
          settings?: Json
        }
        Update: {
          association_id?: string | null
          basis_seasons?: number[]
          computed_at?: string
          created_at?: string
          id?: string
          player_count?: number
          settings?: Json
        }
        Relationships: []
      }
      recurring_bookings: {
        Row: {
          active: boolean
          booking_type: string
          club_id: string | null
          court_id: number
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          ops_note: string | null
          ops_purpose: string | null
          start_time: string
          user_id: string
        }
        Insert: {
          active?: boolean
          booking_type?: string
          club_id?: string | null
          court_id: number
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          ops_note?: string | null
          ops_purpose?: string | null
          start_time: string
          user_id: string
        }
        Update: {
          active?: boolean
          booking_type?: string
          club_id?: string | null
          court_id?: number
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          ops_note?: string | null
          ops_purpose?: string | null
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
      sportyhq_lookup_attempts: {
        Row: {
          attempts: number
          club_member_id: string
          created_at: string
          id: string
          last_attempt_at: string | null
          last_message: string | null
          last_status: string | null
          person_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          club_member_id: string
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_message?: string | null
          last_status?: string | null
          person_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          club_member_id?: string
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_message?: string | null
          last_status?: string | null
          person_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sportyhq_lookup_attempts_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: true
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      sportyhq_org_members: {
        Row: {
          age: number | null
          birthday: string | null
          club_label: string | null
          created_at: string
          date_of_birth: string | null
          gender: string | null
          handedness: string | null
          id: string
          last_seen_at: string
          match_confidence: string | null
          matched_club_member_id: string | null
          matched_person_id: string | null
          matches_all_time: number | null
          matches_ytd: number | null
          name: string
          nationality: string | null
          nickname: string | null
          org_id: string
          profile_fetched_at: string | null
          profile_path: string | null
          rank_confidence: string | null
          rank_points: number | null
          rank_position: number | null
          ranking_slug: string | null
          rankings: Json | null
          rating: number | null
          rating_confidence: number | null
          sportyhq_user_id: number | null
          status: string
          updated_at: string
          wins_all_time: number | null
        }
        Insert: {
          age?: number | null
          birthday?: string | null
          club_label?: string | null
          created_at?: string
          date_of_birth?: string | null
          gender?: string | null
          handedness?: string | null
          id?: string
          last_seen_at?: string
          match_confidence?: string | null
          matched_club_member_id?: string | null
          matched_person_id?: string | null
          matches_all_time?: number | null
          matches_ytd?: number | null
          name: string
          nationality?: string | null
          nickname?: string | null
          org_id: string
          profile_fetched_at?: string | null
          profile_path?: string | null
          rank_confidence?: string | null
          rank_points?: number | null
          rank_position?: number | null
          ranking_slug?: string | null
          rankings?: Json | null
          rating?: number | null
          rating_confidence?: number | null
          sportyhq_user_id?: number | null
          status?: string
          updated_at?: string
          wins_all_time?: number | null
        }
        Update: {
          age?: number | null
          birthday?: string | null
          club_label?: string | null
          created_at?: string
          date_of_birth?: string | null
          gender?: string | null
          handedness?: string | null
          id?: string
          last_seen_at?: string
          match_confidence?: string | null
          matched_club_member_id?: string | null
          matched_person_id?: string | null
          matches_all_time?: number | null
          matches_ytd?: number | null
          name?: string
          nationality?: string | null
          nickname?: string | null
          org_id?: string
          profile_fetched_at?: string | null
          profile_path?: string | null
          rank_confidence?: string | null
          rank_points?: number | null
          rank_position?: number | null
          ranking_slug?: string | null
          rankings?: Json | null
          rating?: number | null
          rating_confidence?: number | null
          sportyhq_user_id?: number | null
          status?: string
          updated_at?: string
          wins_all_time?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sportyhq_org_members_matched_club_member_id_fkey"
            columns: ["matched_club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sportyhq_org_members_matched_person_id_fkey"
            columns: ["matched_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sportyhq_org_members_matched_person_id_fkey"
            columns: ["matched_person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sportyhq_org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "sportyhq_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      sportyhq_orgs: {
        Row: {
          created_at: string
          id: string
          kind: string
          last_scraped_at: string
          location_label: string | null
          matched_club_id: string | null
          matched_org_id: string | null
          member_count: number | null
          name: string
          parent_key: string | null
          parent_org_id: string | null
          sportyhq_org_key: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          last_scraped_at?: string
          location_label?: string | null
          matched_club_id?: string | null
          matched_org_id?: string | null
          member_count?: number | null
          name: string
          parent_key?: string | null
          parent_org_id?: string | null
          sportyhq_org_key: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          last_scraped_at?: string
          location_label?: string | null
          matched_club_id?: string | null
          matched_org_id?: string | null
          member_count?: number | null
          name?: string
          parent_key?: string | null
          parent_org_id?: string | null
          sportyhq_org_key?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sportyhq_orgs_matched_club_id_fkey"
            columns: ["matched_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sportyhq_orgs_matched_org_id_fkey"
            columns: ["matched_org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sportyhq_orgs_parent_org_id_fkey"
            columns: ["parent_org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      sportyhq_profiles: {
        Row: {
          age: number | null
          birthday: string | null
          club_label: string | null
          club_member_id: string | null
          clubs: Json
          created_at: string
          fetched_at: string
          gender: string | null
          governing_bodies: Json
          handedness: string | null
          id: string
          location_label: string | null
          matches_all_time: number | null
          matches_ytd: number | null
          name: string
          nationality: string | null
          nickname: string | null
          occupation: string | null
          person_id: string | null
          profile_path: string
          rankings: Json
          rating: number | null
          rating_confidence: number | null
          sport: string
          sportyhq_user_id: number
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          wins_all_time: number | null
        }
        Insert: {
          age?: number | null
          birthday?: string | null
          club_label?: string | null
          club_member_id?: string | null
          clubs?: Json
          created_at?: string
          fetched_at?: string
          gender?: string | null
          governing_bodies?: Json
          handedness?: string | null
          id?: string
          location_label?: string | null
          matches_all_time?: number | null
          matches_ytd?: number | null
          name: string
          nationality?: string | null
          nickname?: string | null
          occupation?: string | null
          person_id?: string | null
          profile_path: string
          rankings?: Json
          rating?: number | null
          rating_confidence?: number | null
          sport?: string
          sportyhq_user_id: number
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          wins_all_time?: number | null
        }
        Update: {
          age?: number | null
          birthday?: string | null
          club_label?: string | null
          club_member_id?: string | null
          clubs?: Json
          created_at?: string
          fetched_at?: string
          gender?: string | null
          governing_bodies?: Json
          handedness?: string | null
          id?: string
          location_label?: string | null
          matches_all_time?: number | null
          matches_ytd?: number | null
          name?: string
          nationality?: string | null
          nickname?: string | null
          occupation?: string | null
          person_id?: string | null
          profile_path?: string
          rankings?: Json
          rating?: number | null
          rating_confidence?: number | null
          sport?: string
          sportyhq_user_id?: number
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          wins_all_time?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sportyhq_profiles_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sportyhq_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sportyhq_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      sportyhq_tree_runs: {
        Row: {
          action: string
          association_org_id: string | null
          created_at: string
          finished_at: string | null
          id: string
          message: string | null
          orgs_found: number
          players_found: number
          sportyhq_org_id: string | null
          started_by: string | null
          status: string
        }
        Insert: {
          action: string
          association_org_id?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          message?: string | null
          orgs_found?: number
          players_found?: number
          sportyhq_org_id?: string | null
          started_by?: string | null
          status?: string
        }
        Update: {
          action?: string
          association_org_id?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          message?: string | null
          orgs_found?: number
          players_found?: number
          sportyhq_org_id?: string | null
          started_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sportyhq_tree_runs_association_org_id_fkey"
            columns: ["association_org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sportyhq_tree_runs_org_fk"
            columns: ["sportyhq_org_id"]
            isOneToOne: false
            referencedRelation: "sportyhq_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      stitch_collections: {
        Row: {
          amount_cents: number
          approval_required: boolean
          approved_at: string | null
          approved_by: string | null
          attempt_number: number
          club_id: string
          club_member_id: string
          created_at: string
          due_date: string
          failed_reason: string | null
          fee_payable_id: string | null
          id: string
          mandate_id: string
          posted_at: string | null
          retry_of: string | null
          settled_at: string | null
          status: string
          stitch_collection_id: string | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          approval_required?: boolean
          approved_at?: string | null
          approved_by?: string | null
          attempt_number?: number
          club_id: string
          club_member_id: string
          created_at?: string
          due_date: string
          failed_reason?: string | null
          fee_payable_id?: string | null
          id?: string
          mandate_id: string
          posted_at?: string | null
          retry_of?: string | null
          settled_at?: string | null
          status?: string
          stitch_collection_id?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          approval_required?: boolean
          approved_at?: string | null
          approved_by?: string | null
          attempt_number?: number
          club_id?: string
          club_member_id?: string
          created_at?: string
          due_date?: string
          failed_reason?: string | null
          fee_payable_id?: string | null
          id?: string
          mandate_id?: string
          posted_at?: string | null
          retry_of?: string | null
          settled_at?: string | null
          status?: string
          stitch_collection_id?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stitch_collections_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "stitch_mandates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stitch_collections_retry_of_fkey"
            columns: ["retry_of"]
            isOneToOne: false
            referencedRelation: "stitch_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      stitch_mandates: {
        Row: {
          auth_url: string | null
          authorised_at: string | null
          cancelled_at: string | null
          club_id: string
          club_member_id: string
          consecutive_failures: number
          created_at: string
          debit_day: number | null
          fee_category_id: string | null
          frequency: string
          gateway: string
          id: string
          initial_amount_cents: number | null
          initial_payment_tx_id: string | null
          last_collection_at: string | null
          mandate_type: string
          max_amount_cents: number
          rail: string
          status: string
          stitch_mandate_id: string | null
          suspended_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_url?: string | null
          authorised_at?: string | null
          cancelled_at?: string | null
          club_id: string
          club_member_id: string
          consecutive_failures?: number
          created_at?: string
          debit_day?: number | null
          fee_category_id?: string | null
          frequency?: string
          gateway?: string
          id?: string
          initial_amount_cents?: number | null
          initial_payment_tx_id?: string | null
          last_collection_at?: string | null
          mandate_type?: string
          max_amount_cents: number
          rail: string
          status?: string
          stitch_mandate_id?: string | null
          suspended_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_url?: string | null
          authorised_at?: string | null
          cancelled_at?: string | null
          club_id?: string
          club_member_id?: string
          consecutive_failures?: number
          created_at?: string
          debit_day?: number | null
          fee_category_id?: string | null
          frequency?: string
          gateway?: string
          id?: string
          initial_amount_cents?: number | null
          initial_payment_tx_id?: string | null
          last_collection_at?: string | null
          mandate_type?: string
          max_amount_cents?: number
          rail?: string
          status?: string
          stitch_mandate_id?: string | null
          suspended_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stitch_onboarding_drafts: {
        Row: {
          board_members: Json
          club_id: string
          club_url: string | null
          contact_cell: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          files: Json
          id: string
          submitted_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          board_members?: Json
          club_id: string
          club_url?: string | null
          contact_cell?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          files?: Json
          id?: string
          submitted_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          board_members?: Json
          club_id?: string
          club_url?: string | null
          contact_cell?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          files?: Json
          id?: string
          submitted_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stitch_onboarding_drafts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      stitch_payment_sessions: {
        Row: {
          amount: number
          champ_registration_id: string | null
          club_id: string
          club_member_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          fee_ids: string[]
          id: string
          metadata: Json
          method: string
          payer_reference: string | null
          purpose: string
          status: string
          stitch_payment_id: string | null
          stitch_redirect_url: string | null
          stitch_request_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          champ_registration_id?: string | null
          club_id: string
          club_member_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          fee_ids?: string[]
          id?: string
          metadata?: Json
          method?: string
          payer_reference?: string | null
          purpose: string
          status?: string
          stitch_payment_id?: string | null
          stitch_redirect_url?: string | null
          stitch_request_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          champ_registration_id?: string | null
          club_id?: string
          club_member_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          fee_ids?: string[]
          id?: string
          metadata?: Json
          method?: string
          payer_reference?: string | null
          purpose?: string
          status?: string
          stitch_payment_id?: string | null
          stitch_redirect_url?: string | null
          stitch_request_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stitch_payment_sessions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stitch_payment_sessions_club_member_id_fkey"
            columns: ["club_member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      stitch_webhook_quarantine: {
        Row: {
          club_id: string | null
          collection_id: string | null
          created_at: string
          error: string
          event_type: string | null
          id: string
          payload: Json | null
          resolved_at: string | null
          source: string
          svix_id: string | null
        }
        Insert: {
          club_id?: string | null
          collection_id?: string | null
          created_at?: string
          error: string
          event_type?: string | null
          id?: string
          payload?: Json | null
          resolved_at?: string | null
          source?: string
          svix_id?: string | null
        }
        Update: {
          club_id?: string | null
          collection_id?: string | null
          created_at?: string
          error?: string
          event_type?: string | null
          id?: string
          payload?: Json | null
          resolved_at?: string | null
          source?: string
          svix_id?: string | null
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
          max_billable_members: number | null
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
          max_billable_members?: number | null
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
          max_billable_members?: number | null
          minimum_charge?: number
          name?: string
          price_per_member?: number
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscription_variance_flags: {
        Row: {
          adjustment_amount: number | null
          adjustment_invoice_id: string | null
          baseline_member_count: number
          club_id: string
          created_at: string
          current_member_count: number
          id: string
          note: string | null
          resolved_at: string | null
          status: string
          threshold_pct: number
          updated_at: string
          variance_pct: number
        }
        Insert: {
          adjustment_amount?: number | null
          adjustment_invoice_id?: string | null
          baseline_member_count: number
          club_id: string
          created_at?: string
          current_member_count: number
          id?: string
          note?: string | null
          resolved_at?: string | null
          status?: string
          threshold_pct: number
          updated_at?: string
          variance_pct: number
        }
        Update: {
          adjustment_amount?: number | null
          adjustment_invoice_id?: string | null
          baseline_member_count?: number
          club_id?: string
          created_at?: string
          current_member_count?: number
          id?: string
          note?: string | null
          resolved_at?: string | null
          status?: string
          threshold_pct?: number
          updated_at?: string
          variance_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscription_variance_flags_adjustment_invoice_id_fkey"
            columns: ["adjustment_invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_subscription_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_variance_flags_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
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
      tournament_draw_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          match_count: number
          note: string | null
          snapshot: Json
          tournament_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          match_count?: number
          note?: string | null
          snapshot?: Json
          tournament_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          match_count?: number
          note?: string | null
          snapshot?: Json
          tournament_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_draw_versions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "club_champs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_draw_versions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_governance: {
        Row: {
          approval_gate: string
          association_fee_cents: number
          association_fee_pct: number
          competition_level: string
          created_at: string
          eligibility_max_age: number | null
          eligibility_min_age: number | null
          eligibility_notes: string | null
          eligibility_requires_licence: boolean
          eligibility_scope: string
          entry_fee_cents: number
          entry_source: string
          federation_fee_cents: number
          federation_fee_pct: number
          other_expenses_cents: number
          other_expenses_label: string | null
          payment_methods: string[]
          payment_required: boolean
          payment_timing: string
          refund_cutoff_date: string | null
          refund_policy: string
          registration_closes_at: string | null
          registration_mode: string
          registration_opens_at: string | null
          registration_required: boolean
          sanction_notes: string | null
          sanction_reference: string | null
          sanction_status: string
          sanctioned_at: string | null
          sanctioned_by: string | null
          sanctioning_org_id: string | null
          tournament_id: string
          updated_at: string
        }
        Insert: {
          approval_gate?: string
          association_fee_cents?: number
          association_fee_pct?: number
          competition_level?: string
          created_at?: string
          eligibility_max_age?: number | null
          eligibility_min_age?: number | null
          eligibility_notes?: string | null
          eligibility_requires_licence?: boolean
          eligibility_scope?: string
          entry_fee_cents?: number
          entry_source?: string
          federation_fee_cents?: number
          federation_fee_pct?: number
          other_expenses_cents?: number
          other_expenses_label?: string | null
          payment_methods?: string[]
          payment_required?: boolean
          payment_timing?: string
          refund_cutoff_date?: string | null
          refund_policy?: string
          registration_closes_at?: string | null
          registration_mode?: string
          registration_opens_at?: string | null
          registration_required?: boolean
          sanction_notes?: string | null
          sanction_reference?: string | null
          sanction_status?: string
          sanctioned_at?: string | null
          sanctioned_by?: string | null
          sanctioning_org_id?: string | null
          tournament_id: string
          updated_at?: string
        }
        Update: {
          approval_gate?: string
          association_fee_cents?: number
          association_fee_pct?: number
          competition_level?: string
          created_at?: string
          eligibility_max_age?: number | null
          eligibility_min_age?: number | null
          eligibility_notes?: string | null
          eligibility_requires_licence?: boolean
          eligibility_scope?: string
          entry_fee_cents?: number
          entry_source?: string
          federation_fee_cents?: number
          federation_fee_pct?: number
          other_expenses_cents?: number
          other_expenses_label?: string | null
          payment_methods?: string[]
          payment_required?: boolean
          payment_timing?: string
          refund_cutoff_date?: string | null
          refund_policy?: string
          registration_closes_at?: string | null
          registration_mode?: string
          registration_opens_at?: string | null
          registration_required?: boolean
          sanction_notes?: string | null
          sanction_reference?: string | null
          sanction_status?: string
          sanctioned_at?: string | null
          sanctioned_by?: string | null
          sanctioning_org_id?: string | null
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_governance_sanctioning_org_id_fkey"
            columns: ["sanctioning_org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_governance_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "club_champs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_governance_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_governance_audit: {
        Row: {
          champ_id: string
          changed_by: string | null
          club_id: string
          created_at: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          champ_id: string
          changed_by?: string | null
          club_id: string
          created_at?: string
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          champ_id?: string
          changed_by?: string | null
          club_id?: string
          created_at?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_governance_audit_champ_id_fkey"
            columns: ["champ_id"]
            isOneToOne: false
            referencedRelation: "club_champs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_governance_audit_champ_id_fkey"
            columns: ["champ_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_invite_platform_sends: {
        Row: {
          champ_id: string
          id: string
          recipient_email: string
          registration_id: string
          sent_at: string
        }
        Insert: {
          champ_id: string
          id?: string
          recipient_email: string
          registration_id: string
          sent_at?: string
        }
        Update: {
          champ_id?: string
          id?: string
          recipient_email?: string
          registration_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_invite_platform_sends_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "club_champs_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_rules: {
        Row: {
          affects_ranking_points: boolean
          best_of: number | null
          bye_handling: string
          created_at: string
          draw_type: string
          handicap_divider: number
          handicap_mode: string
          handicap_multiplier: number
          no_show_opponent_points: number
          no_show_player_points: number
          play_all_games: boolean
          points_per_game: number
          ranking_weight: number
          round_format: string
          scoring_mode: string
          standard_of_play: string
          tournament_id: string
          updated_at: string
          win_condition: string
        }
        Insert: {
          affects_ranking_points?: boolean
          best_of?: number | null
          bye_handling?: string
          created_at?: string
          draw_type?: string
          handicap_divider?: number
          handicap_mode?: string
          handicap_multiplier?: number
          no_show_opponent_points?: number
          no_show_player_points?: number
          play_all_games?: boolean
          points_per_game?: number
          ranking_weight?: number
          round_format?: string
          scoring_mode?: string
          standard_of_play?: string
          tournament_id: string
          updated_at?: string
          win_condition?: string
        }
        Update: {
          affects_ranking_points?: boolean
          best_of?: number | null
          bye_handling?: string
          created_at?: string
          draw_type?: string
          handicap_divider?: number
          handicap_mode?: string
          handicap_multiplier?: number
          no_show_opponent_points?: number
          no_show_player_points?: number
          play_all_games?: boolean
          points_per_game?: number
          ranking_weight?: number
          round_format?: string
          scoring_mode?: string
          standard_of_play?: string
          tournament_id?: string
          updated_at?: string
          win_condition?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_rules_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "club_champs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_rules_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_venues: {
        Row: {
          club_id: string
          court_ids: number[]
          created_at: string
          host_fee_cents: number
          host_share_pct: number
          id: string
          is_primary: boolean
          notes: string | null
          tournament_id: string
          updated_at: string
        }
        Insert: {
          club_id: string
          court_ids?: number[]
          created_at?: string
          host_fee_cents?: number
          host_share_pct?: number
          id?: string
          is_primary?: boolean
          notes?: string | null
          tournament_id: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          court_ids?: number[]
          created_at?: string
          host_fee_cents?: number
          host_share_pct?: number
          id?: string
          is_primary?: boolean
          notes?: string | null
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_venues_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_venues_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "club_champs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_venues_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          avoid_back_to_back: boolean
          champion_scope: string
          club_id: string
          court_ids: number[]
          court_rotation_minutes: number | null
          created_at: string
          day_schedules: Json
          default_break_minutes: number
          description: string | null
          doubles_pairing_locked: boolean
          draw_locked: boolean
          draw_locked_at: string | null
          draw_locked_by: string | null
          draw_version: number
          enable_playoffs: boolean
          end_date: string | null
          end_time: string
          entries_locked: boolean
          event_type: string
          expected_players: Json | null
          gender: string
          group_break_minutes: Json
          group_durations: Json
          group_labels: Json | null
          id: string
          include_visitors: boolean
          invite_audience: string
          invite_audience_club_ids: string[]
          invite_audience_include_individuals: boolean
          invite_audience_league_ids: string[]
          invite_audience_member_ids: string[]
          invite_excluded_member_ids: string[]
          invite_extra_details: string | null
          invite_include_reserves: boolean
          invite_methods: string[]
          invite_source: string
          knockout_seeds: Json | null
          knockout_seeds_at: string | null
          ladder_affects: boolean | null
          league_best_of: Json | null
          league_bye_handling: Json | null
          league_draw_styles: Json
          league_forfeit_points: Json | null
          league_forfeit_rules: Json | null
          league_formats: Json | null
          league_genders: Json | null
          league_match_types: Json | null
          league_play_all_games: Json | null
          league_playoffs: Json | null
          league_points_per_game: Json | null
          league_scoring_modes: Json | null
          league_sections: Json
          league_source_modes: Json
          league_sources: Json
          league_win_conditions: Json
          manual_draws: Json | null
          manual_seed_divisions: Json | null
          match_duration_minutes: number
          match_type: string
          max_entrants: number | null
          max_per_league: number | null
          name: string
          num_groups: number
          owner_org_id: string | null
          participating_club_ids: string[]
          partner_mode: string
          play_days: number[]
          playoff_break_minutes: number
          playoff_date: string | null
          pool_allocation: string
          pool_sizes: Json
          round_play_by: Json
          schedule_mode: string
          scheduling_mode: string
          seed_order: Json | null
          seeding_source: string
          source_league_id: string | null
          source_league_ids: string[]
          start_date: string | null
          start_time: string
          status: string
          swiss_pools: Json | null
          swiss_rounds: Json | null
          updated_at: string
          visitor_clubs: string[]
        }
        Insert: {
          avoid_back_to_back?: boolean
          champion_scope?: string
          club_id: string
          court_ids?: number[]
          court_rotation_minutes?: number | null
          created_at?: string
          day_schedules?: Json
          default_break_minutes?: number
          description?: string | null
          doubles_pairing_locked?: boolean
          draw_locked?: boolean
          draw_locked_at?: string | null
          draw_locked_by?: string | null
          draw_version?: number
          enable_playoffs?: boolean
          end_date?: string | null
          end_time?: string
          entries_locked?: boolean
          event_type?: string
          expected_players?: Json | null
          gender: string
          group_break_minutes?: Json
          group_durations?: Json
          group_labels?: Json | null
          id?: string
          include_visitors?: boolean
          invite_audience?: string
          invite_audience_club_ids?: string[]
          invite_audience_include_individuals?: boolean
          invite_audience_league_ids?: string[]
          invite_audience_member_ids?: string[]
          invite_excluded_member_ids?: string[]
          invite_extra_details?: string | null
          invite_include_reserves?: boolean
          invite_methods?: string[]
          invite_source?: string
          knockout_seeds?: Json | null
          knockout_seeds_at?: string | null
          ladder_affects?: boolean | null
          league_best_of?: Json | null
          league_bye_handling?: Json | null
          league_draw_styles?: Json
          league_forfeit_points?: Json | null
          league_forfeit_rules?: Json | null
          league_formats?: Json | null
          league_genders?: Json | null
          league_match_types?: Json | null
          league_play_all_games?: Json | null
          league_playoffs?: Json | null
          league_points_per_game?: Json | null
          league_scoring_modes?: Json | null
          league_sections?: Json
          league_source_modes?: Json
          league_sources?: Json
          league_win_conditions?: Json
          manual_draws?: Json | null
          manual_seed_divisions?: Json | null
          match_duration_minutes?: number
          match_type?: string
          max_entrants?: number | null
          max_per_league?: number | null
          name: string
          num_groups?: number
          owner_org_id?: string | null
          participating_club_ids?: string[]
          partner_mode?: string
          play_days?: number[]
          playoff_break_minutes?: number
          playoff_date?: string | null
          pool_allocation?: string
          pool_sizes?: Json
          round_play_by?: Json
          schedule_mode?: string
          scheduling_mode?: string
          seed_order?: Json | null
          seeding_source?: string
          source_league_id?: string | null
          source_league_ids?: string[]
          start_date?: string | null
          start_time?: string
          status?: string
          swiss_pools?: Json | null
          swiss_rounds?: Json | null
          updated_at?: string
          visitor_clubs?: string[]
        }
        Update: {
          avoid_back_to_back?: boolean
          champion_scope?: string
          club_id?: string
          court_ids?: number[]
          court_rotation_minutes?: number | null
          created_at?: string
          day_schedules?: Json
          default_break_minutes?: number
          description?: string | null
          doubles_pairing_locked?: boolean
          draw_locked?: boolean
          draw_locked_at?: string | null
          draw_locked_by?: string | null
          draw_version?: number
          enable_playoffs?: boolean
          end_date?: string | null
          end_time?: string
          entries_locked?: boolean
          event_type?: string
          expected_players?: Json | null
          gender?: string
          group_break_minutes?: Json
          group_durations?: Json
          group_labels?: Json | null
          id?: string
          include_visitors?: boolean
          invite_audience?: string
          invite_audience_club_ids?: string[]
          invite_audience_include_individuals?: boolean
          invite_audience_league_ids?: string[]
          invite_audience_member_ids?: string[]
          invite_excluded_member_ids?: string[]
          invite_extra_details?: string | null
          invite_include_reserves?: boolean
          invite_methods?: string[]
          invite_source?: string
          knockout_seeds?: Json | null
          knockout_seeds_at?: string | null
          ladder_affects?: boolean | null
          league_best_of?: Json | null
          league_bye_handling?: Json | null
          league_draw_styles?: Json
          league_forfeit_points?: Json | null
          league_forfeit_rules?: Json | null
          league_formats?: Json | null
          league_genders?: Json | null
          league_match_types?: Json | null
          league_play_all_games?: Json | null
          league_playoffs?: Json | null
          league_points_per_game?: Json | null
          league_scoring_modes?: Json | null
          league_sections?: Json
          league_source_modes?: Json
          league_sources?: Json
          league_win_conditions?: Json
          manual_draws?: Json | null
          manual_seed_divisions?: Json | null
          match_duration_minutes?: number
          match_type?: string
          max_entrants?: number | null
          max_per_league?: number | null
          name?: string
          num_groups?: number
          owner_org_id?: string | null
          participating_club_ids?: string[]
          partner_mode?: string
          play_days?: number[]
          playoff_break_minutes?: number
          playoff_date?: string | null
          pool_allocation?: string
          pool_sizes?: Json
          round_play_by?: Json
          schedule_mode?: string
          scheduling_mode?: string
          seed_order?: Json | null
          seeding_source?: string
          source_league_id?: string | null
          source_league_ids?: string[]
          start_date?: string | null
          start_time?: string
          status?: string
          swiss_pools?: Json | null
          swiss_rounds?: Json | null
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
          {
            foreignKeyName: "tournaments_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
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
      whatsapp_interactions: {
        Row: {
          club_id: string
          created_at: string
          expires_at: string
          id: string
          kind: string
          member_id: string | null
          phone: string
          prompt: string | null
          responded_at: string | null
          response: string | null
          status: string
          target_id: string | null
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          expires_at?: string
          id?: string
          kind: string
          member_id?: string | null
          phone: string
          prompt?: string | null
          responded_at?: string | null
          response?: string | null
          status?: string
          target_id?: string | null
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          kind?: string
          member_id?: string | null
          phone?: string
          prompt?: string | null
          responded_at?: string | null
          response?: string | null
          status?: string
          target_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_interactions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_interactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_send_log: {
        Row: {
          billable: boolean
          body: string | null
          category: string
          club_id: string | null
          created_at: string
          direction: string
          error: string | null
          from_phone: string | null
          id: string
          invoice_id: string | null
          kind: string
          member_id: string | null
          payload: Json | null
          platform_invoice_id: string | null
          provider_sid: string | null
          sent_by: string | null
          status: string
          to_phone: string
          unit_cost: number
        }
        Insert: {
          billable?: boolean
          body?: string | null
          category?: string
          club_id?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          from_phone?: string | null
          id?: string
          invoice_id?: string | null
          kind?: string
          member_id?: string | null
          payload?: Json | null
          platform_invoice_id?: string | null
          provider_sid?: string | null
          sent_by?: string | null
          status?: string
          to_phone: string
          unit_cost?: number
        }
        Update: {
          billable?: boolean
          body?: string | null
          category?: string
          club_id?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          from_phone?: string | null
          id?: string
          invoice_id?: string | null
          kind?: string
          member_id?: string | null
          payload?: Json | null
          platform_invoice_id?: string | null
          provider_sid?: string | null
          sent_by?: string | null
          status?: string
          to_phone?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_send_log_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_send_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_send_log_platform_invoice_id_fkey"
            columns: ["platform_invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_subscription_invoices"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      club_access_public: {
        Row: {
          access_control_type: string | null
          ble_fallback_enabled: boolean | null
          club_id: string | null
          shelly_door_ble_mac: string | null
          shelly_door_channel: number | null
          shelly_door_pulse_ms: number | null
        }
        Insert: {
          access_control_type?: string | null
          ble_fallback_enabled?: boolean | null
          club_id?: string | null
          shelly_door_ble_mac?: string | null
          shelly_door_channel?: number | null
          shelly_door_pulse_ms?: number | null
        }
        Update: {
          access_control_type?: string | null
          ble_fallback_enabled?: boolean | null
          club_id?: string | null
          shelly_door_ble_mac?: string | null
          shelly_door_channel?: number | null
          shelly_door_pulse_ms?: number | null
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
      club_champs: {
        Row: {
          affects_ranking_points: boolean | null
          approval_gate: string | null
          association_fee_cents: number | null
          avoid_back_to_back: boolean | null
          best_of: number | null
          bye_handling: string | null
          champion_scope: string | null
          club_id: string | null
          competition_level: string | null
          court_ids: number[] | null
          court_rotation_minutes: number | null
          created_at: string | null
          day_schedules: Json | null
          default_break_minutes: number | null
          description: string | null
          draw_type: string | null
          eligibility_max_age: number | null
          eligibility_min_age: number | null
          eligibility_notes: string | null
          eligibility_requires_licence: boolean | null
          eligibility_scope: string | null
          enable_playoffs: boolean | null
          end_date: string | null
          end_time: string | null
          entries_locked: boolean | null
          entry_fee_cents: number | null
          entry_source: string | null
          expected_players: Json | null
          federation_fee_cents: number | null
          gender: string | null
          group_break_minutes: Json | null
          group_durations: Json | null
          group_labels: Json | null
          handicap_divider: number | null
          handicap_mode: string | null
          handicap_multiplier: number | null
          id: string | null
          include_visitors: boolean | null
          invite_audience: string | null
          invite_audience_club_ids: string[] | null
          invite_audience_include_individuals: boolean | null
          invite_audience_league_ids: string[] | null
          invite_audience_member_ids: string[] | null
          invite_excluded_member_ids: string[] | null
          invite_extra_details: string | null
          invite_include_reserves: boolean | null
          invite_methods: string[] | null
          invite_source: string | null
          knockout_seeds: Json | null
          knockout_seeds_at: string | null
          ladder_affects: boolean | null
          league_draw_styles: Json | null
          league_formats: Json | null
          league_sections: Json | null
          league_win_conditions: Json | null
          match_duration_minutes: number | null
          match_type: string | null
          name: string | null
          no_show_opponent_points: number | null
          no_show_player_points: number | null
          num_groups: number | null
          owner_org_id: string | null
          partner_mode: string | null
          payment_methods: string[] | null
          payment_required: boolean | null
          payment_timing: string | null
          play_all_games: boolean | null
          play_days: number[] | null
          playoff_break_minutes: number | null
          playoff_date: string | null
          points_per_game: number | null
          pool_allocation: string | null
          pool_sizes: Json | null
          ranking_weight: number | null
          refund_cutoff_date: string | null
          refund_policy: string | null
          registration_closes_at: string | null
          registration_mode: string | null
          registration_opens_at: string | null
          registration_required: boolean | null
          round_format: string | null
          round_play_by: Json | null
          sanction_notes: string | null
          sanction_reference: string | null
          sanction_status: string | null
          sanctioned_at: string | null
          sanctioned_by: string | null
          sanctioning_org_id: string | null
          schedule_mode: string | null
          scheduling_mode: string | null
          scoring_mode: string | null
          source_league_id: string | null
          source_league_ids: string[] | null
          standard_of_play: string | null
          start_date: string | null
          start_time: string | null
          status: string | null
          swiss_pools: Json | null
          swiss_rounds: Json | null
          updated_at: string | null
          visitor_clubs: string[] | null
          win_condition: string | null
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
          {
            foreignKeyName: "tournament_governance_sanctioning_org_id_fkey"
            columns: ["sanctioning_org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      people_directory: {
        Row: {
          age: number | null
          age_group: string | null
          association_name: string | null
          club_link_count: number | null
          full_name: string | null
          gender: string | null
          id: string | null
          membership_status: string | null
          national_player_number: string | null
          nationality: string | null
          primary_club_id: string | null
          primary_club_name: string | null
          quality_flags: string[] | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["primary_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ledger_reconciliation: {
        Row: {
          club_id: string | null
          club_member_id: string | null
          fee_payment_id: string | null
          gl_amount: number | null
          invoice_number: string | null
          status: string | null
          sub_amount: number | null
        }
        Relationships: []
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
        Args: {
          p_accept: boolean
          p_divisions?: number[]
          p_registration_id: string
        }
        Returns: Json
      }
      add_to_bar_guest_tab: {
        Args: { _lines: Json; _tab_id: string; _token: string }
        Returns: Json
      }
      admin_adjust_ranking_points: {
        Args: { _delta: number; _member_id: string; _reason: string }
        Returns: number
      }
      admin_bill_member_fee: {
        Args: {
          _amount: number
          _club_member_id: string
          _date?: string
          _fee_label: string
          _fee_type?: string
          _income_account: string
        }
        Returns: Json
      }
      admin_correct_rubber_participant: {
        Args: {
          p_fixture_id: string
          p_player_code: string
          p_player_name: string
          p_position: number
          p_reason?: string
          p_side: string
        }
        Returns: Json
      }
      admin_delete_journal_group: {
        Args: { _journal_ref: string; _note?: string }
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
      admin_pair_doubles_players: {
        Args: {
          p_champ_id: string
          p_group_number: number
          p_member_a: string
          p_member_b: string
        }
        Returns: Json
      }
      admin_reorder_ladder: {
        Args: { gender_filter: string; player_ids: string[] }
        Returns: undefined
      }
      admin_reverse_journal_group: {
        Args: { _journal_ref: string; _note?: string }
        Returns: Json
      }
      age_group_for_age: { Args: { _age: number }; Returns: string }
      allocate_next_member_number: {
        Args: { _club_id: string }
        Returns: string
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
      apply_ladder_result: {
        Args: {
          _club_id: string
          _loser_member_id: string
          _movement?: string
          _source?: string
          _source_id?: string
          _winner_member_id: string
        }
        Returns: boolean
      }
      apply_registration_division_choices: {
        Args: { p_registration_id: string }
        Returns: undefined
      }
      approve_club_claim: { Args: { _request_id: string }; Returns: string }
      approve_ladder_move_pending: {
        Args: { _pending_id: string }
        Returns: boolean
      }
      approve_ranking_points_pending: {
        Args: { _note?: string; _pending_id: string }
        Returns: undefined
      }
      archive_club_season: {
        Args: {
          _association_id?: string
          _club_id: string
          _reason?: string
          _season_year: number
        }
        Returns: number
      }
      assign_role_to_member: {
        Args: { _club_id: string; _member_id: string; _role_name: string }
        Returns: undefined
      }
      association_add_placeholder_player: {
        Args: {
          _is_reserve?: boolean
          _league_number?: string
          _name: string
          _player_rank?: number
          _team_id: string
          _tenant_id: string
        }
        Returns: string
      }
      association_create_team: {
        Args: {
          _category?: string
          _club_id: string
          _code?: string
          _is_reserve?: boolean
          _level?: number
          _name: string
          _season_year?: number
          _tenant_id: string
        }
        Returns: string
      }
      association_league_team_players: {
        Args: { _team_id: string; _tenant_id: string }
        Returns: {
          is_captain: boolean
          is_reserve: boolean
          league_number: string
          member_id: string
          player_name: string
          player_rank: number
          registration_id: string
        }[]
      }
      association_league_teams: {
        Args: { _season_year?: number; _tenant_id: string }
        Returns: {
          category: string
          club_id: string
          club_name: string
          created_by_association: boolean
          is_reserve: boolean
          level: number
          player_count: number
          season_year: number
          team_code: string
          team_id: string
          team_name: string
        }[]
      }
      association_save_fixtures: {
        Args: {
          _fixtures: Json
          _platform_association_id: string
          _tenant_id: string
        }
        Returns: number
      }
      auto_complete_past_tournaments: { Args: never; Returns: number }
      award_ranking_points_for_result: {
        Args: {
          _club_id: string
          _loser_member_id: string
          _source_id: string
          _source_type: string
          _weight?: number
          _winner_member_id: string
        }
        Returns: string
      }
      bill_wifi_monthly: { Args: never; Returns: Json }
      can_access_champ_match: {
        Args: { _match_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_league_fixture: {
        Args: { _fixture_id: string; _user_id: string }
        Returns: boolean
      }
      can_browse_invite_directory: {
        Args: { _club_id: string; _tournament_id: string; _uid: string }
        Returns: boolean
      }
      can_manage_tournament:
        | { Args: { _tournament_id: string }; Returns: boolean }
        | {
            Args: { _tournament_id: string; _user_id: string }
            Returns: boolean
          }
      can_mark_bells_match: {
        Args: { _match_id: string; _user_id: string }
        Returns: boolean
      }
      can_operate_device: {
        Args: { _device_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_person: { Args: { _person_id: string }; Returns: boolean }
      can_view_person_dob: { Args: { _person_id: string }; Returns: boolean }
      can_view_tournament: {
        Args: { _tournament_id: string; _user_id: string }
        Returns: boolean
      }
      cancel_doubles_pair: {
        Args: { p_pair_id: string; p_token?: string; p_verify?: string }
        Returns: Json
      }
      cancel_wifi_access: { Args: { _club_member_id: string }; Returns: Json }
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
      champ_actor_member: {
        Args: { p_champ_id: string; p_token: string; p_verify: string }
        Returns: string
      }
      champ_division_is_doubles: {
        Args: { p_champ_id: string; p_group_number: number }
        Returns: boolean
      }
      champ_entry_fee_cents: { Args: { p_champ_id: string }; Returns: number }
      champ_member_accepted: {
        Args: {
          p_champ_id: string
          p_group_number: number
          p_member_id: string
        }
        Returns: boolean
      }
      champ_member_fee_paid: {
        Args: { p_champ_id: string; p_member_id: string }
        Returns: boolean
      }
      champ_member_invited: {
        Args: {
          p_champ_id: string
          p_group_number: number
          p_member_id: string
        }
        Returns: boolean
      }
      champ_pair_settle: { Args: { p_pair_id: string }; Returns: string }
      champ_pairing_locked: { Args: { p_champ_id: string }; Returns: boolean }
      champ_sync_pair_entries: {
        Args: {
          p_a: string
          p_b: string
          p_champ_id: string
          p_group_number: number
        }
        Returns: undefined
      }
      check_ledger_integrity: {
        Args: { p_club_id?: string }
        Returns: {
          bank_balance: number
          club_id: string
          club_name: string
          debtors_balance: number
          debtors_is_credit: boolean
          imbalance: number
          total_credit: number
          total_debit: number
          total_income: number
        }[]
      }
      check_member_duplicate_hint: {
        Args: {
          _club_id: string
          _email?: string
          _name?: string
          _phone?: string
        }
        Returns: {
          is_claimed: boolean
          masked_name: string
          match_kind: string
        }[]
      }
      claim_email_outbox_batch: {
        Args: { p_lease_seconds?: number; p_limit?: number }
        Returns: {
          attempts: number
          body: string
          cc_emails: string[] | null
          club_id: string
          club_member_id: string | null
          created_at: string
          created_by: string | null
          cta_label: string | null
          id: string
          kind: string
          last_error: string | null
          recipient_email: string
          recipient_name: string | null
          ref_id: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
          url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "email_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
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
      claim_unclaimed_membership: {
        Args: { _member_id: string }
        Returns: Json
      }
      club_gateway_fee_percent: {
        Args: { _club_id: string; _method?: string }
        Returns: number
      }
      club_has_capability: {
        Args: { _capability: string; _club_id: string }
        Returns: boolean
      }
      club_has_no_admin: { Args: { _club_id: string }; Returns: boolean }
      count_member_duplicate_hints: {
        Args: { _club_id: string; _name: string; _phone: string }
        Returns: number
      }
      create_league_season: {
        Args: {
          p_association_id: string
          p_copy_teams?: boolean
          p_ends_on?: string
          p_label?: string
          p_make_current?: boolean
          p_season_year: number
          p_starts_on?: string
        }
        Returns: string
      }
      create_subscription_adjustment_invoice: {
        Args: {
          _amount: number
          _club_id: string
          _flag_id?: string
          _member_count: number
          _note?: string
        }
        Returns: string
      }
      current_verified_email: { Args: never; Returns: string }
      default_member_number_prefix: {
        Args: { _name: string; _subdomain: string }
        Returns: string
      }
      delete_league_round_cascade: {
        Args: { _round_id: string }
        Returns: Json
      }
      dismiss_duplicate_pair: {
        Args: { _a: string; _b: string; _reason?: string }
        Returns: undefined
      }
      ensure_platform_association_for_league: {
        Args: { _association_id: string }
        Returns: string
      }
      ensure_tournament_invite_tokens: {
        Args: { p_champ_id: string }
        Returns: {
          club_member_id: string
          invite_token: string
          registration_id: string
        }[]
      }
      find_existing_club_member: {
        Args: {
          _club_id: string
          _email?: string
          _id_number?: string
          _league_number?: string
          _name?: string
          _phone?: string
        }
        Returns: {
          club_member_number: string
          is_claimed: boolean
          match_kind: string
          member_id: string
          member_name: string
        }[]
      }
      find_unclaimed_memberships: {
        Args: never
        Returns: {
          club_id: string
          club_member_number: string
          club_name: string
          club_slug: string
          league_numbers: string
          match_reason: string
          member_id: string
          member_name: string
        }[]
      }
      generate_all_clubs_renewal_invoices: { Args: never; Returns: Json }
      generate_club_whatsapp_invoice: {
        Args: { _club_id: string; _period_start: string }
        Returns: string
      }
      generate_member_renewal_invoices: {
        Args: {
          p_category_ids?: string[]
          p_club_id: string
          p_league_assoc_ids?: string[]
          p_national_body_ids?: string[]
        }
        Returns: Json
      }
      get_bar_guest_tab: {
        Args: { _tab_id: string; _token: string }
        Returns: Json
      }
      get_bells_participant_min: {
        Args: { _member_ids: string[] }
        Returns: {
          club_id: string
          id: string
          name: string
          user_id: string
        }[]
      }
      get_champ_host: {
        Args: { _champ_id: string }
        Returns: {
          club_name: string
          subdomain: string
        }[]
      }
      get_champ_signup_status: {
        Args: { _champ_id: string }
        Returns: {
          club_member_id: string
          has_account: boolean
          has_signed_in: boolean
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
      get_club_delegates_public: {
        Args: { _club_id: string }
        Returns: {
          email: string
          id: string
          name: string
          phone: string
        }[]
      }
      get_club_join_fees: {
        Args: { _club_id: string }
        Returns: {
          abbreviation: string
          active: boolean
          billing_period: string
          body_name: string
          club_id: string
          due_day: number
          fee_annual: number
          fee_class: string
          fee_due_month: number
          fee_payable_to: string
          fee_type: string
          id: string
          pro_rate: boolean
        }[]
      }
      get_club_member_config: {
        Args: { _club_id: string }
        Returns: {
          access_control_type: string
          bank_account_name: string
          bank_account_number: string
          bank_branch_code: string
          bank_name: string
          bank_reference: string
          ble_fallback_enabled: boolean
          club_id: string
          relay_device_type: string
          shelly_ble_control_password: string
          shelly_door_ble_mac: string
          shelly_door_channel: number
          shelly_door_pulse_ms: number
        }[]
      }
      get_club_member_count: { Args: { _club_id: string }; Returns: number }
      get_club_membership_rules_for_member: {
        Args: { _club_id: string }
        Returns: {
          acceptance_statement: string
          current_version: number
          documents: Json
          require_acceptance: boolean
          rules_text: string
        }[]
      }
      get_club_public_fees: {
        Args: { _club_id: string }
        Returns: {
          annual_fee: number
          billing_period: string
          description: string
          fee_class: string
          id: string
          name: string
          sort_order: number
        }[]
      }
      get_club_public_membership_rules: {
        Args: { _club_id: string }
        Returns: {
          acceptance_statement: string
          current_version: number
          documents: Json
          rules_text: string
        }[]
      }
      get_club_whatsapp_usage: {
        Args: { _club_id: string; _period_end: string; _period_start: string }
        Returns: {
          marketing_count: number
          message_count: number
          service_count: number
          subtotal: number
          utility_count: number
        }[]
      }
      get_club_wifi: {
        Args: { _club_id: string }
        Returns: {
          hidden: boolean
          notes: string
          password: string
          security: string
          ssid: string
        }[]
      }
      get_clubs_with_admins: {
        Args: never
        Returns: {
          club_id: string
        }[]
      }
      get_doubles_pairing_state: {
        Args: { p_champ_id: string; p_token?: string; p_verify?: string }
        Returns: Json
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
      get_or_create_venue_qr_code: {
        Args: { _club_id: string }
        Returns: string
      }
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
      get_public_club_by_subdomain: {
        Args: { _subdomain: string }
        Returns: {
          address: string
          chairman_member_id: string
          club_captain_member_id: string
          created_at: string
          email: string
          id: string
          logo_url: string
          name: string
          nsa_club_id: string
          phone: string
          secretary_member_id: string
          show_delegates_on_landing: boolean
          subdomain: string
          tenant_type: string
          treasurer_member_id: string
          visitor_home_clubs_enabled: boolean
        }[]
      }
      get_sla_prompt_state: { Args: { _club_id: string }; Returns: Json }
      get_squash_totals: { Args: { target_user_id: string }; Returns: Json }
      get_squash_totals_by_member: {
        Args: { target_member_id: string }
        Returns: Json
      }
      get_team_captain_codes: {
        Args: { _team_codes: string[] }
        Returns: {
          captain_code: string
          captain_member_id: string
          team_code: string
        }[]
      }
      get_tournament_invite: { Args: { p_token: string }; Returns: Json }
      get_tournament_invite_preview: {
        Args: { p_champ_id: string }
        Returns: Json
      }
      get_wifi_access_status: {
        Args: { _club_member_id: string }
        Returns: {
          active: boolean
          auto_renew: boolean
          charge_enabled: boolean
          current_period_end: string
          has_access: boolean
          monthly_fee: number
          unpaid_amount: number
          wifi_enabled: boolean
        }[]
      }
      has_org_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["org_admin_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_wifi_access: { Args: { _club_member_id: string }; Returns: boolean }
      invite_verification_kind: {
        Args: { p_member_id: string }
        Returns: string
      }
      invite_verification_ok: {
        Args: { p_member_id: string; p_verify: string }
        Returns: boolean
      }
      is_association_admin: {
        Args: { _tenant_id: string; _user_id: string }
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
      is_club_captain: {
        Args: { _club_id: string; _user_id: string }
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
      is_member_eligible_for_tournament: {
        Args: { _club_member_id: string; _tournament_id: string }
        Returns: boolean
      }
      is_member_owner: { Args: { _member_id: string }; Returns: boolean }
      is_national_admin: { Args: { _user_id: string }; Returns: boolean }
      is_person_self: { Args: { _person_id: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      is_platform_association_admin: {
        Args: { _platform_association_id: string; _user_id: string }
        Returns: boolean
      }
      is_public_club_document: { Args: { _path: string }; Returns: boolean }
      is_rankable_member: { Args: { _member_id: string }; Returns: boolean }
      issue_member_invoice: { Args: { _fee_payment_id: string }; Returns: Json }
      ladder_move_apply_now: {
        Args: {
          _club_id: string
          _loser_member_id: string
          _movement?: string
          _winner_member_id: string
        }
        Returns: boolean
      }
      ladder_pyramid_row: {
        Args: { _position: number; _row_sizes?: Json }
        Returns: number
      }
      list_doubles_partner_options: {
        Args: {
          p_champ_id: string
          p_group_number: number
          p_limit?: number
          p_search?: string
          p_token?: string
          p_verify?: string
        }
        Returns: Json
      }
      list_public_clubs: {
        Args: never
        Returns: {
          address: string
          chairman_member_id: string
          club_captain_member_id: string
          created_at: string
          email: string
          id: string
          logo_url: string
          name: string
          nsa_club_id: string
          phone: string
          secretary_member_id: string
          show_delegates_on_landing: boolean
          subdomain: string
          tenant_type: string
          treasurer_member_id: string
        }[]
      }
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
      make_club_slug: { Args: { _name: string }; Returns: string }
      make_org_slug: {
        Args: { _abbrev?: string; _name: string }
        Returns: string
      }
      member_has_permission: {
        Args: { _member_id: string; _permission: string }
        Returns: boolean
      }
      merge_people: {
        Args: { _dup_id: string; _keep_id: string }
        Returns: undefined
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
      move_player_to_lineup:
        | {
            Args: {
              p_club_id: string
              p_club_member_id: string
              p_target_league_id: string
              p_target_position: number
              p_week_start_date: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_allow_multi?: boolean
              p_club_id: string
              p_club_member_id: string
              p_target_league_id: string
              p_target_position: number
              p_week_start_date: string
            }
            Returns: undefined
          }
      my_admin_tenants: {
        Args: never
        Returns: {
          id: string
          name: string
          subdomain: string
          tenant_type: string
        }[]
      }
      new_invite_token: { Args: never; Returns: string }
      next_bottom_ladder_position: {
        Args: { _club_id: string; _gender: string }
        Returns: number
      }
      next_league_week_start: {
        Args: { _dow: number; _from: string }
        Returns: string
      }
      norm_person_name: { Args: { _name: string }; Returns: string }
      norm_phone_tail: { Args: { _phone: string }; Returns: string }
      notify_champ_round_draw: {
        Args: {
          p_champ_id: string
          p_group_number: number
          p_round_number: number
          p_sections?: number[]
        }
        Returns: Json
      }
      notify_doubles_pair: { Args: { p_pair_id: string }; Returns: Json }
      open_bar_guest_tab: {
        Args: { _code: string; _guest_name: string }
        Returns: Json
      }
      org_descendants: {
        Args: { _org_id: string }
        Returns: {
          org_id: string
        }[]
      }
      org_federation_root: { Args: { _org_id: string }; Returns: string }
      org_owning_association: { Args: { _org_id: string }; Returns: string }
      people_duplicate_candidates: {
        Args: { _limit?: number }
        Returns: {
          confidence: number
          person_a_club: string
          person_a_id: string
          person_a_name: string
          person_b_club: string
          person_b_id: string
          person_b_name: string
          reasons: string[]
        }[]
      }
      person_age: { Args: { _person_id: string }; Returns: number }
      person_age_group: { Args: { _person_id: string }; Returns: string }
      post_gateway_fee: {
        Args: {
          _amount: number
          _club_id: string
          _club_member_id?: string
          _desc: string
          _journal_ref: string
          _method?: string
        }
        Returns: number
      }
      post_journal: {
        Args: {
          p_club_id: string
          p_description?: string
          p_lines: Json
          p_ref?: string
        }
        Returns: string
      }
      promote_all_sportyhq_associations: {
        Args: { _create_tenants?: boolean }
        Returns: number
      }
      promote_all_sportyhq_clubs: {
        Args: { _limit?: number; _parent_key?: string }
        Returns: number
      }
      promote_all_sportyhq_org_members: {
        Args: { _limit?: number; _org_id?: string }
        Returns: number
      }
      promote_sportyhq_association: {
        Args: { _create_tenant?: boolean; _org_id: string }
        Returns: string
      }
      promote_sportyhq_org: {
        Args: { _club_id?: string; _org_id: string; _parent_org_id?: string }
        Returns: string
      }
      promote_sportyhq_org_member: {
        Args: { _member_id: string; _person_id?: string }
        Returns: string
      }
      propose_doubles_partner: {
        Args: {
          p_champ_id: string
          p_group_number: number
          p_partner_member_id: string
          p_pay_for_partner?: boolean
          p_token?: string
          p_verify?: string
        }
        Returns: Json
      }
      purchase_data_bundle: {
        Args: {
          _club_id: string
          _cost?: number
          _notes?: string
          _purchased_at?: string
          _size_mb: number
        }
        Returns: string
      }
      qr_bar_sale_status: { Args: { _sale_id: string }; Returns: Json }
      qr_record_visitor_sale: {
        Args: {
          _bar_item_id: string
          _code: string
          _note?: string
          _payment_method?: string
          _quantity: number
          _visitor_name: string
        }
        Returns: Json
      }
      recalc_club_ranking_points: {
        Args: { _apply?: boolean; _club_id: string }
        Returns: {
          computed: number
          drift: number
          member_id: string
          member_name: string
          stored: number
        }[]
      }
      recalc_league_fixture_totals: {
        Args: { _fixture_id: string }
        Returns: undefined
      }
      record_bar_terminal_sale: {
        Args: {
          _buyer_name?: string
          _club_id?: string
          _code?: string
          _lines: Json
        }
        Returns: Json
      }
      record_collection_payment: {
        Args: { _collection_id: string }
        Returns: Json
      }
      record_mandate_initial_payment: {
        Args: { _mandate_id: string }
        Returns: Json
      }
      register_doubles_pair: {
        Args: {
          _champ_id: string
          _member_id: string
          _partner_member_id: string
        }
        Returns: Json
      }
      reject_club_claim: {
        Args: { _reason: string; _request_id: string }
        Returns: undefined
      }
      reject_ladder_move_pending: {
        Args: { _pending_id: string }
        Returns: boolean
      }
      release_email_outbox_lease: { Args: never; Returns: undefined }
      rename_internal_league_association: {
        Args: { _association_id: string; _discipline?: string; _name: string }
        Returns: undefined
      }
      request_account_delegation: {
        Args: {
          _delegate_cell: string
          _delegate_member_number: string
          _grantor_member_id: string
        }
        Returns: {
          club_id: string
          created_at: string
          delegate_member_id: string
          grantor_member_id: string
          id: string
          requested_at: string
          requested_by_user_id: string | null
          responded_at: string | null
          revoked_at: string | null
          revoked_by_user_id: string | null
          scope: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "member_account_delegations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_club_claim: {
        Args: {
          _claimed_role: string
          _club_id: string
          _note: string
          _phone: string
        }
        Returns: string
      }
      request_wifi_access: { Args: { _club_member_id: string }; Returns: Json }
      reset_club_finances: { Args: { p_club_id: string }; Returns: Json }
      resolve_qr_short_code: { Args: { _code: string }; Returns: Json }
      respond_doubles_pair: {
        Args: {
          p_accept: boolean
          p_pair_id: string
          p_token?: string
          p_verify?: string
        }
        Returns: Json
      }
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
      respond_tournament_invite: {
        Args: { p_accept: boolean; p_token: string }
        Returns: Json
      }
      respond_tournament_invite_public: {
        Args: {
          p_accept: boolean
          p_divisions?: number[]
          p_token: string
          p_verify?: string
        }
        Returns: Json
      }
      reverse_ranking_points_pending: {
        Args: { _pending_id: string; _reason?: string }
        Returns: undefined
      }
      review_membership_application: {
        Args: { _approve: boolean; _member_id: string }
        Returns: undefined
      }
      review_platform_invoice_eft_proof: {
        Args: { _approve: boolean; _invoice_id: string; _note?: string }
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
          booking_id: string | null
          bracket_position: number | null
          bye_member_id: string | null
          champ_id: string
          court_id: number | null
          created_at: string
          forfeit_member_id: string | null
          game_scores: string | null
          group_number: number
          handicap_a: number
          handicap_b: number
          handicap_locked: boolean
          id: string
          is_bye: boolean
          leg: string | null
          partner_a_member_id: string | null
          partner_b_member_id: string | null
          placeholder_a: string | null
          placeholder_b: string | null
          play_by: string | null
          player_a_member_id: string | null
          player_b_member_id: string | null
          pool_number: number | null
          round_id: string | null
          round_number: number
          scheduled_date: string | null
          scheduled_time: string | null
          score: string | null
          section_number: number | null
          side_a_points: number | null
          side_b_points: number | null
          stage: string
          stage_label: string | null
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
      save_marker_match_result: {
        Args: {
          _club_id: string
          _confirmed: boolean
          _duration_s: number
          _game_scores: string
          _match_id: string
          _notes: string
          _player_a_member_id: string
          _player_b_member_id: string
          _score: string
          _tournament_match_id?: string
          _winner_member_id: string
        }
        Returns: string
      }
      scope_eligible_club_ids: {
        Args: { _club_id: string; _owner_org_id: string; _scope: string }
        Returns: {
          club_id: string
        }[]
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
      search_registerable_clubs: {
        Args: { _q: string }
        Returns: {
          claim_pending: boolean
          id: string
          is_claimable: boolean
          name: string
          parent_association: string
          region: string
          subdomain: string
          tenant_type: string
        }[]
      }
      seed_linked_national_body_fees: {
        Args: { p_league_association_id: string; p_season_year?: number }
        Returns: number
      }
      seed_member_default_fees: {
        Args: { p_club_member_id: string }
        Returns: undefined
      }
      seed_ranking_points_from_ladder: {
        Args: {
          _club_id: string
          _step?: number
          _top_score?: number
          _unranked_default?: number
        }
        Returns: number
      }
      self_schedule_champ_match: {
        Args: {
          p_court_id: number
          p_date: string
          p_duration_minutes?: number
          p_match_id: string
          p_time: string
        }
        Returns: Json
      }
      send_champ_invite_notifications: {
        Args: {
          p_app_silent?: boolean
          p_champ_id: string
          p_description?: string
          p_message: string
          p_mode?: string
          p_recipients: Json
          p_send_email?: boolean
          p_title: string
        }
        Returns: Json
      }
      send_csir_invite_via_club_smtp: {
        Args: { p_email: string }
        Returns: number
      }
      send_tournament_invites_via_platform: {
        Args: {
          p_champ_id: string
          p_club_host: string
          p_club_name: string
          p_functions_url: string
          p_key: string
          p_limit: number
          p_tournament_name: string
        }
        Returns: number
      }
      set_club_billing_frequency: {
        Args: { _billing_option: string; _club_id: string }
        Returns: string
      }
      set_club_subscription_baseline: {
        Args: {
          _actor_name?: string
          _amount: number
          _club_id: string
          _currency: string
          _cycle: string
          _member_count: number
        }
        Returns: string
      }
      set_club_subscription_baseline_cycle: {
        Args: { _club_id: string; _cycle: string }
        Returns: undefined
      }
      set_doubles_pairing_locked: {
        Args: { p_champ_id: string; p_locked: boolean }
        Returns: boolean
      }
      settle_bar_guest_tab: {
        Args: { _method: string; _tab_id: string; _token: string }
        Returns: Json
      }
      snapshot_all_club_rankings: { Args: never; Returns: number }
      snapshot_club_rankings: {
        Args: { _club_id: string; _period?: string }
        Returns: string
      }
      submit_platform_invoice_eft_proof: {
        Args: { _invoice_id: string; _path: string }
        Returns: undefined
      }
      sync_association_clubs_from_federation: {
        Args: { _tenant_id?: string }
        Returns: number
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
          booking_id: string | null
          bracket_position: number | null
          bye_member_id: string | null
          champ_id: string
          court_id: number | null
          created_at: string
          forfeit_member_id: string | null
          game_scores: string | null
          group_number: number
          handicap_a: number
          handicap_b: number
          handicap_locked: boolean
          id: string
          is_bye: boolean
          leg: string | null
          partner_a_member_id: string | null
          partner_b_member_id: string | null
          placeholder_a: string | null
          placeholder_b: string | null
          play_by: string | null
          player_a_member_id: string | null
          player_b_member_id: string | null
          pool_number: number | null
          round_id: string | null
          round_number: number
          scheduled_date: string | null
          scheduled_time: string | null
          score: string | null
          section_number: number | null
          side_a_points: number | null
          side_b_points: number | null
          stage: string
          stage_label: string | null
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
      tournament_division_options: {
        Args: { p_champ_id: string; p_member_id?: string }
        Returns: Json
      }
      tournament_doubles_pairs: { Args: { p_champ_id: string }; Returns: Json }
      tournament_eligibility_summary: {
        Args: { _tournament_id: string }
        Returns: {
          club_count: number
          member_count: number
          scope: string
          scope_org_name: string
        }[]
      }
      tournament_eligible_club_ids: {
        Args: { _tournament_id: string }
        Returns: {
          club_id: string
        }[]
      }
      tournament_fee_allocation: {
        Args: { p_tournament_id: string }
        Returns: {
          association_fee_cents: number
          entry_fee_cents: number
          federation_fee_cents: number
          host_fee_cents: number
          other_expenses_cents: number
          over_allocated: boolean
          owner_kind: string
          owner_name: string
          owner_net_cents: number
          owner_org_id: string
          platform_fee_cents: number
        }[]
      }
      tournament_invite_directory: {
        Args: {
          p_club_id?: string
          p_club_ids?: string[]
          p_limit?: number
          p_scope?: string
          p_search?: string
          p_tournament_id?: string
        }
        Returns: {
          club_id: string
          club_name: string
          display_name: string
          gender: string
          invite_status: string
          is_own_club: boolean
          is_user: boolean
          ladder_position: number
          member_id: string
          ranking_points: number
        }[]
      }
      tournament_invite_member_ids: {
        Args: {
          p_club_id?: string
          p_club_ids?: string[]
          p_scope?: string
          p_tournament_id?: string
        }
        Returns: {
          club_id: string
          member_id: string
        }[]
      }
      tournament_invite_members_for_club: {
        Args: {
          p_club_id: string
          p_scope_club_id?: string
          p_tournament_id: string
        }
        Returns: {
          club_id: string
          club_name: string
          display_name: string
          gender: string
          invite_status: string
          is_own_club: boolean
          is_user: boolean
          ladder_position: number
          member_id: string
          ranking_points: number
        }[]
      }
      tournament_invite_scope_tree: {
        Args: { p_club_id?: string; p_scope?: string; p_tournament_id?: string }
        Returns: {
          association_id: string
          association_name: string
          club_id: string
          club_name: string
          email_count: number
          has_members: boolean
          is_own_club: boolean
          member_count: number
          registered_count: number
        }[]
      }
      tournament_owner_entity: {
        Args: { p_tournament_id: string }
        Returns: {
          owner_kind: string
          owner_name: string
          owner_org_id: string
        }[]
      }
      unarchive_club_season: {
        Args: {
          _association_id?: string
          _club_id: string
          _season_year: number
        }
        Returns: number
      }
      unschedule_champ_match: { Args: { p_match_id: string }; Returns: Json }
      validate_challenge_gender_group: {
        Args: { _a: string; _b: string; _club_id: string }
        Returns: boolean
      }
      viewer_is_opposing_captain_for_registration: {
        Args: {
          _reg_club_member_id: string
          _reg_league_id: string
          _viewer_user_id: string
        }
        Returns: boolean
      }
      whatsapp_rate: {
        Args: { _category?: string; _club_id: string }
        Returns: number
      }
      wifi_fee_for_club: {
        Args: { _club_id: string }
        Returns: {
          amount: number
          label: string
        }[]
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
        | "member_credits"
        | "opening_balance_equity"
        | "cleaning_services"
        | "wifi_income"
        | "security"
      integration_provider:
        | "strava"
        | "apple_health"
        | "samsung_health"
        | "garmin"
      member_status: "active" | "suspended" | "resigned"
      member_suspension_status:
        | "active"
        | "warning"
        | "suspended"
        | "manual_hold"
      org_admin_role:
        | "super_admin"
        | "competition_admin"
        | "finance_admin"
        | "association_admin"
        | "tournament_director"
        | "league_admin"
        | "referee"
      org_kind: "national" | "association" | "club"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
        "member_credits",
        "opening_balance_equity",
        "cleaning_services",
        "wifi_income",
        "security",
      ],
      integration_provider: [
        "strava",
        "apple_health",
        "samsung_health",
        "garmin",
      ],
      member_status: ["active", "suspended", "resigned"],
      member_suspension_status: [
        "active",
        "warning",
        "suspended",
        "manual_hold",
      ],
      org_admin_role: [
        "super_admin",
        "competition_admin",
        "finance_admin",
        "association_admin",
        "tournament_director",
        "league_admin",
        "referee",
      ],
      org_kind: ["national", "association", "club"],
    },
  },
} as const
