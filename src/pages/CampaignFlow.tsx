import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CampaignSpecificWorkflow } from '@/components/CampaignSpecificWorkflow';
import { useCampaignDrafts } from '@/hooks/useCampaignDrafts';

export default function CampaignFlow() {
  const navigate = useNavigate();
  const location = useLocation();
  const { saveDraft } = useCampaignDrafts();
  
  // Get parameters from URL state or search params
  const brandAnalysisId = location.state?.brandAnalysisId || new URLSearchParams(location.search).get('brandAnalysisId');
  const brandUrl = location.state?.brandUrl || new URLSearchParams(location.search).get('brandUrl');
  const resumeDraftId = location.state?.resumeDraftId || new URLSearchParams(location.search).get('resumeDraftId');
  
  // Create new campaign if no draft ID provided
  const [campaignId, setCampaignId] = useState<string | null>(resumeDraftId);
  
  useEffect(() => {
    if (!campaignId) {
      createNewCampaign();
    }
  }, []);
  
  const createNewCampaign = async () => {
    const newCampaignId = await saveDraft(
      `Campaign ${new Date().toLocaleDateString()}`,
      1,
      {},
      { currentStep: 'competitor-analysis' },
      null
    );
    if (newCampaignId) {
      setCampaignId(newCampaignId);
    }
  };

  const handleFlowComplete = (result: any) => {
    if (result?.type === 'save_and_exit') {
      navigate('/dashboard');
    } else {
      // Handle successful campaign launch
      navigate('/dashboard', { 
        state: { 
          message: 'Campaign created successfully!',
          campaignId: result?.campaignId 
        } 
      });
    }
  };

  if (!campaignId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Creating campaign...</p>
        </div>
      </div>
    );
  }

  return (
    <CampaignSpecificWorkflow
      campaignId={campaignId}
      onFlowComplete={handleFlowComplete}
    />
  );
}