import * as React from "react";

import { cn } from "@/lib/utils";

type MetricTone = "primary" | "tertiary" | "neutral" | "error";

const trendToneClasses: Record<MetricTone, string> = {
  primary: "bg-primary/10 text-primary",
  tertiary: "bg-tertiary-container/20 text-tertiary",
  neutral: "bg-surface-container-high text-on-surface-variant",
  error: "bg-error-container/30 text-error",
};

export interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  trend?: React.ReactNode;
  footer?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: MetricTone;
}

function MetricCard({
  className,
  label,
  value,
  trend,
  footer,
  icon,
  tone = "neutral",
  ...props
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-[1.5rem] bg-surface-container p-5 shadow-[0_8px_24px_rgba(0,0,0,0.22)]",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <p className="font-label text-[10px] font-semibold uppercase tracking-[0.24em] text-outline">
            {label}
          </p>
          <div className="font-headline text-3xl font-bold tracking-tight text-on-surface">{value}</div>
        </div>
        {icon ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-container-high text-on-surface-variant">
            {icon}
          </div>
        ) : null}
      </div>
      {trend ? (
        <div className={cn("mt-5 inline-flex rounded-full px-3 py-1 font-label text-[10px] font-semibold uppercase tracking-[0.16em]", trendToneClasses[tone])}>
          {trend}
        </div>
      ) : null}
      {footer ? <div className="mt-4 text-sm text-on-surface-variant">{footer}</div> : null}
    </div>
  );
}

export { MetricCard };
