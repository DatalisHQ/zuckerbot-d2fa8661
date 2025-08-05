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

interface AdVariant {
  id: string;
  headline: string;
  primaryText: string;
  callToAction: string;
  description?: string;
}

interface AdSet {
  id: string;
  name: string;
  audienceSegmentId: string;
}

interface AdVariantsProps {
  adSets: AdSet[];
  adVariants: Record<string, AdVariant[]>;
  onAdVariantsChange: (variants: Record<string, AdVariant[]>) => void;
  brandUrl?: string;
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
  brandUrl
}: AdVariantsProps) => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState<string | null>(null);

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

  const generateVariants = async (adSetId: string) => {
    setIsGenerating(adSetId);
    
    try {
      // Simulate AI generation - replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const generatedVariants: AdVariant[] = [
        {
          id: `${adSetId}_generated_1`,
          headline: 'Transform Your Business Today',
          primaryText: 'Discover how our innovative solution can help you achieve your goals faster than ever before.',
          callToAction: 'LEARN_MORE',
          description: 'Join thousands of satisfied customers'
        },
        {
          id: `${adSetId}_generated_2`,
          headline: 'Ready to Get Started?',
          primaryText: 'Take the first step towards success with our proven system that delivers real results.',
          callToAction: 'SIGN_UP',
          description: 'Free trial available'
        }
      ];

      const updatedVariants = {
        ...adVariants,
        [adSetId]: generatedVariants
      };

      onAdVariantsChange(updatedVariants);
      
      toast({
        title: "Variants generated!",
        description: "AI has created new ad variants based on your business info"
      });
    } catch (error) {
      toast({
        title: "Generation failed",
        description: "Could not generate variants. Please create them manually.",
        variant: "destructive"
      });
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
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generateVariants(adSet.id)}
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
                <div className="grid gap-6 md:grid-cols-2">
                  {variants.map((variant, index) => (
                    <Card key={variant.id} className="border-2">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Variant {index + 1}</Badge>
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