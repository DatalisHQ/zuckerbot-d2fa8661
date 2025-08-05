import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CampaignNameAndObjectiveProps {
  campaignName: string;
  objective: string;
  onCampaignNameChange: (name: string) => void;
  onObjectiveChange: (objective: string) => void;
}

const OBJECTIVES = {
  'AWARENESS': {
    name: 'Brand Awareness',
    description: 'Increase brand recognition and reach more people'
  },
  'TRAFFIC': {
    name: 'Website Traffic',
    description: 'Drive visits to your website or app'
  },
  'ENGAGEMENT': {
    name: 'Engagement',
    description: 'Get more likes, comments, shares, and interactions'
  },
  'LEADS': {
    name: 'Lead Generation',
    description: 'Collect contact information from potential customers'
  },
  'SALES': {
    name: 'Conversions/Sales',
    description: 'Drive purchases and other valuable actions'
  }
};

export const CampaignNameAndObjective = ({
  campaignName,
  objective,
  onCampaignNameChange,
  onObjectiveChange
}: CampaignNameAndObjectiveProps) => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Campaign Setup</h1>
        <p className="text-muted-foreground">Start by naming your campaign and choosing your marketing objective</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Campaign Name */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Name</CardTitle>
            <CardDescription>
              Choose a descriptive name for your campaign
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="campaign-name">Campaign Name</Label>
            <Input
              id="campaign-name"
              value={campaignName}
              onChange={(e) => onCampaignNameChange(e.target.value)}
              placeholder="e.g., Holiday Sale 2024"
              className="mt-2"
            />
          </CardContent>
        </Card>

        {/* Campaign Objective */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Objective</CardTitle>
            <CardDescription>
              What do you want to achieve with this campaign?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="objective">Objective</Label>
            <Select value={objective} onValueChange={onObjectiveChange}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select campaign objective" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(OBJECTIVES).map(([key, obj]) => (
                  <SelectItem key={key} value={key}>
                    <div className="space-y-1">
                      <div className="font-medium">{obj.name}</div>
                      <div className="text-sm text-muted-foreground">{obj.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* Objective Description */}
      {objective && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
              <div>
                <h4 className="font-semibold">{OBJECTIVES[objective as keyof typeof OBJECTIVES]?.name}</h4>
                <p className="text-muted-foreground text-sm mt-1">
                  {OBJECTIVES[objective as keyof typeof OBJECTIVES]?.description}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};