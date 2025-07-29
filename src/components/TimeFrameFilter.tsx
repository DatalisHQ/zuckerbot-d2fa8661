import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";

interface TimeFrame {
  id: string;
  label: string;
  days: number;
}

const TIME_FRAMES: TimeFrame[] = [
  { id: 'today', label: 'Today', days: 1 },
  { id: 'week', label: 'Last 7 days', days: 7 },
  { id: 'month', label: 'Last 30 days', days: 30 },
  { id: 'quarter', label: 'Last 90 days', days: 90 },
  { id: 'custom', label: 'Custom Range', days: 0 }
];

interface TimeFrameFilterProps {
  selectedTimeFrame: string;
  customDateRange?: { from: Date | null; to: Date | null };
  onTimeFrameChange: (timeFrame: string, customRange?: { from: Date | null; to: Date | null }) => void;
}

export const TimeFrameFilter = ({ 
  selectedTimeFrame, 
  customDateRange,
  onTimeFrameChange 
}: TimeFrameFilterProps) => {
  const [isCustomCalendarOpen, setIsCustomCalendarOpen] = useState(false);
  const [customRange, setCustomRange] = useState<{ from: Date | null; to: Date | null }>(
    customDateRange || { from: null, to: null }
  );

  const handleTimeFrameSelect = (timeFrameId: string) => {
    if (timeFrameId === 'custom') {
      setIsCustomCalendarOpen(true);
    } else {
      onTimeFrameChange(timeFrameId);
    }
  };

  const handleCustomRangeSelect = (range: { from: Date | null; to: Date | null }) => {
    setCustomRange(range);
    if (range.from && range.to) {
      onTimeFrameChange('custom', range);
      setIsCustomCalendarOpen(false);
    }
  };

  const getSelectedLabel = () => {
    if (selectedTimeFrame === 'custom' && customRange.from && customRange.to) {
      return `${format(customRange.from, 'MMM dd')} - ${format(customRange.to, 'MMM dd')}`;
    }
    return TIME_FRAMES.find(tf => tf.id === selectedTimeFrame)?.label || 'Last 30 days';
  };

  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-muted-foreground" />
      <div className="flex flex-wrap gap-2">
        {TIME_FRAMES.map((timeFrame) => (
          <Button
            key={timeFrame.id}
            variant={selectedTimeFrame === timeFrame.id ? "default" : "outline"}
            size="sm"
            onClick={() => handleTimeFrameSelect(timeFrame.id)}
            className="h-8"
          >
            {timeFrame.label}
          </Button>
        ))}
      </div>
      
      {selectedTimeFrame === 'custom' && (
        <Popover open={isCustomCalendarOpen} onOpenChange={setIsCustomCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <CalendarIcon className="h-3 w-3 mr-1" />
              {getSelectedLabel()}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="range"
              selected={{ from: customRange.from || undefined, to: customRange.to || undefined }}
              onSelect={(range) => {
                if (range) {
                  handleCustomRangeSelect({ from: range.from || null, to: range.to || null });
                }
              }}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};