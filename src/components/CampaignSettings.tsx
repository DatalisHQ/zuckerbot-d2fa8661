import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { AudienceSegment } from '@/hooks/useSuggestAudience';

export interface CampaignSettings {
  brandUrl: string;
  competitorProfiles: { name: string; valueProps: string[]; toneProfile: string }[];
  selectedSegments: AudienceSegment[];
  campaignGoal: string;
  budget: { amount: number; type: 'DAILY' | 'LIFETIME' };
  audienceType: 'NEW' | 'RETARGET';
  geos: string[];
  lookbackDays?: number;
  placements: string[];
}

interface CampaignSettingsProps {
  brandUrl: string;
  competitorProfiles: { name: string; valueProps: string[]; toneProfile: string }[];
  selectedSegments: AudienceSegment[];
  onSettingsComplete: (settings: CampaignSettings) => void;
}

const CAMPAIGN_GOALS = [
  { value: 'CONVERSIONS', label: 'Sales' },
  { value: 'LEAD_GENERATION', label: 'Leads' },
  { value: 'APP_INSTALLS', label: 'App Installs' },
  { value: 'PAGE_LIKES', label: 'Followers' }
];

const COUNTRIES = [
  'United States', 'Canada', 'United Kingdom', 'Australia', 'Germany', 
  'France', 'Spain', 'Italy', 'Netherlands', 'Japan', 'South Korea', 'Brazil'
];

const PLACEMENTS = [
  { id: 'facebook_feeds', label: 'Facebook Feed' },
  { id: 'facebook_right_hand_column', label: 'Facebook Right Column' },
  { id: 'facebook_marketplace', label: 'Facebook Marketplace' },
  { id: 'facebook_video_feeds', label: 'Facebook Video Feeds' },
  { id: 'facebook_stories', label: 'Facebook Stories' },
  { id: 'instagram_feed', label: 'Instagram Feed' },
  { id: 'instagram_stories', label: 'Instagram Stories' },
  { id: 'instagram_reels', label: 'Instagram Reels' },
  { id: 'audience_network', label: 'Audience Network' }
];

export function CampaignSettings({ 
  brandUrl, 
  competitorProfiles, 
  selectedSegments, 
  onSettingsComplete 
}: CampaignSettingsProps) {
  const [campaignGoal, setCampaignGoal] = useState('');
  const [budgetAmount, setBudgetAmount] = useState<number>(50);
  const [budgetType, setBudgetType] = useState<'DAILY' | 'LIFETIME'>('DAILY');
  const [audienceType, setAudienceType] = useState<'NEW' | 'RETARGET'>('NEW');
  const [selectedGeos, setSelectedGeos] = useState<string[]>(['United States']);
  const [lookbackDays, setLookbackDays] = useState<number>(30);
  const [selectedPlacements, setSelectedPlacements] = useState<string[]>([
    'facebook_feeds', 'instagram_feed', 'instagram_stories'
  ]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleGeoToggle = (country: string) => {
    setSelectedGeos(prev => 
      prev.includes(country) 
        ? prev.filter(g => g !== country)
        : [...prev, country]
    );
  };

  const handlePlacementToggle = (placementId: string) => {
    setSelectedPlacements(prev =>
      prev.includes(placementId)
        ? prev.filter(p => p !== placementId)
        : [...prev, placementId]
    );
  };

  const handleContinue = () => {
    if (!campaignGoal) return;

    const settings: CampaignSettings = {
      brandUrl,
      competitorProfiles,
      selectedSegments,
      campaignGoal,
      budget: { amount: budgetAmount, type: budgetType },
      audienceType,
      geos: selectedGeos,
      lookbackDays: audienceType === 'RETARGET' ? lookbackDays : undefined,
      placements: selectedPlacements
    };

    onSettingsComplete(settings);
  };

  const isFormValid = campaignGoal && budgetAmount > 0 && selectedGeos.length > 0;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Campaign Settings</h2>
        <p className="text-muted-foreground">
          Configure your Facebook campaign parameters
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campaign Goal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="campaign-goal">What's your main objective?</Label>
            <Select value={campaignGoal} onValueChange={setCampaignGoal}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select campaign goal" />
              </SelectTrigger>
              <SelectContent>
                {CAMPAIGN_GOALS.map(goal => (
                  <SelectItem key={goal.value} value={goal.value}>
                    {goal.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Budget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="budget-amount">Amount ($)</Label>
              <Input
                id="budget-amount"
                type="number"
                min="1"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(Number(e.target.value))}
                placeholder="50"
              />
            </div>
            <div>
              <Label>Budget Type</Label>
              <RadioGroup value={budgetType} onValueChange={(value: 'DAILY' | 'LIFETIME') => setBudgetType(value)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="DAILY" id="daily" />
                  <Label htmlFor="daily">Daily</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="LIFETIME" id="lifetime" />
                  <Label htmlFor="lifetime">Lifetime</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audience & Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Audience Type</Label>
            <RadioGroup value={audienceType} onValueChange={(value: 'NEW' | 'RETARGET') => setAudienceType(value)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="NEW" id="new-users" />
                <Label htmlFor="new-users">New Users</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="RETARGET" id="retarget" />
                <Label htmlFor="retarget">Retarget Website Visitors</Label>
              </div>
            </RadioGroup>
          </div>

          {audienceType === 'NEW' && (
            <div>
              <Label>Geographic Targeting</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {COUNTRIES.map(country => (
                  <div key={country} className="flex items-center space-x-2">
                    <Checkbox
                      id={country}
                      checked={selectedGeos.includes(country)}
                      onCheckedChange={() => handleGeoToggle(country)}
                    />
                    <Label htmlFor={country} className="text-sm">{country}</Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {audienceType === 'RETARGET' && (
            <div>
              <Label htmlFor="lookback-days">Lookback Window (days)</Label>
              <Input
                id="lookback-days"
                type="number"
                min="1"
                max="180"
                value={lookbackDays}
                onChange={(e) => setLookbackDays(Number(e.target.value))}
                placeholder="30"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Advanced Placements (Optional)
                {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </CardTitle>
            </CardHeader>
          </Card>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {PLACEMENTS.map(placement => (
                  <div key={placement.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={placement.id}
                      checked={selectedPlacements.includes(placement.id)}
                      onCheckedChange={() => handlePlacementToggle(placement.id)}
                    />
                    <Label htmlFor={placement.id} className="text-sm">{placement.label}</Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex justify-center">
        <Button 
          onClick={handleContinue}
          disabled={!isFormValid}
          className="px-8"
        >
          Continue to Creative Generation
        </Button>
      </div>
    </div>
  );
}