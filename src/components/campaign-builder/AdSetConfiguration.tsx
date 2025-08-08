import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Clock, MapPin, Smartphone } from 'lucide-react';

interface AudienceSegment {
  id: string;
  name: string;
  type: string;
  description: string;
  targeting?: {
    interests?: string[];
    demographics?: string;
    behaviors?: string[];
    age_min?: number;
    age_max?: number;
    genders?: string[]; // ['male','female']
    countries?: string[];
    location_types?: string[];
  };
}

interface AdSet {
  id: string;
  name: string;
  audienceSegmentId: string;
  placements: string[];
  budgetAllocation: number;
  targeting?: {
    interests?: string[];
    demographics?: string;
    behaviors?: string[];
    age_min?: number;
    age_max?: number;
    genders?: string[];
    countries?: string[];
    location_types?: string[];
  };
}

interface AdSetConfigurationProps {
  segments: AudienceSegment[];
  budget: number;
  adSets: AdSet[];
  onAdSetsChange: (adSets: AdSet[]) => void;
  startDate?: string | null;
  endDate?: string | null;
  onSegmentTargetingChange?: (
    segmentId: string,
    targeting: NonNullable<AdSet['targeting']>
  ) => void;
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
  onAdSetsChange,
  startDate,
  endDate,
  onSegmentTargetingChange
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
        budgetAllocation: budgetPerSegment,
        targeting: segment.targeting || {},
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

  const getNormalizedTargeting = (adSet: AdSet) => {
    const t = adSet.targeting || {};
    return {
      age_min: typeof t.age_min === 'number' ? t.age_min : 18,
      age_max: typeof t.age_max === 'number' ? t.age_max : 65,
      genders: Array.isArray(t.genders) && t.genders.length > 0 ? t.genders : ['male', 'female'],
      interests: Array.isArray(t.interests) ? t.interests : [],
      behaviors: Array.isArray(t.behaviors) ? t.behaviors : [],
      countries: Array.isArray(t.countries) && t.countries.length > 0 ? t.countries : ['US'],
      location_types: Array.isArray(t.location_types) && t.location_types.length > 0 ? t.location_types : ['home'],
      demographics: t.demographics,
    };
  };

  const updateTargetingField = (adSetId: string, field: string, value: any) => {
    const adSet = adSets.find(as => as.id === adSetId);
    if (!adSet) return;
    const current = getNormalizedTargeting(adSet);
    updateAdSet(adSetId, { targeting: { ...current, [field]: value } });
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
          Review and customize your ad sets. Each ad set corresponds to an audience you selected earlier.
        </p>
        <div className="flex flex-wrap justify-center gap-6 mt-4">
          <div>
            <div className="text-xs text-muted-foreground">Campaign Start</div>
            <div className="font-semibold">{startDate ? new Date(startDate).toLocaleDateString() : 'Not set'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Campaign End</div>
            <div className="font-semibold">{endDate ? new Date(endDate).toLocaleDateString() : 'Not set'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Daily Budget</div>
            <div className="font-semibold">${budget}</div>
          </div>
        </div>
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

                {/* Audience Targeting */}
                <div className="space-y-3">
                  <Label className="text-base font-medium">Audience Targeting</Label>
                  <p className="text-sm text-muted-foreground">
                    Refine age, gender, interests and locations for this ad set
                  </p>
                  {(() => {
                    const t = getNormalizedTargeting(adSet);
                    const emitUpdate = (field: string, value: any) => {
                      const next = { ...t, [field]: value };
                      updateAdSet(adSet.id, { targeting: next });
                      if (onSegmentTargetingChange) {
                        onSegmentTargetingChange(adSet.audienceSegmentId, next);
                      }
                    };
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>Age Range</Label>
                          <div className="flex gap-2 mt-1">
                            <Input
                              type="number"
                              min={13}
                              max={65}
                              value={t.age_min}
                              onChange={(e) => emitUpdate('age_min', parseInt(e.target.value || '0'))}
                              placeholder="Min"
                            />
                            <Input
                              type="number"
                              min={13}
                              max={65}
                              value={t.age_max}
                              onChange={(e) => emitUpdate('age_max', parseInt(e.target.value || '0'))}
                              placeholder="Max"
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Gender</Label>
                          <div className="flex gap-4 mt-1">
                            {['male','female'].map(g => (
                              <label key={g} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={t.genders.includes(g)}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? Array.from(new Set([...t.genders, g]))
                                      : t.genders.filter(x => x !== g);
                                    emitUpdate('genders', next);
                                  }}
                                />
                                {g === 'male' ? 'Men' : 'Women'}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <Label>Interests (comma-separated)</Label>
                          <Input
                            value={t.interests.join(', ')}
                            onChange={(e) => emitUpdate('interests', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                            placeholder="e.g., Digital marketing, Business tools"
                            className="mt-1"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Countries</Label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {['US','CA','GB','AU','DE','FR','NL','SE','IN'].map(code => {
                              const selected = t.countries.includes(code);
                              return (
                                <button
                                  key={code}
                                  type="button"
                                  onClick={() => {
                                    const next = selected
                                      ? t.countries.filter(c => c !== code)
                                      : [...t.countries, code];
                                    emitUpdate('countries', next);
                                  }}
                                  className={`px-3 py-1 rounded border text-sm ${selected ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                                >
                                  {code}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
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