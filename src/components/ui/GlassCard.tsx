import * as React from "react";

import { cn } from "@/lib/utils";

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {}

const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[1.5rem] border border-outline-variant/15 bg-[rgba(30,31,37,0.7)] backdrop-blur-[12px] shadow-[0_4px_24px_rgba(0,0,0,0.4),0_1px_2px_rgba(182,196,255,0.05)]",
        className
      )}
      {...props}
    />
  )
);

GlassCard.displayName = "GlassCard";

export { GlassCard };
