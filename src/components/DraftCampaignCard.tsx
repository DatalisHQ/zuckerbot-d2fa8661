import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar, MoreVertical, Play, Edit, Trash2, Save } from "lucide-react";
import { CampaignDraft } from "@/hooks/useCampaignDrafts";
import { formatDate } from "@/lib/utils";

interface DraftCampaignCardProps {
  draft: CampaignDraft;
  onContinue: (draft: CampaignDraft) => void;
  onEdit: (draft: CampaignDraft) => void;
  onDelete: (campaignId: string) => void;
  onLaunch: (draft: CampaignDraft) => void;
}

const getStepName = (step: number): string => {
  const stepNames = {
    1: "Competitor Research",
    2: "Insights Analysis", 
    3: "Asset Collection",
    // 4: "Asset Transform", // REMOVED: Asset transformation step
    4: "Campaign Settings",
    5: "Ready to Launch"
  };
  return stepNames[step as keyof typeof stepNames] || `Step ${step}`;
};

const getStepProgress = (step: number): number => {
  return Math.min((step / 6) * 100, 100);
};

export function DraftCampaignCard({ 
  draft, 
  onContinue, 
  onEdit, 
  onDelete, 
  onLaunch 
}: DraftCampaignCardProps) {
  const stepProgress = getStepProgress(draft.current_step);
  const stepName = getStepName(draft.current_step);
  const isReadyToLaunch = draft.current_step >= 6;

  return (
    <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-orange-400">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate flex items-center gap-2">
              <Save className="h-4 w-4 text-orange-500" />
              {draft.campaign_name}
            </CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <Calendar className="w-3 h-3" />
              Last saved: {formatDate(draft.last_saved_at)}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-orange-100 text-orange-700">
              Draft
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(draft)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Campaign
                </DropdownMenuItem>
                {isReadyToLaunch && (
                  <DropdownMenuItem onClick={() => onLaunch(draft)}>
                    <Play className="h-4 w-4 mr-2" />
                    Launch Campaign
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  onClick={() => onDelete(draft.id)}
                  className="text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Draft
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress:</span>
              <span className="font-medium">{stepName}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${stepProgress}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Step {draft.current_step} of 6 completed
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={() => onContinue(draft)}
              className="flex-1"
              size="sm"
            >
              {isReadyToLaunch ? 'Review & Launch' : 'Continue Building'}
            </Button>
            {isReadyToLaunch && (
              <Button 
                onClick={() => onLaunch(draft)}
                variant="outline"
                size="sm"
                className="border-green-200 text-green-700 hover:bg-green-50"
              >
                <Play className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}