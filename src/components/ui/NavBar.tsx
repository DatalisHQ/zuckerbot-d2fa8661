import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import { GradientButton } from "@/components/ui/GradientButton";

type NavBarLink = {
  label: string;
  href: string;
  external?: boolean;
};

type NavBarAction = NavBarLink & {
  variant?: "primary" | "secondary" | "tertiary";
};

export interface NavBarProps {
  links?: NavBarLink[];
  primaryAction?: NavBarAction;
  secondaryAction?: NavBarAction;
  className?: string;
  brandHref?: string;
}

function NavItem({ item, className }: { item: NavBarLink; className?: string }) {
  if (item.external || item.href.startsWith("#")) {
    return (
      <a
        href={item.href}
        target={item.external ? "_blank" : undefined}
        rel={item.external ? "noreferrer" : undefined}
        className={className}
      >
        {item.label}
      </a>
    );
  }

  return (
    <Link to={item.href} className={className}>
      {item.label}
    </Link>
  );
}

function NavAction({ action }: { action: NavBarAction }) {
  const variant = action.variant ?? "primary";
  const button = (
    <GradientButton asChild size="sm" variant={variant}>
      {action.external ? (
        <a href={action.href} target="_blank" rel="noreferrer">
          {action.label}
        </a>
      ) : (
        <Link to={action.href}>{action.label}</Link>
      )}
    </GradientButton>
  );

  if (action.href.startsWith("#")) {
    return (
      <GradientButton asChild size="sm" variant={variant}>
        <a href={action.href}>{action.label}</a>
      </GradientButton>
    );
  }

  return button;
}

function NavBar({
  links = [],
  primaryAction,
  secondaryAction,
  className,
  brandHref = "/",
}: NavBarProps) {
  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b border-outline-variant/10 bg-background/80 backdrop-blur-md",
        className
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-8">
          <Link to={brandHref} className="zuckerbot-brand text-2xl font-black tracking-tight text-primary">
            ZuckerBot
          </Link>
          {links.length ? (
            <nav className="hidden items-center gap-6 md:flex">
              {links.map((link) => (
                <NavItem
                  key={`${link.label}-${link.href}`}
                  item={link}
                  className="font-label text-sm font-semibold text-on-surface-variant transition-colors hover:text-on-surface"
                />
              ))}
            </nav>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {secondaryAction ? <NavAction action={secondaryAction} /> : null}
          {primaryAction ? <NavAction action={primaryAction} /> : null}
        </div>
      </div>
    </header>
  );
}

export { NavBar };
