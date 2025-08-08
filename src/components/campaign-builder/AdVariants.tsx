import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Sparkles, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface AdVariant {
  id: string;
  headline: string;
  primaryText: string;
  callToAction: string;
  description?: string;
  placement?: 'feed' | 'stories' | 'reels';
  score?: number;
  flags?: string[];
  meta?: Record<string, any>;
}

interface AdSet {
  id: string;
  name: string;
  audienceSegmentId: string;
}

type StyleHints = {
  archetype?: 'offer' | 'proof' | 'fomo' | 'education';
  placement?: 'feed' | 'stories' | 'reels';
  length?: 'short' | 'medium';
  tone?: 'direct' | 'friendly' | 'bold' | 'professional';
};

interface AdVariantsProps {
  adSets: AdSet[];
  adVariants: Record<string, AdVariant[]>;
  onAdVariantsChange: (variants: Record<string, AdVariant[]>) => void;
  brandUrl?: string;
  campaignId?: string;
  campaignObjective?: string;
}

const CTA_OPTIONS = [
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'SHOP_NOW', label: 'Shop Now' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'DOWNLOAD', label: 'Download' },
  { value: 'BOOK_TRAVEL', label: 'Book Now' },
  { value: 'CONTACT_US', label: 'Contact Us' },
  { value: 'GET_QUOTE', label: 'Get Quote' },
  { value: 'SUBSCRIBE', label: 'Subscribe' }
];

