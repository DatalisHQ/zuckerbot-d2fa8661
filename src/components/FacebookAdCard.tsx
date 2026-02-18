import { Card } from "@/components/ui/card";
import { ThumbsUp, MessageCircle, Share2 } from "lucide-react";

interface AdPreview {
  image_base64: string;
  headline: string;
  copy: string;
}

export default function FacebookAdCard({
  ad,
  businessName,
}: {
  ad: AdPreview;
  businessName: string;
}) {
  return (
    <Card className="overflow-hidden border-2 hover:shadow-lg transition-shadow">
      {/* Facebook post header */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
          {businessName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold">{businessName}</p>
          <p className="text-xs text-muted-foreground">
            Sponsored · 🌏
          </p>
        </div>
      </div>

      {/* Ad copy (primary text) */}
      <div className="px-4 pb-3">
        <p className="text-sm leading-relaxed">{ad.copy}</p>
      </div>

      {/* Ad image */}
      <div className="relative">
        <img
          src={`data:image/png;base64,${ad.image_base64}`}
          alt="AI-generated ad creative"
          className="w-full aspect-square object-cover"
        />
      </div>

      {/* Headline bar */}
      <div className="px-4 py-3 bg-muted/30 border-t">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {businessName.toLowerCase().replace(/\s+/g, "") + ".com"}
        </p>
        <p className="font-semibold text-sm mt-0.5">{ad.headline}</p>
      </div>

      {/* Facebook action bar */}
      <div className="px-4 py-2.5 border-t flex items-center justify-around text-muted-foreground">
        <button className="flex items-center gap-1.5 text-xs hover:text-foreground transition-colors">
          <ThumbsUp className="w-4 h-4" />
          Like
        </button>
        <button className="flex items-center gap-1.5 text-xs hover:text-foreground transition-colors">
          <MessageCircle className="w-4 h-4" />
          Comment
        </button>
        <button className="flex items-center gap-1.5 text-xs hover:text-foreground transition-colors">
          <Share2 className="w-4 h-4" />
          Share
        </button>
      </div>
    </Card>
  );
}
