import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';

interface CampaignNameAndObjectiveProps {
  campaignName: string;
  objective: string;
  onCampaignNameChange: (name: string) => void;
  onObjectiveChange: (objective: string) => void;
  startDate?: string | null;
  endDate?: string | null;
  onStartDateChange?: (iso: string | null) => void;
  onEndDateChange?: (iso: string | null) => void;
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
  onObjectiveChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: CampaignNameAndObjectiveProps) => {
  const [startTime, setStartTime] = useState<{ h: string; m: string }>(() => {
    const d = startDate ? new Date(startDate) : null;
    return { h: d ? String(d.getHours()).padStart(2, '0') : '09', m: d ? String(d.getMinutes()).padStart(2, '0') : '00' };
  });
  const [endTime, setEndTime] = useState<{ h: string; m: string }>(() => {
    const d = endDate ? new Date(endDate) : null;
    return { h: d ? String(d.getHours()).padStart(2, '0') : '17', m: d ? String(d.getMinutes()).padStart(2, '0') : '00' };
  });

  const combineDateTime = (date: Date, time: { h: string; m: string }) => {
    const dt = new Date(date);
    dt.setHours(parseInt(time.h, 10), parseInt(time.m, 10), 0, 0);
    return dt.toISOString();
  };

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

  const timeframeError = useMemo(() => {
    if (!startDate || !endDate) return 'Please select both a start and end date/time';
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return 'Invalid date/time selection';
    if (end <= start) return 'End time must be after start time';
    return '';
  }, [startDate, endDate]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Campaign Setup</h1>
        <p className="text-muted-foreground">Start by naming your campaign, choosing an objective, and setting the campaign timeframe</p>
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

      {/* Campaign Timeframe */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Timeframe</CardTitle>
          <CardDescription>
            Select the start and end dates/times. You cannot proceed without setting a valid timeframe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Start */}
            <div className="space-y-2">
              <Label>Start</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? new Date(startDate).toLocaleDateString() : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="p-0">
                    <Calendar
                      mode="single"
                      selected={startDate ? new Date(startDate) : undefined}
                      onSelect={(date) => {
                        if (!onStartDateChange) return;
                        if (date) onStartDateChange(combineDateTime(date, startTime));
                      }}
                      disabled={undefined}
                    />
                  </PopoverContent>
                </Popover>
                <div className="flex gap-2 w-40">
                  <Select value={startTime.h} onValueChange={(h) => {
                    const next = { ...startTime, h };
                    setStartTime(next);
                    if (startDate && onStartDateChange) onStartDateChange(combineDateTime(new Date(startDate), next));
                  }}>
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {hours.map((h) => (<SelectItem key={h} value={h}>{h}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select value={startTime.m} onValueChange={(m) => {
                    const next = { ...startTime, m };
                    setStartTime(next);
                    if (startDate && onStartDateChange) onStartDateChange(combineDateTime(new Date(startDate), next));
                  }}>
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {minutes.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* End */}
            <div className="space-y-2">
              <Label>End</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? new Date(endDate).toLocaleDateString() : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="p-0">
                    <Calendar
                      mode="single"
                      selected={endDate ? new Date(endDate) : undefined}
                      onSelect={(date) => {
                        if (!onEndDateChange) return;
                        if (date) onEndDateChange(combineDateTime(date, endTime));
                      }}
                      // Prevent selecting before start date
                      disabled={startDate ? { before: new Date(startDate) } : undefined as any}
                    />
                  </PopoverContent>
                </Popover>
                <div className="flex gap-2 w-40">
                  <Select value={endTime.h} onValueChange={(h) => {
                    const next = { ...endTime, h };
                    setEndTime(next);
                    if (endDate && onEndDateChange) onEndDateChange(combineDateTime(new Date(endDate), next));
                  }}>
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {hours.map((h) => (<SelectItem key={h} value={h}>{h}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select value={endTime.m} onValueChange={(m) => {
                    const next = { ...endTime, m };
                    setEndTime(next);
                    if (endDate && onEndDateChange) onEndDateChange(combineDateTime(new Date(endDate), next));
                  }}>
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {minutes.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
          {timeframeError && (
            <p className="text-sm text-destructive mt-3">{timeframeError}</p>
          )}
        </CardContent>
      </Card>

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