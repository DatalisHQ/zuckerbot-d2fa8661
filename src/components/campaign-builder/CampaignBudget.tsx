import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

interface CampaignBudgetProps {
  budget: number;
  objective: string;
  onBudgetChange: (budget: number) => void;
}

const SUGGESTED_BUDGETS = {
  'AWARENESS': 50,
  'TRAFFIC': 30,
  'ENGAGEMENT': 25,
  'LEADS': 75,
  'SALES': 100
};

export const CampaignBudget = ({
  budget,
  objective,
  onBudgetChange
}: CampaignBudgetProps) => {
  const [isCustomBudget, setIsCustomBudget] = useState(false);

  const handleSuggestBudget = () => {
    const suggestedBudget = SUGGESTED_BUDGETS[objective as keyof typeof SUGGESTED_BUDGETS] || 50;
    onBudgetChange(suggestedBudget);
    setIsCustomBudget(false);
  };

  const getBudgetRecommendation = () => {
    if (!objective) return '';
    
    const suggestions = {
      'AWARENESS': 'We recommend $50-100/day for effective brand awareness campaigns',
      'TRAFFIC': 'A daily budget of $30-75 typically works well for driving website traffic',
      'ENGAGEMENT': 'Start with $25-50/day to boost engagement on your content',
      'LEADS': 'Lead generation campaigns perform well with $75-150/day budgets',
      'SALES': 'For sales campaigns, consider $100-200/day to reach purchase-ready audiences'
    };

    return suggestions[objective as keyof typeof suggestions] || '';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Campaign Budget</h1>
        <p className="text-muted-foreground">Set your daily advertising budget</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily Budget</CardTitle>
          <CardDescription>
            How much would you like to spend per day on this campaign?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="budget">Daily Budget (USD)</Label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="budget"
                  type="number"
                  value={budget || ''}
                  onChange={(e) => {
                    onBudgetChange(Number(e.target.value));
                    setIsCustomBudget(true);
                  }}
                  placeholder="0"
                  className="pl-7"
                  min="1"
                />
              </div>
              <Button
                variant="outline"
                onClick={handleSuggestBudget}
                className="flex items-center gap-2"
                disabled={!objective}
              >
                <Sparkles className="h-4 w-4" />
                Suggest Budget
              </Button>
            </div>
          </div>

          {objective && (
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Budget Recommendation</h4>
                  <p className="text-sm text-muted-foreground">
                    {getBudgetRecommendation()}
                  </p>
                  {!isCustomBudget && budget > 0 && (
                    <p className="text-sm text-primary">
                      ✓ Current budget of ${budget}/day is within the recommended range
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {budget > 0 && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-2xl font-bold">${budget * 7}</div>
                <div className="text-sm text-muted-foreground">Weekly spend</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">${budget * 30}</div>
                <div className="text-sm text-muted-foreground">Monthly spend</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};