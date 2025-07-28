import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Loader2, Users, Target } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AudienceSegment {
  segment: string;
  criteria: string;
}

interface CompetitorProfile {
  name: string;
  valueProps: string[];
  toneProfile: string;
}

interface AudienceSegmentsProps {
  brandUrl: string;
  competitorProfiles: CompetitorProfile[];
  onSegmentsSelected: (segments: AudienceSegment[]) => void;
}

export function AudienceSegments({ brandUrl, competitorProfiles, onSegmentsSelected }: AudienceSegmentsProps) {
  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  const { data: audienceData, isLoading, error } = useQuery({
    queryKey: ['suggest-audience', brandUrl, competitorProfiles],
    queryFn: async () => {
      console.log('Calling suggest-audience function...');
      
      const { data, error } = await supabase.functions.invoke('suggest-audience', {
        body: {
          brandUrl,
          competitorProfiles
        }
      });

      if (error) {
        console.error('Error calling suggest-audience:', error);
        throw new Error(error.message || 'Failed to generate audience segments');
      }

      if (!data?.segments) {
        throw new Error('No audience segments returned');
      }

      return data;
    },
    enabled: !!(brandUrl && competitorProfiles?.length > 0),
    retry: 1
  });

  const handleSegmentToggle = (index: number) => {
    const newSelected = new Set(selectedSegments);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedSegments(newSelected);
  };

  const handleContinue = () => {
    if (selectedSegments.size === 0) {
      toast({
        title: "No segments selected",
        description: "Please select at least one audience segment to continue.",
        variant: "destructive"
      });
      return;
    }

    const selected = audienceData?.segments?.filter((_, index) => selectedSegments.has(index)) || [];
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

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Users className="h-5 w-5" />
            Audience Analysis Failed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Unable to generate audience segments. Please try again.
          </p>
          <p className="text-sm text-muted-foreground">
            Error: {error.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  const segments = audienceData?.segments || [];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Suggested Audience Segments
        </CardTitle>
        <p className="text-muted-foreground">
          Select the audience segments that best match your target market
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {segments.map((segment, index) => (
          <div
            key={index}
            className={`border rounded-lg p-4 cursor-pointer transition-colors ${
              selectedSegments.has(index)
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
            onClick={() => handleSegmentToggle(index)}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                checked={selectedSegments.has(index)}
                onChange={() => handleSegmentToggle(index)}
                className="mt-1"
              />
              <div className="flex-1">
                <h4 className="font-medium text-foreground mb-2">
                  {segment.segment}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {segment.criteria}
                </p>
              </div>
            </div>
          </div>
        ))}

        {segments.length > 0 && (
          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {selectedSegments.size} of {segments.length} segments selected
            </p>
            <Button 
              onClick={handleContinue}
              disabled={selectedSegments.size === 0}
            >
              Continue with Selected Segments
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}