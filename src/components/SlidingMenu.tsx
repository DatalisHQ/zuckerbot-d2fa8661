import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  Sheet, 
  SheetContent, 
  SheetDescription, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from "@/components/ui/sheet";
import { 
  Menu, 
  LayoutDashboard, 
  Zap, 
  Building2, 
  Users, 
  CreditCard, 
  User,
  LogOut 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const SlidingMenu = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { toast } = useToast();

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setOpen(false);
      toast({
        title: "Signed out successfully",
        description: "You have been logged out of your account.",
      });
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: "Error signing out",
        description: "There was a problem signing you out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const navigationItems = [
    {
      title: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      description: "Campaign overview and performance"
    },
    {
      title: "Campaigns",
      href: "/zuckerbot",
      icon: Zap,
      description: "Create and manage ad campaigns"
    },
    {
      title: "Brand Analysis",
      href: "/dashboard?section=brand-analysis",
      icon: Building2,
      description: "Analyze your brand positioning"
    },
    {
      title: "Competitor Analysis",
      href: "/dashboard?section=competitor-analysis",
      icon: Users,
      description: "Monitor and analyze competitors"
    },
    {
      title: "Billing & Pricing",
      href: "/billing",
      icon: CreditCard,
      description: "Manage subscription and billing"
    },
    {
      title: "Account & Profile",
      href: "/profile",
      icon: User,
      description: "Update account settings and profile"
    }
  ];

  const isActive = (href: string) => {
    if (href.includes('?')) {
      const [path] = href.split('?');
      return location.pathname === path;
    }
    return location.pathname === href;
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80">
        <SheetHeader>
          <SheetTitle className="text-left">
            <Link 
              to="/dashboard" 
              className="flex items-center gap-2 font-bold text-xl"
              onClick={() => setOpen(false)}
            >
              <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
                <span className="text-sm font-bold text-primary-foreground">Z</span>
              </div>
              ZuckerBot.ai
            </Link>
          </SheetTitle>
          <SheetDescription className="text-left">
            AI-powered Facebook Ads Assistant
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 mt-8">
          <nav className="flex flex-col gap-2">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive(item.href)
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{item.description}</span>
                </div>
              </Link>
            ))}
          </nav>

          <div className="border-t pt-4 mt-4">
            <Button 
              variant="outline" 
              className="w-full justify-start gap-2" 
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};