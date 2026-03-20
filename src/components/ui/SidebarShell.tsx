import type { LucideIcon } from "lucide-react";
import { HelpCircle, LogOut } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import { GradientButton } from "@/components/ui/GradientButton";
import { StatusBadge } from "@/components/ui/StatusBadge";

type SidebarItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
};

type SidebarFooterItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
  external?: boolean;
};

export interface SidebarShellProps {
  items: SidebarItem[];
  footerItems?: SidebarFooterItem[];
  ctaHref?: string;
  ctaLabel?: string;
  className?: string;
  activeItem?: string;
  onItemClick?: (item: SidebarItem) => void;
}

function SidebarShellLink({
  item,
  isActive,
  onItemClick,
}: {
  item: SidebarItem;
  isActive: boolean;
  onItemClick?: (item: SidebarItem) => void;
}) {
  const Icon = item.icon;
  const className = cn(
    "relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface",
    isActive && "bg-surface-container-high text-on-surface"
  );
  const content = (
    <>
      {isActive ? <span className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-primary" /> : null}
      <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-outline")} />
      <span className="font-body font-medium">{item.label}</span>
    </>
  );

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        className={className}
        onClick={() => onItemClick?.(item)}
      >
        {content}
      </a>
    );
  }

  if (item.href.startsWith("#")) {
    return (
      <a href={item.href} className={className} onClick={() => onItemClick?.(item)}>
        {content}
      </a>
    );
  }

  return (
    <Link to={item.href} className={className} onClick={() => onItemClick?.(item)}>
      {content}
    </Link>
  );
}

function SidebarShellFooterLink({ item }: { item: SidebarFooterItem }) {
  const Icon = item.icon;
  const content = (
    <>
      {Icon ? <Icon className="h-4 w-4 text-outline" /> : null}
      <span className="font-body text-sm text-on-surface-variant transition-colors group-hover:text-on-surface">
        {item.label}
      </span>
    </>
  );

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        className="group flex items-center gap-3 rounded-2xl px-4 py-3 hover:bg-surface-container-high"
      >
        {content}
      </a>
    );
  }

  return (
    <Link to={item.href} className="group flex items-center gap-3 rounded-2xl px-4 py-3 hover:bg-surface-container-high">
      {content}
    </Link>
  );
}

function SidebarShell({
  items,
  footerItems = [
    { label: "Help", href: "/docs", icon: HelpCircle },
    { label: "Logout", href: "/auth", icon: LogOut },
  ],
  ctaHref = "/campaign/new",
  ctaLabel = "Create Campaign",
  className,
  activeItem,
  onItemClick,
}: SidebarShellProps) {
  const cta = ctaHref.startsWith("#") ? (
    <a href={ctaHref}>{ctaLabel}</a>
  ) : (
    <Link to={ctaHref}>{ctaLabel}</Link>
  );

  return (
    <aside
      className={cn(
        "flex h-full w-full max-w-[18rem] flex-col bg-surface-container-low px-4 py-6",
        className
      )}
    >
      <div className="space-y-4 px-2">
        <Link to="/" className="zuckerbot-brand text-2xl font-black tracking-tight text-primary">
          ZuckerBot
        </Link>
        <StatusBadge status="active">AI Automation Active</StatusBadge>
      </div>

      <nav className="mt-8 flex-1 space-y-2">
        {items.map((item) => (
          <SidebarShellLink
            key={item.id}
            item={item}
            isActive={item.id === activeItem}
            onItemClick={onItemClick}
          />
        ))}
      </nav>

      <div className="space-y-3 pt-6">
        <GradientButton asChild className="w-full justify-center" size="md">
          {cta}
        </GradientButton>

        <div className="space-y-1">
          {footerItems.map((item) => (
            <SidebarShellFooterLink key={`${item.label}-${item.href}`} item={item} />
          ))}
        </div>
      </div>
    </aside>
  );
}

export { SidebarShell };
