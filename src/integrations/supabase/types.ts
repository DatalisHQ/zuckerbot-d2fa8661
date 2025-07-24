export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      brand_analysis: {
        Row: {
          analysis_status: string | null
          brand_name: string | null
          brand_url: string
          business_category: string | null
          created_at: string
          id: string
          main_products: Json | null
          niche: string | null
          scraped_content: string | null
          updated_at: string
          user_id: string | null
          value_propositions: string[] | null
        }
        Insert: {
          analysis_status?: string | null
          brand_name?: string | null
          brand_url: string
          business_category?: string | null
          created_at?: string
          id?: string
          main_products?: Json | null
          niche?: string | null
          scraped_content?: string | null
          updated_at?: string
          user_id?: string | null
          value_propositions?: string[] | null
        }
        Update: {
          analysis_status?: string | null
          brand_name?: string | null
          brand_url?: string
          business_category?: string | null
          created_at?: string
          id?: string
          main_products?: Json | null
          niche?: string | null
          scraped_content?: string | null
          updated_at?: string
          user_id?: string | null
          value_propositions?: string[] | null
        }
        Relationships: []
      }
      competitive_reports: {
        Row: {
          competitor_count: number | null
          created_at: string
          executive_summary: string | null
          generated_data: Json
          id: string
          key_findings: Json | null
          recommendations: Json | null
          report_name: string
          report_type: string
          status: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          competitor_count?: number | null
          created_at?: string
          executive_summary?: string | null
          generated_data: Json
          id?: string
          key_findings?: Json | null
          recommendations?: Json | null
          report_name: string
          report_type: string
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          competitor_count?: number | null
          created_at?: string
          executive_summary?: string | null
          generated_data?: Json
          id?: string
          key_findings?: Json | null
          recommendations?: Json | null
          report_name?: string
          report_type?: string
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      competitor_discovery: {
        Row: {
          brand_analysis_id: string | null
          created_at: string
          discovered_competitors: Json | null
          discovery_status: string | null
          id: string
          search_query: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          brand_analysis_id?: string | null
          created_at?: string
          discovered_competitors?: Json | null
          discovery_status?: string | null
          id?: string
          search_query: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          brand_analysis_id?: string | null
          created_at?: string
          discovered_competitors?: Json | null
          discovery_status?: string | null
          id?: string
          search_query?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_discovery_brand_analysis_id_fkey"
            columns: ["brand_analysis_id"]
            isOneToOne: false
            referencedRelation: "brand_analysis"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_intelligence: {
        Row: {
          analysis_status: string | null
          competitor_discovery_id: string | null
          competitor_name: string
          competitor_url: string
          created_at: string
          detailed_analysis: Json | null
          feature_matrix: Json | null
          id: string
          market_position: Json | null
          pricing_info: Json | null
          sentiment_analysis: Json | null
          social_presence: Json | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          analysis_status?: string | null
          competitor_discovery_id?: string | null
          competitor_name: string
          competitor_url: string
          created_at?: string
          detailed_analysis?: Json | null
          feature_matrix?: Json | null
          id?: string
          market_position?: Json | null
          pricing_info?: Json | null
          sentiment_analysis?: Json | null
          social_presence?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          analysis_status?: string | null
          competitor_discovery_id?: string | null
          competitor_name?: string
          competitor_url?: string
          created_at?: string
          detailed_analysis?: Json | null
          feature_matrix?: Json | null
          id?: string
          market_position?: Json | null
          pricing_info?: Json | null
          sentiment_analysis?: Json | null
          social_presence?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_intelligence_competitor_discovery_id_fkey"
            columns: ["competitor_discovery_id"]
            isOneToOne: false
            referencedRelation: "competitor_discovery"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_metrics: {
        Row: {
          calculation_date: string
          created_at: string
          id: string
          metadata: Json | null
          metric_name: string
          metric_type: string
          metric_value: number | null
          time_period: string
          user_id: string | null
        }
        Insert: {
          calculation_date?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          metric_name: string
          metric_type: string
          metric_value?: number | null
          time_period: string
          user_id?: string | null
        }
        Update: {
          calculation_date?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          metric_name?: string
          metric_type?: string
          metric_value?: number | null
          time_period?: string
          user_id?: string | null
        }
        Relationships: []
      }
      monitoring_alerts: {
        Row: {
          alert_type: string
          created_at: string
          current_state: Json | null
          description: string | null
          detected_changes: Json | null
          id: string
          is_read: boolean | null
          monitoring_config_id: string | null
          previous_state: Json | null
          severity: string
          title: string
          user_id: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          current_state?: Json | null
          description?: string | null
          detected_changes?: Json | null
          id?: string
          is_read?: boolean | null
          monitoring_config_id?: string | null
          previous_state?: Json | null
          severity: string
          title: string
          user_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          current_state?: Json | null
          description?: string | null
          detected_changes?: Json | null
          id?: string
          is_read?: boolean | null
          monitoring_config_id?: string | null
          previous_state?: Json | null
          severity?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_alerts_monitoring_config_id_fkey"
            columns: ["monitoring_config_id"]
            isOneToOne: false
            referencedRelation: "monitoring_config"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_config: {
        Row: {
          alert_threshold: Json | null
          check_frequency_hours: number | null
          competitor_name: string
          competitor_url: string
          created_at: string
          id: string
          is_active: boolean | null
          monitoring_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          alert_threshold?: Json | null
          check_frequency_hours?: number | null
          competitor_name: string
          competitor_url: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          monitoring_type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          alert_threshold?: Json | null
          check_frequency_hours?: number | null
          competitor_name?: string
          competitor_url?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          monitoring_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      monitoring_history: {
        Row: {
          changes_detected: Json | null
          check_timestamp: string
          error_message: string | null
          id: string
          monitoring_config_id: string | null
          monitoring_data: Json
          status: string
        }
        Insert: {
          changes_detected?: Json | null
          check_timestamp?: string
          error_message?: string | null
          id?: string
          monitoring_config_id?: string | null
          monitoring_data: Json
          status: string
        }
        Update: {
          changes_detected?: Json | null
          check_timestamp?: string
          error_message?: string | null
          id?: string
          monitoring_config_id?: string | null
          monitoring_data?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_history_monitoring_config_id_fkey"
            columns: ["monitoring_config_id"]
            isOneToOne: false
            referencedRelation: "monitoring_config"
            referencedColumns: ["id"]
          },
        ]
      }
      strategic_insights: {
        Row: {
          action_items: Json | null
          brand_analysis_id: string | null
          category: string | null
          created_at: string
          description: string
          effort_score: number | null
          id: string
          impact_score: number | null
          insight_type: string
          is_implemented: boolean | null
          priority: string
          supporting_data: Json | null
          timeframe: string | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          action_items?: Json | null
          brand_analysis_id?: string | null
          category?: string | null
          created_at?: string
          description: string
          effort_score?: number | null
          id?: string
          impact_score?: number | null
          insight_type: string
          is_implemented?: boolean | null
          priority: string
          supporting_data?: Json | null
          timeframe?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          action_items?: Json | null
          brand_analysis_id?: string | null
          category?: string | null
          created_at?: string
          description?: string
          effort_score?: number | null
          id?: string
          impact_score?: number | null
          insight_type?: string
          is_implemented?: boolean | null
          priority?: string
          supporting_data?: Json | null
          timeframe?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "strategic_insights_brand_analysis_id_fkey"
            columns: ["brand_analysis_id"]
            isOneToOne: false
            referencedRelation: "brand_analysis"
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
    Enums: {},
  },
} as const
