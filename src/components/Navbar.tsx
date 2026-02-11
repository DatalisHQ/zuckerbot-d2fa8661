import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, LayoutDashboard, Megaphone, Users, Settings, Menu, X, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useEnhancedAuth } from "@/utils/auth";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaign/new", label: "New Campaign", icon: Megaphone },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/profile", label: "Settings", icon: Settings },
];

export const Navbar = ({ isAdmin = false }: { isAdmin?: boolean }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useEnhancedAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = () => {
    setMobileOpen(false);
    logout(navigate, true);
  };

  const isActive = (href: string) => location.pathname === href;

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link to="/dashboard" className="font-bold text-lg flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-xs font-bold text-primary-foreground">Z</span>
            </div>
            ZuckerBot
            {isAdmin && (
              <Badge variant="outline" className="text-xs gap-1">
                <ShieldCheck className="h-3 w-3" />
                Admin
              </Badge>
            )}
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Button
                key={link.href}
                variant={isActive(link.href) ? "secondary" : "ghost"}
                size="sm"
                asChild
              >
                <Link to={link.href} className="gap-1.5">
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              </Button>
            ))}
            <div className="w-px h-6 bg-border mx-1" />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-1.5" />
              Sign Out
            </Button>
          </div>

          {/* Mobile Hamburger */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="md:hidden border-t py-3 space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive(link.href)
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
            <div className="border-t my-2" />
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted w-full"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};
