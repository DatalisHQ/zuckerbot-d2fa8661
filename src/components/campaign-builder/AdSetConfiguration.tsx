import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Clock, MapPin, Smartphone } from 'lucide-react';

interface AudienceSegment {
  id: string;
  name: string;
  type: string;
  description: string;
}

interface AdSet {
  id: string;
  name: string;
  audienceSegmentId: string;
  placements: string[];
  schedule: {
    startTime: string;
    endTime: string;
    timezone: string;
  };
  budgetAllocation: number;
}

interface AdSetConfigurationProps {
  segments: AudienceSegment[];
  budget: number;
  adSets: AdSet[];
  onAdSetsChange: (adSets: AdSet[]) => void;
}

const PLACEMENT_OPTIONS = [
  { id: 'facebook_feeds', name: 'Facebook Feed', platform: 'Facebook' },
  { id: 'facebook_stories', name: 'Facebook Stories', platform: 'Facebook' },
  { id: 'facebook_reels', name: 'Facebook Reels', platform: 'Facebook' },
  { id: 'instagram_feed', name: 'Instagram Feed', platform: 'Instagram' },
  { id: 'instagram_stories', name: 'Instagram Stories', platform: 'Instagram' },
  { id: 'instagram_reels', name: 'Instagram Reels', platform: 'Instagram' },
  { id: 'messenger', name: 'Messenger', platform: 'Messenger' },
  { id: 'audience_network', name: 'Audience Network', platform: 'Network' }
];

export const AdSetConfiguration = ({
  segments,
  budget,
  adSets,
  onAdSetsChange
}: AdSetConfigurationProps) => {
  // Auto-create ad sets for each segment
  useEffect(() => {
    if (segments.length > 0 && adSets.length === 0) {
      const budgetPerSegment = Math.floor(budget / segments.length);
      const newAdSets: AdSet[] = segments.map((segment, index) => ({
        id: `adset_${segment.id}`,
        name: `${segment.name} - Ad Set`,
        audienceSegmentId: segment.id,
        placements: ['facebook_feeds', 'instagram_feed'], // Default placements
        schedule: {
          startTime: '00:00',
          endTime: '23:59',
          timezone: 'America/New_York'
        },
        budgetAllocation: budgetPerSegment
      }));
      onAdSetsChange(newAdSets);
    }
  }, [segments, budget, adSets.length, onAdSetsChange]);

  const updateAdSet = (id: string, updates: Partial<AdSet>) => {
    onAdSetsChange(
      adSets.map(adSet => 
        adSet.id === id ? { ...adSet, ...updates } : adSet
      )
    );
  };

  const togglePlacement = (adSetId: string, placementId: string) => {
    const adSet = adSets.find(as => as.id === adSetId);
    if (!adSet) return;

    const currentPlacements = adSet.placements;
    const newPlacements = currentPlacements.includes(placementId)
      ? currentPlacements.filter(p => p !== placementId)
      : [...currentPlacements, placementId];

    updateAdSet(adSetId, { placements: newPlacements });
  };

  const getSegmentName = (segmentId: string) => {
    return segments.find(s => s.id === segmentId)?.name || 'Unknown Segment';
  };

  const getPlatformPlacements = (platform: string) => {
    return PLACEMENT_OPTIONS.filter(p => p.platform === platform);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Ad Set Configuration</h1>
        <p className="text-muted-foreground">
          Configure targeting and placements for each audience segment
        </p>
      </div>

      <div className="space-y-6">
        {adSets.map((adSet) => {
          const segment = segments.find(s => s.id === adSet.audienceSegmentId);
          
          return (
            <Card key={adSet.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Smartphone className="h-5 w-5" />
                      {adSet.name}
                    </CardTitle>
                    <CardDescription>
                      Targeting: {getSegmentName(adSet.audienceSegmentId)}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    ${adSet.budgetAllocation}/day
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Placements */}
                <div>
                  <Label className="text-base font-medium">Ad Placements</Label>
                  <p className="text-sm text-muted-foreground mb-4">
                    Choose where your ads will appear
                  </p>
                  
                  <div className="space-y-4">
                    {['Facebook', 'Instagram', 'Messenger', 'Network'].map((platform) => {
                      const platformPlacements = getPlatformPlacements(platform);
                      
                      return (
                        <div key={platform} className="space-y-2">
                          <h4 className="font-medium text-sm">{platform}</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {platformPlacements.map((placement) => (
                              <div key={placement.id} className="flex items-center space-x-2">
                                <Switch
                                  id={`${adSet.id}_${placement.id}`}
                                  checked={adSet.placements.includes(placement.id)}
                                  onCheckedChange={() => togglePlacement(adSet.id, placement.id)}
                                />
                                <Label 
                                  htmlFor={`${adSet.id}_${placement.id}`}
                                  className="text-sm"
                                >
                                  {placement.name}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Schedule */}
                <div>
                  <Label className="text-base font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Schedule
                  </Label>
                  <p className="text-sm text-muted-foreground mb-4">
                    When should your ads run?
                  </p>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor={`start-time-${adSet.id}`} className="text-sm">Start Time</Label>
                      <Select
                        value={adSet.schedule.startTime}
                        onValueChange={(value) => 
                          updateAdSet(adSet.id, { 
                            schedule: { ...adSet.schedule, startTime: value }
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => {
                            const hour = i.toString().padStart(2, '0');
                            return (
                              <SelectItem key={hour} value={`${hour}:00`}>
                                {`${hour}:00`}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor={`end-time-${adSet.id}`} className="text-sm">End Time</Label>
                      <Select
                        value={adSet.schedule.endTime}
                        onValueChange={(value) => 
                          updateAdSet(adSet.id, { 
                            schedule: { ...adSet.schedule, endTime: value }
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => {
                            const hour = i.toString().padStart(2, '0');
                            return (
                              <SelectItem key={hour} value={`${hour}:59`}>
                                {`${hour}:59`}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor={`timezone-${adSet.id}`} className="text-sm">Timezone</Label>
                      <Select
                        value={adSet.schedule.timezone}
                        onValueChange={(value) => 
                          updateAdSet(adSet.id, { 
                            schedule: { ...adSet.schedule, timezone: value }
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="America/New_York">Eastern Time</SelectItem>
                          <SelectItem value="America/Chicago">Central Time</SelectItem>
                          <SelectItem value="America/Denver">Mountain Time</SelectItem>
                          <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                          <SelectItem value="UTC">UTC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-muted/50">
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{adSets.length}</div>
              <div className="text-sm text-muted-foreground">Ad Sets Created</div>
            </div>
            <div>
              <div className="text-2xl font-bold">${budget}</div>
              <div className="text-sm text-muted-foreground">Total Daily Budget</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {adSets.reduce((total, adSet) => total + adSet.placements.length, 0)}
              </div>
              <div className="text-sm text-muted-foreground">Total Placements</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};