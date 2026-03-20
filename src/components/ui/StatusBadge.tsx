import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-2 rounded-full px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.22em]",
  {
    variants: {
      status: {
        active: "bg-tertiary-container/30 text-on-tertiary-container",
        paused: "bg-surface-container-high text-on-surface-variant",
        completed: "border border-outline-variant/30 bg-transparent text-on-surface",
        failed: "bg-error-container/70 text-on-error-container",
        live: "border border-primary/15 bg-primary/10 text-primary",
        ai: "border border-tertiary/15 bg-tertiary-container/15 text-tertiary",
      },
    },
    defaultVariants: {
      status: "active",
    },
  }
);

const dotVariants: Record<NonNullable<VariantProps<typeof statusBadgeVariants>["status"]>, string> = {
  active: "bg-tertiary",
  paused: "bg-outline",
  completed: "bg-primary",
  failed: "bg-error",
  live: "bg-primary",
  ai: "bg-tertiary",
};

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  showDot?: boolean;
}

function StatusBadge({
  className,
  status,
  showDot = true,
  children,
  ...props
}: StatusBadgeProps) {
  const resolvedStatus = status ?? "active";

  return (
    <span className={cn(statusBadgeVariants({ status: resolvedStatus }), className)} {...props}>
      {showDot ? <span className={cn("h-1.5 w-1.5 rounded-full", dotVariants[resolvedStatus])} /> : null}
      {children}
    </span>
  );
}

export { StatusBadge, statusBadgeVariants };
