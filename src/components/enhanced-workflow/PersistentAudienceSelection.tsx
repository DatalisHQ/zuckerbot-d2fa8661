import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Users, Target, Edit2, Save, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface DetailedAudienceSegment {
  id?: string;
  segment: string;
  criteria: string;
  targeting_data: {
    age_min: number;
    age_max: number;
    genders: string[];
    interests: string[];
    behaviors: string[];
    location_types: string[];
    countries: string[];
  };
}

interface CompetitorProfile {
  name: string;
  valueProps: string[];
  toneProfile: string;
}

interface PersistentAudienceSelectionProps {
  brandUrl?: string;
  competitorProfiles?: CompetitorProfile[];
  campaignId: string;
  onSegmentsSelected: (segments: DetailedAudienceSegment[]) => void;
}

export function PersistentAudienceSelection({ 
  brandUrl, 
  competitorProfiles, 
  campaignId, 
  onSegmentsSelected 
}: PersistentAudienceSelectionProps) {
  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(new Set());
  const [savedSegments, setSavedSegments] = useState<DetailedAudienceSegment[]>([]);
  const [editingSegment, setEditingSegment] = useState<number | null>(null);
  const { toast } = useToast();

  // Load existing audience segments from database
  const { data: existingSegments, refetch: refetchSegments } = useQuery({
    queryKey: ['audience-segments', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audience_segments')
        .select('*')
        .eq('campaign_id', campaignId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!campaignId
  });

  // Generate new audience suggestions
  const { data: audienceData, isLoading, error } = useQuery({
    queryKey: ['suggest-audience', brandUrl, competitorProfiles],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('suggest-audience', {
        body: { brandUrl, competitorProfiles }
      });

      if (error) throw error;
      if (!data?.segments) throw new Error('No audience segments returned');

      // Transform basic segments into detailed segments with targeting data
      const detailedSegments: DetailedAudienceSegment[] = data.segments.map((segment: any) => ({
        segment: segment.segment,
        criteria: segment.criteria,
        targeting_data: parseTargetingFromCriteria(segment.criteria)
      }));

      return { segments: detailedSegments };
    },
    enabled: !!(brandUrl && competitorProfiles?.length > 0) && (!existingSegments || existingSegments.length === 0),
    retry: 1
  });

  // Parse targeting criteria into structured data
  const parseTargetingFromCriteria = (criteria: string): DetailedAudienceSegment['targeting_data'] => {
    const ageMatch = criteria.match(/Age (\d+)-(\d+)/);
    const genderMatch = criteria.match(/(?:Men|Women|All genders)/g);
    const interestMatches = criteria.match(/Interests?:\s*([^,]+(?:,\s*[^,]+)*)/i);
    
    return {
      age_min: ageMatch ? parseInt(ageMatch[1]) : 18,
      age_max: ageMatch ? parseInt(ageMatch[2]) : 65,
      genders: genderMatch ? (genderMatch.includes('Men') && genderMatch.includes('Women') ? ['male', 'female'] : 
                genderMatch.includes('Men') ? ['male'] : ['female']) : ['male', 'female'],
      interests: interestMatches ? interestMatches[1].split(',').map(i => i.trim()) : [],
      behaviors: [],
      location_types: ['home'],
      countries: ['US']
    };
  };

  // Initialize segments from database or generated data
  useEffect(() => {
    if (existingSegments && existingSegments.length > 0) {
      const detailedSegments = existingSegments.map(seg => ({
        id: seg.id,
        segment: seg.segment_name,
        criteria: seg.segment_criteria,
        targeting_data: seg.targeting_data as DetailedAudienceSegment['targeting_data']
      }));
      setSavedSegments(detailedSegments);
      setSelectedSegments(new Set(detailedSegments.map((_, i) => i)));
    } else if (audienceData?.segments) {
      setSavedSegments(audienceData.segments);
    }
  }, [existingSegments, audienceData]);

  const handleSegmentToggle = (index: number) => {
    const newSelected = new Set(selectedSegments);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedSegments(newSelected);
  };

  const saveSegmentToDatabase = async (segment: DetailedAudienceSegment, index: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const segmentData = {
        campaign_id: campaignId,
        user_id: user.id,
        segment_name: segment.segment,
        segment_criteria: segment.criteria,
        targeting_data: segment.targeting_data
      };

      if (segment.id) {
        // Update existing
        const { error } = await supabase
          .from('audience_segments')
          .update(segmentData)
          .eq('id', segment.id);
        if (error) throw error;
      } else {
        // Create new
        const { data, error } = await supabase
          .from('audience_segments')
          .insert(segmentData)
          .select()
          .single();
        if (error) throw error;
        
        // Update local state with returned ID
        setSavedSegments(prev => prev.map((seg, i) => 
          i === index ? { ...seg, id: data.id } : seg
        ));
      }

      setEditingSegment(null);
      await refetchSegments();
      
      toast({
        title: "Segment saved",
        description: "Audience segment saved successfully"
      });
    } catch (error) {
      console.error('Error saving segment:', error);
      toast({
        title: "Save failed",
        description: "Failed to save audience segment",
        variant: "destructive"
      });
    }
  };

  const updateSegmentTargeting = (index: number, field: string, value: any) => {
    setSavedSegments(prev => prev.map((seg, i) => 
      i === index ? {
        ...seg,
        targeting_data: { ...seg.targeting_data, [field]: value }
      } : seg
    ));
  };

  const handleContinue = async () => {
    if (selectedSegments.size === 0) {
      toast({
        title: "No segments selected",
        description: "Please select at least one audience segment to continue.",
        variant: "destructive"
      });
      return;
    }

    const selected = savedSegments.filter((_, index) => selectedSegments.has(index));
    
    // Save all selected segments to database
    for (let i = 0; i < selected.length; i++) {
      const segment = selected[i];
      if (!segment.id) {
        await saveSegmentToDatabase(segment, savedSegments.indexOf(segment));
      }
    }

    onSegmentsSelected(selected);
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Analyzing Audience Segments
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">
              Generating audience segments based on competitor insights...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Audience Segments & Targeting
        </CardTitle>
        <p className="text-muted-foreground">
          Select and configure audience segments for your campaign. Each segment will become an Ad Set.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {savedSegments.map((segment, index) => (
          <div
            key={segment.id || index}
            className={`border rounded-lg p-4 transition-colors ${
              selectedSegments.has(index)
                ? 'border-primary bg-primary/5'
                : 'border-border'
            }`}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                checked={selectedSegments.has(index)}
                onCheckedChange={() => handleSegmentToggle(index)}
                className="mt-1"
              />
              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-foreground">
                    {segment.segment}
                  </h4>
                  <div className="flex items-center gap-2">
                    {segment.id && <Badge variant="outline">Saved</Badge>}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingSegment(editingSegment === index ? null : index)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <p className="text-sm text-muted-foreground">
                  {segment.criteria}
                </p>

                {editingSegment === index && (
                  <div className="space-y-4 border-t pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Age Range</Label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            value={segment.targeting_data.age_min}
                            onChange={(e) => updateSegmentTargeting(index, 'age_min', parseInt(e.target.value))}
                            placeholder="Min age"
                          />
                          <Input
                            type="number"
                            value={segment.targeting_data.age_max}
                            onChange={(e) => updateSegmentTargeting(index, 'age_max', parseInt(e.target.value))}
                            placeholder="Max age"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Gender</Label>
                        <div className="flex gap-2">
                          {['male', 'female'].map(gender => (
                            <label key={gender} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={segment.targeting_data.genders.includes(gender)}
                                onChange={(e) => {
                                  const genders = e.target.checked
                                    ? [...segment.targeting_data.genders, gender]
                                    : segment.targeting_data.genders.filter(g => g !== gender);
                                  updateSegmentTargeting(index, 'genders', genders);
                                }}
                              />
                              {gender === 'male' ? 'Men' : 'Women'}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <Label>Interests (comma-separated)</Label>
                      <Input
                        value={segment.targeting_data.interests.join(', ')}
                        onChange={(e) => updateSegmentTargeting(index, 'interests', 
                          e.target.value.split(',').map(i => i.trim()).filter(Boolean)
                        )}
                        placeholder="Digital marketing, Business tools, etc."
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        onClick={() => saveSegmentToDatabase(segment, index)}
                        size="sm"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => setEditingSegment(null)}
                        size="sm"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {savedSegments.length > 0 && (
          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {selectedSegments.size} of {savedSegments.length} segments selected → {selectedSegments.size} Ad Sets will be created
            </p>
            <Button 
              onClick={handleContinue}
              disabled={selectedSegments.size === 0}
            >
              Continue with Selected Segments
            </Button>
          </div>
        )}

        {error && (
          <div className="text-center py-4 text-destructive">
            <p className="text-sm">
              Error loading segments: {error.message}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}