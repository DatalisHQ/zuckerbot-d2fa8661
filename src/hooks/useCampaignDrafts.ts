import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CampaignDraft {
  id: string;
  campaign_name: string;
  current_step: number;
  pipeline_status: string;
  draft_data: any;
  step_data: any;
  is_draft: boolean;
  last_saved_at: string;
  created_at: string;
  updated_at: string;
}

export function useCampaignDrafts() {
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const loadDrafts = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data, error } = await supabase
        .from('ad_campaigns')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('is_draft', true)
        .order('last_saved_at', { ascending: false });

      if (error) throw error;
      setDrafts(data || []);
    } catch (error) {
      console.error('Error loading drafts:', error);
      toast({
        title: "Error loading drafts",
        description: "Failed to load your campaign drafts.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDrafts();
  }, []);

  const saveDraft = async (
    campaignName: string,
    currentStep: number,
    draftData: any,
    stepData: any,
    campaignId?: string
  ): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');

      const campaignData = {
        campaign_name: campaignName,
        current_step: currentStep,
        pipeline_status: 'draft',
        draft_data: draftData,
        step_data: stepData,
        is_draft: true,
        last_saved_at: new Date().toISOString(),
        user_id: session.user.id,
      };

      let result;
      if (campaignId) {
        // Update existing draft
        result = await supabase
          .from('ad_campaigns')
          .update(campaignData)
          .eq('id', campaignId)
          .eq('user_id', session.user.id)
          .select()
          .single();
      } else {
        // Create new draft
        result = await supabase
          .from('ad_campaigns')
          .insert(campaignData)
          .select()
          .single();
      }

      if (result.error) throw result.error;

      // Refresh drafts list
      await loadDrafts();

      return result.data.id;
    } catch (error) {
      console.error('Error saving draft:', error);
      toast({
        title: "Error saving draft",
        description: "Failed to save your campaign progress.",
        variant: "destructive",
      });
      return null;
    }
  };

  const deleteDraft = async (campaignId: string): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('ad_campaigns')
        .delete()
        .eq('id', campaignId)
        .eq('user_id', session.user.id);

      if (error) throw error;

      // Refresh drafts list
      await loadDrafts();

      toast({
        title: "Draft deleted",
        description: "Campaign draft has been removed.",
      });

      return true;
    } catch (error) {
      console.error('Error deleting draft:', error);
      toast({
        title: "Error deleting draft",
        description: "Failed to delete the campaign draft.",
        variant: "destructive",
      });
      return false;
    }
  };

  const finalizeDraft = async (campaignId: string): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('ad_campaigns')
        .update({
          is_draft: false,
          pipeline_status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId)
        .eq('user_id', session.user.id);

      if (error) throw error;

      // Refresh drafts list
      await loadDrafts();

      toast({
        title: "Campaign finalized",
        description: "Your campaign is now ready for launch.",
      });

      return true;
    } catch (error) {
      console.error('Error finalizing draft:', error);
      toast({
        title: "Error finalizing campaign",
        description: "Failed to finalize the campaign.",
        variant: "destructive",
      });
      return false;
    }
  };

  return {
    drafts,
    isLoading,
    saveDraft,
    deleteDraft,
    finalizeDraft,
    refreshDrafts: loadDrafts,
  };
}