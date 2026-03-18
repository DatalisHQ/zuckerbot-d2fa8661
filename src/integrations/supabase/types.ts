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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_runs: {
        Row: {
          analytics_projections: Json | null
          brand_data: Json | null
          campaign_plan: Json | null
          competitor_data: Json | null
          created_at: string | null
          creative_data: Json | null
          id: string
          outreach_plan: Json | null
          url: string
          user_id: string | null
        }
        Insert: {
          analytics_projections?: Json | null
          brand_data?: Json | null
          campaign_plan?: Json | null
          competitor_data?: Json | null
          created_at?: string | null
          creative_data?: Json | null
          id?: string
          outreach_plan?: Json | null
          url: string
          user_id?: string | null
        }
        Update: {
          analytics_projections?: Json | null
          brand_data?: Json | null
          campaign_plan?: Json | null
          competitor_data?: Json | null
          created_at?: string | null
          creative_data?: Json | null
          id?: string
          outreach_plan?: Json | null
          url?: string
          user_id?: string | null
        }
        Relationships: []
      }
      api_campaigns: {
        Row: {
          api_key_id: string
          approved_strategy: Json | null
          business_name: string | null
          business_id: string | null
          business_type: string | null
          campaign_version: string
          context: Json | null
          created_at: string
          creative_handoff: Json | null
          creative_status: string
          daily_budget_cents: number | null
          goals: Json | null
          id: string
          launched_at: string | null
          meta_access_token: string | null
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          meta_leadform_id: string | null
          objective: string | null
          roadmap: Json | null
          status: string
          strategy: Json | null
          strategy_approved_at: string | null
          targeting: Json | null
          url: string | null
          user_id: string
          variants: Json | null
          workflow_state: Json
        }
        Insert: {
          api_key_id: string
          approved_strategy?: Json | null
          business_name?: string | null
          business_id?: string | null
          business_type?: string | null
          campaign_version?: string
          context?: Json | null
          created_at?: string
          creative_handoff?: Json | null
          creative_status?: string
          daily_budget_cents?: number | null
          goals?: Json | null
          id: string
          launched_at?: string | null
          meta_access_token?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_leadform_id?: string | null
          objective?: string | null
          roadmap?: Json | null
          status?: string
          strategy?: Json | null
          strategy_approved_at?: string | null
          targeting?: Json | null
          url?: string | null
          user_id: string
          variants?: Json | null
          workflow_state?: Json
        }
        Update: {
          api_key_id?: string
          approved_strategy?: Json | null
          business_name?: string | null
          business_id?: string | null
          business_type?: string | null
          campaign_version?: string
          context?: Json | null
          created_at?: string
          creative_handoff?: Json | null
          creative_status?: string
          daily_budget_cents?: number | null
          goals?: Json | null
          id?: string
          launched_at?: string | null
          meta_access_token?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_leadform_id?: string | null
          objective?: string | null
          roadmap?: Json | null
          status?: string
          strategy?: Json | null
          strategy_approved_at?: string | null
          targeting?: Json | null
          url?: string | null
          user_id?: string
          variants?: Json | null
          workflow_state?: Json
        }
        Relationships: [
          {
            foreignKeyName: "api_campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      api_campaign_creatives: {
        Row: {
          angle_name: string | null
          api_campaign_id: string
          asset_type: string
          asset_url: string
          body: string | null
          business_id: string | null
          created_at: string
          cta: string | null
          headline: string | null
          id: string
          link_url: string | null
          meta_ad_id: string | null
          meta_adcreative_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          meta_image_hash: string | null
          meta_video_id: string | null
          metadata: Json
          status: string
          tier_name: string
          updated_at: string
          user_id: string
          variant_index: number
        }
        Insert: {
          angle_name?: string | null
          api_campaign_id: string
          asset_type?: string
          asset_url: string
          body?: string | null
          business_id?: string | null
          created_at?: string
          cta?: string | null
          headline?: string | null
          id?: string
          link_url?: string | null
          meta_ad_id?: string | null
          meta_adcreative_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_image_hash?: string | null
          meta_video_id?: string | null
          metadata?: Json
          status?: string
          tier_name: string
          updated_at?: string
          user_id: string
          variant_index?: number
        }
        Update: {
          angle_name?: string | null
          api_campaign_id?: string
          asset_type?: string
          asset_url?: string
          body?: string | null
          business_id?: string | null
          created_at?: string
          cta?: string | null
          headline?: string | null
          id?: string
          link_url?: string | null
          meta_ad_id?: string | null
          meta_adcreative_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_image_hash?: string | null
          meta_video_id?: string | null
          metadata?: Json
          status?: string
          tier_name?: string
          updated_at?: string
          user_id?: string
          variant_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_campaign_creatives_api_campaign_id_fkey"
            columns: ["api_campaign_id"]
            isOneToOne: false
            referencedRelation: "api_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_campaign_creatives_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          business_id: string | null
          created_at: string
          id: string
          is_live: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          rate_limit_per_day: number
          rate_limit_per_min: number
          revoked_at: string | null
          tier: string
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id?: string
          is_live?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name?: string
          rate_limit_per_day?: number
          rate_limit_per_min?: number
          revoked_at?: string | null
          tier?: string
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          id?: string
          is_live?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          rate_limit_per_day?: number
          rate_limit_per_min?: number
          revoked_at?: string | null
          tier?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage: {
        Row: {
          api_key_id: string
          created_at: string
          endpoint: string
          id: string
          method: string
          response_time_ms: number | null
          status_code: number
        }
        Insert: {
          api_key_id: string
          created_at?: string
          endpoint: string
          id?: string
          method: string
          response_time_ms?: number | null
          status_code?: number
        }
        Update: {
          api_key_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          method?: string
          response_time_ms?: number | null
          status_code?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_config: {
        Row: {
          auto_approve_budget_shifts: boolean
          auto_approve_creatives: boolean
          business_id: string
          campaign_optimizer_enabled: boolean
          competitor_analyst_enabled: boolean
          competitor_analyst_frequency_hours: number
          cpa_spike_threshold_pct: number
          created_at: string
          creative_director_enabled: boolean
          creative_director_frequency_hours: number
          ctr_drop_threshold_pct: number
          id: string
          performance_monitor_enabled: boolean
          performance_monitor_frequency_hours: number
          review_scout_enabled: boolean
          review_scout_frequency_hours: number
          spend_pacing_threshold_pct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_approve_budget_shifts?: boolean
          auto_approve_creatives?: boolean
          business_id: string
          campaign_optimizer_enabled?: boolean
          competitor_analyst_enabled?: boolean
          competitor_analyst_frequency_hours?: number
          cpa_spike_threshold_pct?: number
          created_at?: string
          creative_director_enabled?: boolean
          creative_director_frequency_hours?: number
          ctr_drop_threshold_pct?: number
          id?: string
          performance_monitor_enabled?: boolean
          performance_monitor_frequency_hours?: number
          review_scout_enabled?: boolean
          review_scout_frequency_hours?: number
          spend_pacing_threshold_pct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_approve_budget_shifts?: boolean
          auto_approve_creatives?: boolean
          business_id?: string
          campaign_optimizer_enabled?: boolean
          competitor_analyst_enabled?: boolean
          competitor_analyst_frequency_hours?: number
          cpa_spike_threshold_pct?: number
          created_at?: string
          creative_director_enabled?: boolean
          creative_director_frequency_hours?: number
          ctr_drop_threshold_pct?: number
          id?: string
          performance_monitor_enabled?: boolean
          performance_monitor_frequency_hours?: number
          review_scout_enabled?: boolean
          review_scout_frequency_hours?: number
          spend_pacing_threshold_pct?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_config_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          agent_type: string
          approved_action: Json | null
          approved_at: string | null
          business_id: string
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          executing_started_at: string | null
          first_person_summary: string | null
          id: string
          input: Json
          output: Json | null
          requires_approval: boolean
          started_at: string | null
          status: string
          summary: string | null
          tinyfish_replay_url: string | null
          trigger_reason: string | null
          trigger_type: string
          user_id: string
        }
        Insert: {
          agent_type: string
          approved_action?: Json | null
          approved_at?: string | null
          business_id: string
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          executing_started_at?: string | null
          first_person_summary?: string | null
          id?: string
          input?: Json
          output?: Json | null
          requires_approval?: boolean
          started_at?: string | null
          status?: string
          summary?: string | null
          tinyfish_replay_url?: string | null
          trigger_reason?: string | null
          trigger_type?: string
          user_id: string
        }
        Update: {
          agent_type?: string
          approved_action?: Json | null
          approved_at?: string | null
          business_id?: string
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          executing_started_at?: string | null
          first_person_summary?: string | null
          id?: string
          input?: Json
          output?: Json | null
          requires_approval?: boolean
          started_at?: string | null
          status?: string
          summary?: string | null
          tinyfish_replay_url?: string | null
          trigger_reason?: string | null
          trigger_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      audience_portfolios: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          template_id: string | null
          tiers: Json
          total_daily_budget_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          template_id?: string | null
          tiers?: Json
          total_daily_budget_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          template_id?: string | null
          tiers?: Json
          total_daily_budget_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_portfolios_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_portfolios_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "portfolio_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      audience_tier_campaigns: {
        Row: {
          business_id: string
          campaign_id: string | null
          created_at: string
          daily_budget_cents: number | null
          id: string
          meta_adset_id: string | null
          meta_audience_id: string | null
          meta_campaign_id: string | null
          performance_data: Json | null
          portfolio_id: string
          status: string
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          campaign_id?: string | null
          created_at?: string
          daily_budget_cents?: number | null
          id?: string
          meta_adset_id?: string | null
          meta_audience_id?: string | null
          meta_campaign_id?: string | null
          performance_data?: Json | null
          portfolio_id: string
          status?: string
          tier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          campaign_id?: string | null
          created_at?: string
          daily_budget_cents?: number | null
          id?: string
          meta_adset_id?: string | null
          meta_audience_id?: string | null
          meta_campaign_id?: string | null
          performance_data?: Json | null
          portfolio_id?: string
          status?: string
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_tier_campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_tier_campaigns_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_tier_campaigns_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "audience_portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomous_policies: {
        Row: {
          business_id: string
          capi_lookback_days: number
          created_at: string
          enabled: boolean
          evaluation_frequency_hours: number
          frequency_cap: number
          id: string
          max_daily_budget: number
          max_daily_budget_cents: number
          min_spend_before_evaluation_cents: number
          min_conversions_to_scale: number
          optimise_for: string
          pause_multiplier: number
          scale_multiplier: number
          scale_pct: number
          target_cpa: number
          target_cpa_cents: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          capi_lookback_days?: number
          created_at?: string
          enabled?: boolean
          evaluation_frequency_hours?: number
          frequency_cap?: number
          id?: string
          max_daily_budget?: number
          max_daily_budget_cents?: number
          min_spend_before_evaluation_cents?: number
          min_conversions_to_scale?: number
          optimise_for?: string
          pause_multiplier?: number
          scale_multiplier?: number
          scale_pct?: number
          target_cpa: number
          target_cpa_cents?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          capi_lookback_days?: number
          created_at?: string
          enabled?: boolean
          evaluation_frequency_hours?: number
          frequency_cap?: number
          id?: string
          max_daily_budget?: number
          max_daily_budget_cents?: number
          min_spend_before_evaluation_cents?: number
          min_conversions_to_scale?: number
          optimise_for?: string
          pause_multiplier?: number
          scale_multiplier?: number
          scale_pct?: number
          target_cpa?: number
          target_cpa_cents?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autonomous_policies_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      capi_configs: {
        Row: {
          action_source: string
          business_id: string
          created_at: string
          crm_source: string
          currency: string
          event_mapping: Json
          id: string
          is_enabled: boolean
          optimise_for: string
          updated_at: string
          user_id: string
          webhook_secret: string
        }
        Insert: {
          action_source?: string
          business_id: string
          created_at?: string
          crm_source?: string
          currency?: string
          event_mapping?: Json
          id?: string
          is_enabled?: boolean
          optimise_for?: string
          updated_at?: string
          user_id: string
          webhook_secret?: string
        }
        Update: {
          action_source?: string
          business_id?: string
          created_at?: string
          crm_source?: string
          currency?: string
          event_mapping?: Json
          id?: string
          is_enabled?: boolean
          optimise_for?: string
          updated_at?: string
          user_id?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "capi_configs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      capi_events: {
        Row: {
          business_id: string
          campaign_id: string | null
          created_at: string
          crm_attributes: Json
          crm_source: string
          event_time: string
          hashed_user_data: Json
          hubspot_contact_id: string | null
          id: string
          is_test: boolean
          lead_id: string | null
          match_quality: string | null
          meta_event_id: string | null
          meta_event_name: string | null
          meta_response: Json | null
          source_stage: string | null
          status: string
          user_id: string
        }
        Insert: {
          business_id: string
          campaign_id?: string | null
          created_at?: string
          crm_attributes?: Json
          crm_source?: string
          event_time?: string
          hashed_user_data?: Json
          hubspot_contact_id?: string | null
          id?: string
          is_test?: boolean
          lead_id?: string | null
          match_quality?: string | null
          meta_event_id?: string | null
          meta_event_name?: string | null
          meta_response?: Json | null
          source_stage?: string | null
          status?: string
          user_id: string
        }
        Update: {
          business_id?: string
          campaign_id?: string | null
          created_at?: string
          crm_attributes?: Json
          crm_source?: string
          event_time?: string
          hashed_user_data?: Json
          hubspot_contact_id?: string | null
          id?: string
          is_test?: boolean
          lead_id?: string | null
          match_quality?: string | null
          meta_event_id?: string | null
          meta_event_name?: string | null
          meta_response?: Json | null
          source_stage?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capi_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capi_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capi_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          competitor_names: string[] | null
          country: string | null
          created_at: string
          currency: string
          facebook_access_token: string | null
          facebook_ad_account_id: string | null
          facebook_ad_history: Json | null
          facebook_page_id: string | null
          google_maps_url: string | null
          id: string
          lat: number | null
          lng: number | null
          markets: string[]
          name: string
          meta_pixel_id: string | null
          notifications_enabled: boolean
          phone: string
          postcode: string | null
          preview_ads: Json | null
          state: string | null
          suburb: string | null
          target_radius_km: number | null
          target_type: string | null
          telegram_chat_id: string | null
          trade: string
          updated_at: string
          user_id: string
          website: string | null
          website_url: string | null
        }
        Insert: {
          competitor_names?: string[] | null
          country?: string | null
          created_at?: string
          currency?: string
          facebook_access_token?: string | null
          facebook_ad_account_id?: string | null
          facebook_ad_history?: Json | null
          facebook_page_id?: string | null
          google_maps_url?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          markets?: string[]
          name: string
          meta_pixel_id?: string | null
          notifications_enabled?: boolean
          phone: string
          postcode?: string | null
          preview_ads?: Json | null
          state?: string | null
          suburb?: string | null
          target_radius_km?: number | null
          target_type?: string | null
          telegram_chat_id?: string | null
          trade: string
          updated_at?: string
          user_id: string
          website?: string | null
          website_url?: string | null
        }
        Update: {
          competitor_names?: string[] | null
          country?: string | null
          created_at?: string
          currency?: string
          facebook_access_token?: string | null
          facebook_ad_account_id?: string | null
          facebook_ad_history?: Json | null
          facebook_page_id?: string | null
          google_maps_url?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          markets?: string[]
          name?: string
          meta_pixel_id?: string | null
          notifications_enabled?: boolean
          phone?: string
          postcode?: string | null
          preview_ads?: Json | null
          state?: string | null
          suburb?: string | null
          target_radius_km?: number | null
          target_type?: string | null
          telegram_chat_id?: string | null
          trade?: string
          updated_at?: string
          user_id?: string
          website?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          ad_copy: string | null
          ad_headline: string | null
          ad_image_url: string | null
          business_id: string
          clicks: number
          cpl_cents: number | null
          created_at: string
          daily_budget_cents: number
          id: string
          impressions: number
          last_synced_at: string | null
          launched_at: string | null
          leads_count: number
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          meta_leadform_id: string | null
          name: string
          performance_status: string
          radius_km: number
          spend_cents: number
          status: string
        }
        Insert: {
          ad_copy?: string | null
          ad_headline?: string | null
          ad_image_url?: string | null
          business_id: string
          clicks?: number
          cpl_cents?: number | null
          created_at?: string
          daily_budget_cents?: number
          id?: string
          impressions?: number
          last_synced_at?: string | null
          launched_at?: string | null
          leads_count?: number
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_leadform_id?: string | null
          name: string
          performance_status?: string
          radius_km?: number
          spend_cents?: number
          status?: string
        }
        Update: {
          ad_copy?: string | null
          ad_headline?: string | null
          ad_image_url?: string | null
          business_id?: string
          clicks?: number
          cpl_cents?: number | null
          created_at?: string
          daily_budget_cents?: number
          id?: string
          impressions?: number
          last_synced_at?: string | null
          launched_at?: string | null
          leads_count?: number
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_leadform_id?: string | null
          name?: string
          performance_status?: string
          radius_km?: number
          spend_cents?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_audiences: {
        Row: {
          audience_id: string
          audience_name: string
          audience_size: number | null
          audience_type: string | null
          behaviors: Json | null
          business_id: string | null
          created_at: string
          delivery_status: string | null
          demographics: Json | null
          description: string | null
          id: string
          interests: Json | null
          last_refreshed_at: string | null
          lookalike_pct: number | null
          lookback_days: number | null
          raw_data: Json | null
          seed_audience_id: string | null
          seed_source_stage: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audience_id: string
          audience_name: string
          audience_size?: number | null
          audience_type?: string | null
          behaviors?: Json | null
          business_id?: string | null
          created_at?: string
          delivery_status?: string | null
          demographics?: Json | null
          description?: string | null
          id?: string
          interests?: Json | null
          last_refreshed_at?: string | null
          lookalike_pct?: number | null
          lookback_days?: number | null
          raw_data?: Json | null
          seed_audience_id?: string | null
          seed_source_stage?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audience_id?: string
          audience_name?: string
          audience_size?: number | null
          audience_type?: string | null
          behaviors?: Json | null
          business_id?: string | null
          created_at?: string
          delivery_status?: string | null
          demographics?: Json | null
          description?: string | null
          id?: string
          interests?: Json | null
          last_refreshed_at?: string | null
          lookalike_pct?: number | null
          lookback_days?: number | null
          raw_data?: Json | null
          seed_audience_id?: string | null
          seed_source_stage?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facebook_audiences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_analyses: {
        Row: {
          ad_count: number | null
          business_id: string | null
          competitor_ads: Json | null
          country: string | null
          created_at: string | null
          id: string
          industry: string
          location: string
        }
        Insert: {
          ad_count?: number | null
          business_id?: string | null
          competitor_ads?: Json | null
          country?: string | null
          created_at?: string | null
          id?: string
          industry: string
          location: string
        }
        Update: {
          ad_count?: number | null
          business_id?: string | null
          competitor_ads?: Json | null
          country?: string | null
          created_at?: string | null
          id?: string
          industry?: string
          location?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_analyses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_balances: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          business_id: string | null
          created_at: string
          delta: number
          id: string
          meta: Json
          reason: string
          ref_id: string | null
          ref_type: string
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          delta: number
          id?: string
          meta?: Json
          reason: string
          ref_id?: string | null
          ref_type: string
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          delta?: number
          id?: string
          meta?: Json
          reason?: string
          ref_id?: string | null
          ref_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      email_reply_log: {
        Row: {
          created_at: string | null
          id: string
          intent: string
          replied: boolean | null
          sender_email: string
          subject: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          intent: string
          replied?: boolean | null
          sender_email: string
          subject?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          intent?: string
          replied?: boolean | null
          sender_email?: string
          subject?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          business_id: string
          campaign_id: string
          created_at: string
          email: string | null
          id: string
          meta_lead_id: string | null
          name: string | null
          phone: string | null
          sms_sent: boolean
          status: string
          suburb: string | null
        }
        Insert: {
          business_id: string
          campaign_id: string
          created_at?: string
          email?: string | null
          id?: string
          meta_lead_id?: string | null
          name?: string | null
          phone?: string | null
          sms_sent?: boolean
          status?: string
          suburb?: string | null
        }
        Update: {
          business_id?: string
          campaign_id?: string
          created_at?: string
          email?: string | null
          id?: string
          meta_lead_id?: string | null
          name?: string | null
          phone?: string | null
          sms_sent?: boolean
          status?: string
          suburb?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_templates: {
        Row: {
          business_type: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          tiers: Json
        }
        Insert: {
          business_type: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          tiers?: Json
        }
        Update: {
          business_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          tiers?: Json
        }
        Relationships: []
      }
      outbound_prospects: {
        Row: {
          business_name: string
          created_at: string
          first_sms_at: string | null
          id: string
          industry: string
          last_clicked_at: string | null
          last_sms_at: string | null
          link_clicks: number
          notes: string | null
          phone: string
          rating: number | null
          replied_at: string | null
          reply_text: string | null
          review_count: number | null
          scraped_data: Json | null
          sms_count: number
          source: string | null
          state: string | null
          status: string
          suburb: string | null
          tracking_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          business_name: string
          created_at?: string
          first_sms_at?: string | null
          id?: string
          industry?: string
          last_clicked_at?: string | null
          last_sms_at?: string | null
          link_clicks?: number
          notes?: string | null
          phone: string
          rating?: number | null
          replied_at?: string | null
          reply_text?: string | null
          review_count?: number | null
          scraped_data?: Json | null
          sms_count?: number
          source?: string | null
          state?: string | null
          status?: string
          suburb?: string | null
          tracking_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          business_name?: string
          created_at?: string
          first_sms_at?: string | null
          id?: string
          industry?: string
          last_clicked_at?: string | null
          last_sms_at?: string | null
          link_clicks?: number
          notes?: string | null
          phone?: string
          rating?: number | null
          replied_at?: string | null
          reply_text?: string | null
          review_count?: number | null
          scraped_data?: Json | null
          sms_count?: number
          source?: string | null
          state?: string | null
          status?: string
          suburb?: string | null
          tracking_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      preview_leads: {
        Row: {
          business_name: string | null
          created_at: string | null
          email: string
          id: string
          url: string | null
        }
        Insert: {
          business_name?: string | null
          created_at?: string | null
          email: string
          id?: string
          url?: string | null
        }
        Update: {
          business_name?: string | null
          created_at?: string | null
          email?: string
          id?: string
          url?: string | null
        }
        Relationships: []
      }
      preview_logs: {
        Row: {
          business_name: string | null
          created_at: string | null
          error_message: string | null
          generated_ads: Json | null
          has_images: boolean | null
          id: string
          image_count: number | null
          ip_address: string | null
          saved_image_urls: string[] | null
          success: boolean | null
          url: string | null
          user_agent: string | null
        }
        Insert: {
          business_name?: string | null
          created_at?: string | null
          error_message?: string | null
          generated_ads?: Json | null
          has_images?: boolean | null
          id?: string
          image_count?: number | null
          ip_address?: string | null
          saved_image_urls?: string[] | null
          success?: boolean | null
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          business_name?: string | null
          created_at?: string | null
          error_message?: string | null
          generated_ads?: Json | null
          has_images?: boolean | null
          id?: string
          image_count?: number | null
          ip_address?: string | null
          saved_image_urls?: string[] | null
          success?: boolean | null
          url?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          business_name: string | null
          created_at: string
          email: string | null
          facebook_access_token: string | null
          facebook_connected: boolean
          full_name: string | null
          id: string
          onboarding_completed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          email?: string | null
          facebook_access_token?: string | null
          facebook_connected?: boolean
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          email?: string | null
          facebook_access_token?: string | null
          facebook_connected?: boolean
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sms_log: {
        Row: {
          business_id: string
          created_at: string
          id: string
          lead_id: string
          message: string
          status: string
          to_phone: string
          twilio_sid: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          lead_id: string
          message: string
          status?: string
          to_phone: string
          twilio_sid?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          lead_id?: string
          message?: string
          status?: string
          to_phone?: string
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_briefs: {
        Row: {
          brief_markdown: string
          business_id: string | null
          created_at: string | null
          execution_plan: Json
          id: string
          presentation_url: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          brief_markdown: string
          business_id?: string | null
          created_at?: string | null
          execution_plan: Json
          id?: string
          presentation_url?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          brief_markdown?: string
          business_id?: string | null
          created_at?: string | null
          execution_plan?: Json
          id?: string
          presentation_url?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "strategy_briefs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      debit_credits: {
        Args: {
          p_business_id: string
          p_cost: number
          p_meta?: Json
          p_reason: string
          p_ref_id?: string
          p_ref_type: string
          p_user_id: string
        }
        Returns: {
          balance: number
          ok: boolean
        }[]
      }
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
