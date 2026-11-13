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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      api_cache: {
        Row: {
          body: Json
          fetched_at: string
          key: string
        }
        Insert: {
          body: Json
          fetched_at?: string
          key: string
        }
        Update: {
          body?: Json
          fetched_at?: string
          key?: string
        }
        Relationships: []
      }
      cases: {
        Row: {
          candidate_confirmed_by: string | null
          candidate_institution: string
          candidate_name: string
          candidate_orcid: string | null
          candidate_profile_ids: string[]
          created_at: string
          created_by: string
          id: string
          title: string
        }
        Insert: {
          candidate_confirmed_by?: string | null
          candidate_institution: string
          candidate_name: string
          candidate_orcid?: string | null
          candidate_profile_ids?: string[]
          created_at?: string
          created_by?: string
          id?: string
          title: string
        }
        Update: {
          candidate_confirmed_by?: string | null
          candidate_institution?: string
          candidate_name?: string
          candidate_orcid?: string | null
          candidate_profile_ids?: string[]
          created_at?: string
          created_by?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      decisions: {
        Row: {
          decided_at: string
          decided_by: string
          decision: string
          id: string
          reason: string | null
          screening_name_id: string
        }
        Insert: {
          decided_at?: string
          decided_by: string
          decision: string
          id?: string
          reason?: string | null
          screening_name_id: string
        }
        Update: {
          decided_at?: string
          decided_by?: string
          decision?: string
          id?: string
          reason?: string | null
          screening_name_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_screening_name_id_fkey"
            columns: ["screening_name_id"]
            isOneToOne: false
            referencedRelation: "screening_names"
            referencedColumns: ["id"]
          },
        ]
      }
      declarations: {
        Row: {
          case_id: string
          declared_name: string
          id: string
          note: string | null
          relationship: string
        }
        Insert: {
          case_id: string
          declared_name: string
          id?: string
          note?: string | null
          relationship: string
        }
        Update: {
          case_id?: string
          declared_name?: string
          id?: string
          note?: string | null
          relationship?: string
        }
        Relationships: [
          {
            foreignKeyName: "declarations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      findings: {
        Row: {
          evidence: Json
          id: string
          rule: string
          screening_name_id: string
          severity: string
        }
        Insert: {
          evidence?: Json
          id?: string
          rule: string
          screening_name_id: string
          severity: string
        }
        Update: {
          evidence?: Json
          id?: string
          rule?: string
          screening_name_id?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "findings_screening_name_id_fkey"
            columns: ["screening_name_id"]
            isOneToOne: false
            referencedRelation: "screening_names"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_events: {
        Row: {
          created_at: string
          event: string
          id: number
          ms_since_row_opened: number | null
          ms_since_session_start: number | null
          option_position: number | null
          participant_code: string
          profile_id: string | null
          reviewer_id: string | null
          selection: string | null
          session_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: never
          ms_since_row_opened?: number | null
          ms_since_session_start?: number | null
          option_position?: number | null
          participant_code: string
          profile_id?: string | null
          reviewer_id?: string | null
          selection?: string | null
          session_id: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: never
          ms_since_row_opened?: number | null
          ms_since_session_start?: number | null
          option_position?: number | null
          participant_code?: string
          profile_id?: string | null
          reviewer_id?: string | null
          selection?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "research_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      proposed_reviewers: {
        Row: {
          case_id: string
          id: string
          typed_institution: string
          typed_name: string
          typed_orcid: string | null
        }
        Insert: {
          case_id: string
          id?: string
          typed_institution: string
          typed_name: string
          typed_orcid?: string | null
        }
        Update: {
          case_id?: string
          id?: string
          typed_institution?: string
          typed_name?: string
          typed_orcid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposed_reviewers_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      research_sessions: {
        Row: {
          consented: boolean
          facilitator: string
          id: string
          participant_code: string
          started_at: string
        }
        Insert: {
          consented: boolean
          facilitator: string
          id: string
          participant_code: string
          started_at?: string
        }
        Update: {
          consented?: boolean
          facilitator?: string
          id?: string
          participant_code?: string
          started_at?: string
        }
        Relationships: []
      }
      screening_names: {
        Row: {
          check_stage: string | null
          check_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          error: string | null
          id: string
          identity_method: string | null
          identity_status: string
          profile_ids: string[]
          reason: string | null
          result: string | null
          reviewer_id: string
          screening_id: string
        }
        Insert: {
          check_stage?: string | null
          check_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          error?: string | null
          id?: string
          identity_method?: string | null
          identity_status?: string
          profile_ids?: string[]
          reason?: string | null
          result?: string | null
          reviewer_id: string
          screening_id: string
        }
        Update: {
          check_stage?: string | null
          check_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          error?: string | null
          id?: string
          identity_method?: string | null
          identity_status?: string
          profile_ids?: string[]
          reason?: string | null
          result?: string | null
          reviewer_id?: string
          screening_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "screening_names_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "proposed_reviewers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_names_screening_id_fkey"
            columns: ["screening_id"]
            isOneToOne: false
            referencedRelation: "screenings"
            referencedColumns: ["id"]
          },
        ]
      }
      screenings: {
        Row: {
          case_id: string
          finished_at: string | null
          id: string
          started_at: string
          status: string
        }
        Insert: {
          case_id: string
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Update: {
          case_id?: string
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "screenings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
