import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Users, Target } from 'lucide-react';

interface AudienceSegment {
  id: string;
  name: string;
  type: 'broad' | 'lookalike' | 'interests' | 'custom';
  description: string;
  targeting?: {
    interests?: string[];
    demographics?: string;
    behaviors?: string[];
  };
}

interface FacebookAudienceSegment {
  segment: string;
  criteria: string;
}

interface AudienceSplittingProps {
  segments: AudienceSegment[];
  onSegmentsChange: (segments: AudienceSegment[]) => void;
  savedAudienceSegments?: FacebookAudienceSegment[];
  onContinue?: () => void;
}

const DEFAULT_SEGMENTS: AudienceSegment[] = [
  {
    id: '1',
    name: 'Broad Interests',
    type: 'broad',
    description: 'Target people with general interests related to your business',
    targeting: {
      demographics: 'Ages 25-55, All genders'
    }
  },
  {
    id: '2', 
    name: 'Lookalike Audience',
    type: 'lookalike',
    description: 'Target people similar to your existing customers',
    targeting: {
      demographics: 'Based on website visitors and customers'
    }
  }
];

export const AudienceSplitting = ({
  segments,
  onSegmentsChange,
  savedAudienceSegments,
  onContinue
}: AudienceSplittingProps) => {
  const [newSegmentName, setNewSegmentName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const didInit = useRef(false);
  const hasUserSelected = useRef(false);

  // Only initialize with defaults or saved segments on first mount and never after user interaction
  useEffect(() => {
    if (!didInit.current && segments.length === 0 && !hasUserSelected.current) {
      didInit.current = true;
      if (savedAudienceSegments && savedAudienceSegments.length > 0) {
        const convertedSegments = savedAudienceSegments.map((segment, index) => ({
          id: `saved-${index}`,
          name: segment.segment,
          type: 'interests' as const,
          description: segment.criteria,
          targeting: {
            demographics: segment.criteria
          }
        }));
        onSegmentsChange(convertedSegments);
      } else {
        onSegmentsChange(DEFAULT_SEGMENTS);
      }
    }
  }, [segments.length, onSegmentsChange, savedAudienceSegments]);

  // Mark user as having made a selection after any change
  const addSegment = () => {
    if (!newSegmentName.trim()) return;
    hasUserSelected.current = true;
    const newSegment: AudienceSegment = {
      id: Date.now().toString(),
      name: newSegmentName,
      type: 'custom',
      description: 'Custom audience segment',
      targeting: {
        demographics: 'Custom targeting criteria'
      }
    };
    onSegmentsChange([...segments, newSegment]);
    setNewSegmentName('');
    setShowAddForm(false);
  };

  const removeSegment = (id: string) => {
    hasUserSelected.current = true;
    onSegmentsChange(segments.filter(segment => segment.id !== id));
  };

  const updateSegment = (id: string, updates: Partial<AudienceSegment>) => {
    hasUserSelected.current = true;
    onSegmentsChange(
      segments.map(segment =>
        segment.id === id ? { ...segment, ...updates } : segment
      )
    );
  };

  const getSegmentIcon = (type: string) => {
    switch (type) {
      case 'broad':
        return <Users className="h-4 w-4" />;
      case 'lookalike':
        return <Target className="h-4 w-4" />;
      default:
        return <Users className="h-4 w-4" />;
    }
  };

  const getSegmentColor = (type: string) => {
    switch (type) {
      case 'broad':
        return 'default';
      case 'lookalike':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Audience Targeting</h1>
        <p className="text-muted-foreground">
          Split your campaign across different audience segments for better testing
        </p>
      </div>

      <div className="space-y-4">
        {segments.map((segment) => (
          <Card key={segment.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    {getSegmentIcon(segment.type)}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{segment.name}</CardTitle>
                    <CardDescription>{segment.description}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={getSegmentColor(segment.type) as any}>
                    {segment.type}
                  </Badge>
                  {segments.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSegment(segment.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <Label htmlFor={`segment-name-${segment.id}`}>Segment Name</Label>
                  <Input
                    id={`segment-name-${segment.id}`}
                    value={segment.name}
                    onChange={(e) => updateSegment(segment.id, { name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Targeting Details</Label>
                  <div className="mt-1 p-3 bg-muted rounded-md text-sm">
                    {segment.targeting?.demographics}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Add New Segment */}
        {showAddForm ? (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="new-segment-name">New Segment Name</Label>
                  <Input
                    id="new-segment-name"
                    value={newSegmentName}
                    onChange={(e) => setNewSegmentName(e.target.value)}
                    placeholder="e.g., Premium Product Shoppers"
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={addSegment} disabled={!newSegmentName.trim()}>
                    Add Segment
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button
            variant="outline"
            className="w-full h-16 border-2 border-dashed"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Another Audience Segment
          </Button>
        )}
      </div>

      <Card className="bg-muted/50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-sm">Why split audiences?</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Testing different audience segments helps you discover which groups respond best to your ads, 
                allowing you to optimize performance and allocate budget more effectively.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Continue Button */}
      {typeof onContinue === 'function' && (
        <div className="flex justify-end pt-4">
          <Button
            onClick={onContinue}
            disabled={segments.length < 1}
            size="lg"
          >
            Continue with selected segments
          </Button>
        </div>
      )}
    </div>
  );
};