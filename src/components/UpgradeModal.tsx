import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason?: string;
}

const PLAN_OPTIONS = [
  {
    id: 'pro_monthly',
    planType: 'pro',
    label: 'Pro (Monthly)',
    price: '$25/mo',
    description: 'Up to 3 business profiles, 100 campaigns',
  },
  {
    id: 'pro_yearly',
    planType: 'pro',
    label: 'Pro (Annual)',
    price: '$240/yr',
    description: 'Up to 3 business profiles, 100 campaigns',
  },
  {
    id: 'agency_monthly',
    planType: 'agency',
    label: 'Agency',
    price: '$89/mo',
    description: 'Unlimited business profiles & campaigns',
  },
];

export function UpgradeModal({ open, onClose, reason }: UpgradeModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const handleCheckout = async (priceId: string, planType: string) => {
    try {
      setLoading(priceId);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Please log in', description: 'You must be logged in to upgrade.', variant: 'destructive' });
        setLoading(null);
        return;
      }
      // Preserve current route and critical state via successPath
      const currentUrl = new URL(window.location.href);
      const params = new URLSearchParams(currentUrl.search);
      // Pass campaign and resume info if present so we can restore
      const successPath = `${currentUrl.pathname}?${params.toString()}`;
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId, planType, successPath }
      });
      if (error) throw error;
      // Open in same tab to preserve app context on return
      window.location.href = data.url;
      setLoading(null);
      onClose();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to start checkout. Please try again.',
        variant: 'destructive',
      });
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade Your Plan</DialogTitle>
          <DialogDescription>
            {reason || 'To access this feature, please upgrade your ZuckerBot plan.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {PLAN_OPTIONS.map(option => (
            <div key={option.id} className="flex items-center justify-between border rounded-lg p-4 mb-2">
              <div>
                <div className="font-semibold">{option.label}</div>
                <div className="text-muted-foreground text-sm">{option.description}</div>
              </div>
              <Button
                onClick={() => handleCheckout(option.id, option.planType)}
                disabled={!!loading || loading === option.id}
              >
                {loading === option.id ? 'Redirecting...' : `Upgrade (${option.price})`}
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={!!loading}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}