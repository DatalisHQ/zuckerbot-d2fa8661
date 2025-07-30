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
      ad_campaigns: {
        Row: {
          brand_analysis: Json | null
          campaign_name: string
          created_at: string
          current_step: number
          framework_selection: Json | null
          generated_ads: Json | null
          id: string
          pipeline_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_analysis?: Json | null
          campaign_name?: string
          created_at?: string
          current_step?: number
          framework_selection?: Json | null
          generated_ads?: Json | null
          id?: string
          pipeline_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_analysis?: Json | null
          campaign_name?: string
          created_at?: string
          current_step?: number
          framework_selection?: Json | null
          generated_ads?: Json | null
          id?: string
          pipeline_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ad_sets: {
        Row: {
          call_to_action: string
          campaign_id: string
          created_at: string
          creative_concept: string | null
          framework_used: string | null
          headline: string
          id: string
          is_saved: boolean | null
          performance_score: number | null
          primary_text: string
          set_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          call_to_action: string
          campaign_id: string
          created_at?: string
          creative_concept?: string | null
          framework_used?: string | null
          headline: string
          id?: string
          is_saved?: boolean | null
          performance_score?: number | null
          primary_text: string
          set_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          call_to_action?: string
          campaign_id?: string
          created_at?: string
          creative_concept?: string | null
          framework_used?: string | null
          headline?: string
          id?: string
          is_saved?: boolean | null
          performance_score?: number | null
          primary_text?: string
          set_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_sets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_analysis: {
        Row: {
          analysis_status: string | null
          brand_name: string | null
          brand_url: string
          business_category: string | null
          business_display_name: string | null
          created_at: string
          id: string
          is_active: boolean | null
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
          business_display_name?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
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
          business_display_name?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
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
      competitor_ad_insights: {
        Row: {
          ads_data: Json
          competitor_list_id: string
          competitor_name: string
          created_at: string
          creative_trends: Json | null
          ctas: Json | null
          hooks: Json | null
          id: string
          total_ads_found: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ads_data?: Json
          competitor_list_id: string
          competitor_name: string
          created_at?: string
          creative_trends?: Json | null
          ctas?: Json | null
          hooks?: Json | null
          id?: string
          total_ads_found?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ads_data?: Json
          competitor_list_id?: string
          competitor_name?: string
          created_at?: string
          creative_trends?: Json | null
          ctas?: Json | null
          hooks?: Json | null
          id?: string
          total_ads_found?: number | null
          updated_at?: string
          user_id?: string
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
      competitor_lists: {
        Row: {
          auto_generated: boolean | null
          brand_analysis_id: string | null
          competitors: Json
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_generated?: boolean | null
          brand_analysis_id?: string | null
          competitors?: Json
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_generated?: boolean | null
          brand_analysis_id?: string | null
          competitors?: Json
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      competitor_profiles: {
        Row: {
          audience: string | null
          competitor_list_id: string
          competitor_name: string
          competitor_url: string | null
          created_at: string
          id: string
          niche: string | null
          scraped_content: string | null
          tone: string | null
          updated_at: string
          user_id: string
          value_props: Json | null
        }
        Insert: {
          audience?: string | null
          competitor_list_id: string
          competitor_name: string
          competitor_url?: string | null
          created_at?: string
          id?: string
          niche?: string | null
          scraped_content?: string | null
          tone?: string | null
          updated_at?: string
          user_id: string
          value_props?: Json | null
        }
        Update: {
          audience?: string | null
          competitor_list_id?: string
          competitor_name?: string
          competitor_url?: string | null
          created_at?: string
          id?: string
          niche?: string | null
          scraped_content?: string | null
          tone?: string | null
          updated_at?: string
          user_id?: string
          value_props?: Json | null
        }
        Relationships: []
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
      facebook_ad_creatives: {
        Row: {
          ad_id: string | null
          body: string | null
          call_to_action: string | null
          created_at: string
          creative_id: string
          creative_name: string | null
          creative_type: string | null
          id: string
          image_url: string | null
          link_url: string | null
          performance_score: number | null
          raw_data: Json | null
          title: string | null
          updated_at: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          ad_id?: string | null
          body?: string | null
          call_to_action?: string | null
          created_at?: string
          creative_id: string
          creative_name?: string | null
          creative_type?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          performance_score?: number | null
          raw_data?: Json | null
          title?: string | null
          updated_at?: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          ad_id?: string | null
          body?: string | null
          call_to_action?: string | null
          created_at?: string
          creative_id?: string
          creative_name?: string | null
          creative_type?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          performance_score?: number | null
          raw_data?: Json | null
          title?: string | null
          updated_at?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: []
      }
      facebook_ad_metrics: {
        Row: {
          ad_id: string | null
          adset_id: string | null
          campaign_id: string | null
          clicks: number | null
          conversion_value: number | null
          conversions: number | null
          cost_per_conversion: number | null
          cpc: number | null
          cpm: number | null
          cpp: number | null
          created_at: string
          ctr: number | null
          date_start: string
          date_stop: string
          frequency: number | null
          id: string
          impressions: number | null
          raw_data: Json | null
          reach: number | null
          spend: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          clicks?: number | null
          conversion_value?: number | null
          conversions?: number | null
          cost_per_conversion?: number | null
          cpc?: number | null
          cpm?: number | null
          cpp?: number | null
          created_at?: string
          ctr?: number | null
          date_start: string
          date_stop: string
          frequency?: number | null
          id?: string
          impressions?: number | null
          raw_data?: Json | null
          reach?: number | null
          spend?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          clicks?: number | null
          conversion_value?: number | null
          conversions?: number | null
          cost_per_conversion?: number | null
          cpc?: number | null
          cpm?: number | null
          cpp?: number | null
          created_at?: string
          ctr?: number | null
          date_start?: string
          date_stop?: string
          frequency?: number | null
          id?: string
          impressions?: number | null
          raw_data?: Json | null
          reach?: number | null
          spend?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      facebook_audiences: {
        Row: {
          audience_id: string
          audience_name: string
          audience_size: number | null
          audience_type: string | null
          behaviors: Json | null
          created_at: string
          demographics: Json | null
          description: string | null
          id: string
          interests: Json | null
          raw_data: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audience_id: string
          audience_name: string
          audience_size?: number | null
          audience_type?: string | null
          behaviors?: Json | null
          created_at?: string
          demographics?: Json | null
          description?: string | null
          id?: string
          interests?: Json | null
          raw_data?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audience_id?: string
          audience_name?: string
          audience_size?: number | null
          audience_type?: string | null
          behaviors?: Json | null
          created_at?: string
          demographics?: Json | null
          description?: string | null
          id?: string
          interests?: Json | null
          raw_data?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      facebook_campaigns: {
        Row: {
          campaign_id: string
          campaign_name: string
          created_at: string
          created_time: string | null
          daily_budget: number | null
          end_time: string | null
          id: string
          lifetime_budget: number | null
          objective: string | null
          raw_data: Json | null
          start_time: string | null
          status: string | null
          updated_at: string
          updated_time: string | null
          user_id: string
        }
        Insert: {
          campaign_id: string
          campaign_name: string
          created_at?: string
          created_time?: string | null
          daily_budget?: number | null
          end_time?: string | null
          id?: string
          lifetime_budget?: number | null
          objective?: string | null
          raw_data?: Json | null
          start_time?: string | null
          status?: string | null
          updated_at?: string
          updated_time?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string
          campaign_name?: string
          created_at?: string
          created_time?: string | null
          daily_budget?: number | null
          end_time?: string | null
          id?: string
          lifetime_budget?: number | null
          objective?: string | null
          raw_data?: Json | null
          start_time?: string | null
          status?: string | null
          updated_at?: string
          updated_time?: string | null
          user_id?: string
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
      profiles: {
        Row: {
          business_name: string | null
          conversation_limit: number | null
          conversations_used: number | null
          created_at: string
          email: string | null
          facebook_access_token: string | null
          facebook_business_id: string | null
          facebook_connected: boolean | null
          full_name: string | null
          id: string
          onboarding_completed: boolean | null
          subscription_tier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          business_name?: string | null
          conversation_limit?: number | null
          conversations_used?: number | null
          created_at?: string
          email?: string | null
          facebook_access_token?: string | null
          facebook_business_id?: string | null
          facebook_connected?: boolean | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean | null
          subscription_tier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          business_name?: string | null
          conversation_limit?: number | null
          conversations_used?: number | null
          created_at?: string
          email?: string | null
          facebook_access_token?: string | null
          facebook_business_id?: string | null
          facebook_connected?: boolean | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      selected_angles: {
        Row: {
          angle_description: string
          angle_type: string
          brand_analysis_id: string | null
          competitor_insights: Json | null
          competitor_list_id: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          angle_description: string
          angle_type: string
          brand_analysis_id?: string | null
          competitor_insights?: Json | null
          competitor_list_id?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          angle_description?: string
          angle_type?: string
          brand_analysis_id?: string | null
          competitor_insights?: Json | null
          competitor_list_id?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          stripe_customer_id: string | null
          subscribed: boolean
          subscription_end: string | null
          subscription_tier: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      zuckerbot_conversations: {
        Row: {
          business_context: Json | null
          conversation_count: number | null
          conversation_title: string | null
          created_at: string
          id: string
          messages: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          business_context?: Json | null
          conversation_count?: number | null
          conversation_title?: string | null
          created_at?: string
          id?: string
          messages?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          business_context?: Json | null
          conversation_count?: number | null
          conversation_title?: string | null
          created_at?: string
          id?: string
          messages?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
