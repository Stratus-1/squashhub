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
          court_id: number
          created_at: string
          date: string
          end_time: string
          id: string
          start_time: string
          status: string
          user_id: string
        }
        Insert: {
          court_id: number
          created_at?: string
          date: string
          end_time: string
          id?: string
          start_time: string
          status?: string
          user_id: string
        }
        Update: {
          court_id?: number
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          start_time?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_court_id_fkey"
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
          created_at: string
          id: string
          opponent_id: string
          proposed_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          challenger_id: string
          created_at?: string
          id?: string
          opponent_id: string
          proposed_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          challenger_id?: string
          created_at?: string
          id?: string
          opponent_id?: string
          proposed_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      courts: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
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
          confirmed: boolean
          court_id: number | null
          created_at: string
          disputed: boolean
          game_scores: string | null
          id: string
          match_date: string
          player_a: string
          player_b: string
          score: string | null
          submitted_by: string | null
          winner_id: string | null
        }
        Insert: {
          challenge_id?: string | null
          confirmed?: boolean
          court_id?: number | null
          created_at?: string
          disputed?: boolean
          game_scores?: string | null
          id?: string
          match_date?: string
          player_a: string
          player_b: string
          score?: string | null
          submitted_by?: string | null
          winner_id?: string | null
        }
        Update: {
          challenge_id?: string | null
          confirmed?: boolean
          court_id?: number | null
          created_at?: string
          disputed?: boolean
          game_scores?: string | null
          id?: string
          match_date?: string
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
      [_ in never]: never
    }
    Functions: {
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
      respond_to_booking_invite: {
        Args: { invite_token: string; new_status: string; reason?: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      integration_provider: [
        "strava",
        "apple_health",
        "samsung_health",
        "garmin",
      ],
    },
  },
} as const