export const AdVariants = ({
  adSets,
  adVariants,
  onAdVariantsChange,
  brandUrl,
  campaignId,
  campaignObjective
}: AdVariantsProps) => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [assets, setAssets] = useState<{ id: string; url: string }[]>([]);
  const [assetIndexByAdSet, setAssetIndexByAdSet] = useState<Record<string, number>>({});
  const [styleHintsByAdSet, setStyleHintsByAdSet] = useState<Record<string, StyleHints>>({});

  // Load selected creative assets once per campaign
  useEffect(() => {
    const isAbsolute = (u: string) => /^(https?:|data:|blob:)/i.test(u);
    const loadAssets = async () => {
      try {
        if (!campaignId) return;
        const { data, error } = await supabase
          .from('ad_campaigns')
          .select('creative_assets')
          .eq('id', campaignId as any)
          .single();
        if (error) return;
        const selected = (data?.creative_assets as any[] | undefined)?.filter(a => a && (a.selected ?? true)) || [];
        const normalized = (await Promise.all(selected.map(async (a: any) => {
          let url: string | undefined = a.url || a.publicUrl || a.path;
          if (url && isAbsolute(url)) return { id: a.id || url, url };
          // Attempt public URL first
          if (typeof url === 'string' && url) {
            const pub = supabase.storage.from('user-files').getPublicUrl(url).data?.publicUrl;
            if (pub) return { id: a.id || url, url: pub };
            // Then try signed URL for private buckets
            try {
              const signed = await supabase.storage.from('user-files').createSignedUrl(url, 60 * 60);
              if (!signed.error && signed.data?.signedUrl) return { id: a.id || url, url: signed.data.signedUrl };
            } catch {}
          }
          if (a.path) {
            const pub = supabase.storage.from('user-files').getPublicUrl(a.path).data?.publicUrl;
            if (pub) return { id: a.id || a.path, url: pub };
            try {
              const signed = await supabase.storage.from('user-files').createSignedUrl(a.path, 60 * 60);
              if (!signed.error && signed.data?.signedUrl) return { id: a.id || a.path, url: signed.data.signedUrl };
            } catch {}
          }
          return null;
        }))).filter(Boolean) as { id: string; url: string }[];
        setAssets(normalized);
      } catch {}
    };
    loadAssets();
  }, [campaignId]);

  // Initialize with default variants for each ad set
  useEffect(() => {
    const newVariants = { ...adVariants };
    let hasChanges = false;

    adSets.forEach(adSet => {
      if (!newVariants[adSet.id] || newVariants[adSet.id].length === 0) {
        newVariants[adSet.id] = [
          {
            id: `${adSet.id}_variant_1`,
            headline: '',
            primaryText: '',
            callToAction: 'LEARN_MORE',
            description: ''
          },
          {
            id: `${adSet.id}_variant_2`,
            headline: '',
            primaryText: '',
            callToAction: 'LEARN_MORE',
            description: ''
          }
        ];
        hasChanges = true;
      }
      // Ensure default style hints per ad set
      setStyleHintsByAdSet(prev => ({
        ...prev,
        [adSet.id]: {
          placement: prev[adSet.id]?.placement || 'feed',
          archetype: prev[adSet.id]?.archetype || 'offer',
          length: prev[adSet.id]?.length || 'short',
          tone: prev[adSet.id]?.tone || 'direct',
        },
      }));
    });

    if (hasChanges) {
      onAdVariantsChange(newVariants);
    }
  }, [adSets, adVariants, onAdVariantsChange]);

  const addVariant = (adSetId: string) => {
    const newVariant: AdVariant = {
      id: `${adSetId}_variant_${Date.now()}`,
      headline: '',
      primaryText: '',
      callToAction: 'LEARN_MORE',
      description: ''
    };

    const updatedVariants = {
      ...adVariants,
      [adSetId]: [...(adVariants[adSetId] || []), newVariant]
    };

    onAdVariantsChange(updatedVariants);
  };

  const removeVariant = (adSetId: string, variantId: string) => {
    const currentVariants = adVariants[adSetId] || [];
    if (currentVariants.length <= 2) {
      toast({
        title: "Minimum variants required",
        description: "Each ad set must have at least 2 ad variants",
        variant: "destructive"
      });
      return;
    }

    const updatedVariants = {
      ...adVariants,
      [adSetId]: currentVariants.filter(v => v.id !== variantId)
    };

    onAdVariantsChange(updatedVariants);
  };

  const updateVariant = (adSetId: string, variantId: string, updates: Partial<AdVariant>) => {
    const updatedVariants = {
      ...adVariants,
      [adSetId]: (adVariants[adSetId] || []).map(variant =>
        variant.id === variantId ? { ...variant, ...updates } : variant
      )
    };

    onAdVariantsChange(updatedVariants);
  };

  const duplicateVariant = (adSetId: string, variantId: string) => {
    const originalVariant = adVariants[adSetId]?.find(v => v.id === variantId);
    if (!originalVariant) return;

    const newVariant: AdVariant = {
      ...originalVariant,
      id: `${adSetId}_variant_${Date.now()}`,
      headline: `${originalVariant.headline} (Copy)`
    };

    const updatedVariants = {
      ...adVariants,
      [adSetId]: [...(adVariants[adSetId] || []), newVariant]
    };

    onAdVariantsChange(updatedVariants);
  };

  const generateVariants = async (adSetId: string, audienceSegmentId?: string) => {
    setIsGenerating(adSetId);
    try {
      const body: any = {
        campaignId,
        audienceSegmentId,
        campaignObjective,
        styleHints: styleHintsByAdSet[adSetId] || { placement: 'feed', archetype: 'offer', length: 'short', tone: 'direct' },
      };
      const { data, error } = await supabase.functions.invoke('generate-ad-copy', {
        body
      });
      if (error) {
        throw new Error(error.message || 'Failed to generate ad copy');
      }
      const variantsResp = Array.isArray(data?.variants)
        ? data.variants
        : (Array.isArray(data?.versions) ? data.versions.map((v: any) => ({
            placement: v.placement || 'feed',
            primary_text: v.primary_text || v.primaryText || '',
            headline: v.headline || '',
            cta: v.cta || v.callToAction || 'LEARN_MORE',
          })) : []);
      if (!Array.isArray(variantsResp) || variantsResp.length === 0) {
        throw new Error('No ad copy returned');
      }
      // Map top 2 generated variants
      const toVariant = (v: any, idx: number): AdVariant => ({
        id: `${adSetId}_generated_${idx + 1}`,
        headline: v.headline || '',
        primaryText: v.primary_text || v.primaryText || '',
        callToAction: (v.cta || 'LEARN_MORE').toUpperCase().replace(' ', '_'),
        description: '',
        placement: (v.placement as 'feed' | 'stories' | 'reels') || styleHintsByAdSet[adSetId]?.placement || 'feed',
        score: typeof v.score === 'number' ? v.score : undefined,
        flags: Array.isArray(v.flags) ? v.flags : undefined,
        meta: { styleHints: styleHintsByAdSet[adSetId] }
      });
      const generated: AdVariant[] = variantsResp.slice(0, 2).map(toVariant);
      // Ensure at least 2
      while (generated.length < 2) {
        generated.push({
          id: `${adSetId}_generated_${generated.length + 1}`,
          headline: '',
          primaryText: '',
          callToAction: 'LEARN_MORE',
          description: '',
          placement: styleHintsByAdSet[adSetId]?.placement || 'feed',
          meta: { styleHints: styleHintsByAdSet[adSetId] }
        });
      }
      const updated = { ...adVariants, [adSetId]: generated };
      onAdVariantsChange(updated);
      toast({ title: 'Variants generated!', description: 'Context-aware ad copy created.' });
    } catch (err: any) {
      toast({ title: 'Generation failed', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setIsGenerating(null);
    }
  };

  const getTotalVariants = () => {
    return Object.values(adVariants).reduce((total, variants) => total + variants.length, 0);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Ad Variants</h1>
        <p className="text-muted-foreground">
          Create multiple ad variations to test what resonates best with each audience
        </p>
      </div>

      <div className="space-y-8">
        {adSets.map((adSet) => {
          const variants = adVariants[adSet.id] || [];
          const assetIndex = assetIndexByAdSet[adSet.id] ?? 0;
          
          return (
            <Card key={adSet.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{adSet.name}</CardTitle>
                    <CardDescription>
                      {variants.length} ad variant{variants.length !== 1 ? 's' : ''}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 items-center flex-wrap justify-end">
                    {/* Style controls per ad set */}
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Placement</Label>
                      <Select
                        value={styleHintsByAdSet[adSet.id]?.placement || 'feed'}
                        onValueChange={(v) => setStyleHintsByAdSet(prev => ({ ...prev, [adSet.id]: { ...prev[adSet.id], placement: v as any } }))}
                      >
                        <SelectTrigger className="h-8 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="feed">Feed</SelectItem>
                          <SelectItem value="stories">Stories</SelectItem>
                          <SelectItem value="reels">Reels</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Angle</Label>
                      <Select
                        value={styleHintsByAdSet[adSet.id]?.archetype || 'offer'}
                        onValueChange={(v) => setStyleHintsByAdSet(prev => ({ ...prev, [adSet.id]: { ...prev[adSet.id], archetype: v as any } }))}
                      >
                        <SelectTrigger className="h-8 w-[130px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="offer">Offer</SelectItem>
                          <SelectItem value="proof">Social Proof</SelectItem>
                          <SelectItem value="fomo">FOMO</SelectItem>
                          <SelectItem value="education">Education</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Tone</Label>
                      <Select
                        value={styleHintsByAdSet[adSet.id]?.tone || 'direct'}
                        onValueChange={(v) => setStyleHintsByAdSet(prev => ({ ...prev, [adSet.id]: { ...prev[adSet.id], tone: v as any } }))}
                      >
                        <SelectTrigger className="h-8 w-[130px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="direct">Direct</SelectItem>
                          <SelectItem value="friendly">Friendly</SelectItem>
                          <SelectItem value="bold">Bold</SelectItem>
                          <SelectItem value="professional">Professional</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Length</Label>
                      <Select
                        value={styleHintsByAdSet[adSet.id]?.length || 'short'}
                        onValueChange={(v) => setStyleHintsByAdSet(prev => ({ ...prev, [adSet.id]: { ...prev[adSet.id], length: v as any } }))}
                      >
                        <SelectTrigger className="h-8 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="short">Short</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generateVariants(adSet.id, adSet.audienceSegmentId)}
                      disabled={isGenerating === adSet.id}
                      className="flex items-center gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      {isGenerating === adSet.id ? 'Generating...' : 'Generate with AI'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addVariant(adSet.id)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {assets.length > 0 && (
                  <div className="mb-6 border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-medium">Preview</div>
                      <div className="flex gap-2">
                        {assets.map((a, idx) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setAssetIndexByAdSet(prev => ({ ...prev, [adSet.id]: idx }))}
                            className={`h-10 w-10 rounded overflow-hidden border ${assetIndex === idx ? 'border-primary' : 'border-border'}`}
                            title={`Asset ${idx + 1}`}
                          >
                            <img src={a.url} alt="asset" className="object-cover h-full w-full" />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="border rounded-md overflow-hidden bg-muted">
                        <img src={assets[assetIndex]?.url} alt="ad" className="w-full h-64 object-cover" />
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">Facebook Ad Mockup</div>
                        <div className="p-3 border rounded-md">
                          <div className="space-y-2 text-sm">
                            <div className="font-semibold">{variants[0]?.headline || 'Headline'}</div>
                            <div>{variants[0]?.primaryText || 'Primary text will appear here.'}</div>
                            <div className="text-xs uppercase tracking-wide text-primary">{(variants[0]?.callToAction || 'LEARN_MORE').replace('_',' ')}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid gap-6 md:grid-cols-2">
                  {variants.map((variant, index) => (
                    <Card key={variant.id} className="border-2">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Variant {index + 1}</Badge>
                            {variant.placement && (
                              <Badge variant="secondary" className="uppercase">{variant.placement}</Badge>
                            )}
                            {typeof variant.score === 'number' && (
                              <Badge variant="outline">Score {variant.score}</Badge>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => duplicateVariant(adSet.id, variant.id)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            {variants.length > 2 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeVariant(adSet.id, variant.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label htmlFor={`headline-${variant.id}`}>Headline</Label>
                          <Input
                            id={`headline-${variant.id}`}
                            value={variant.headline}
                            onChange={(e) => updateVariant(adSet.id, variant.id, { headline: e.target.value })}
                            placeholder="Catchy headline for your ad"
                            className="mt-1"
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor={`primary-text-${variant.id}`}>Primary Text</Label>
                          <Textarea
                            id={`primary-text-${variant.id}`}
                            value={variant.primaryText}
                            onChange={(e) => updateVariant(adSet.id, variant.id, { primaryText: e.target.value })}
                            placeholder="Main message that will appear in your ad"
                            className="mt-1"
                            rows={3}
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor={`description-${variant.id}`}>Description (Optional)</Label>
                          <Input
                            id={`description-${variant.id}`}
                            value={variant.description || ''}
                            onChange={(e) => updateVariant(adSet.id, variant.id, { description: e.target.value })}
                            placeholder="Additional details"
                            className="mt-1"
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor={`cta-${variant.id}`}>Call to Action</Label>
                          <Select
                            value={variant.callToAction}
                            onValueChange={(value) => updateVariant(adSet.id, variant.id, { callToAction: value })}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CTA_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
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
              <div className="text-sm text-muted-foreground">Ad Sets</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{getTotalVariants()}</div>
              <div className="text-sm text-muted-foreground">Total Ad Variants</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {getTotalVariants() >= adSets.length * 2 ? '✓' : '⚠'}
              </div>
              <div className="text-sm text-muted-foreground">
                {getTotalVariants() >= adSets.length * 2 ? 'Ready to Launch' : 'Need More Variants'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};