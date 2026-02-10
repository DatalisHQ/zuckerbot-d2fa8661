import { useState } from "react";
import { LayoutDashboard, User, CreditCard, Settings, LogOut } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useEnhancedAuth } from "@/utils/auth";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const navigationItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Profile", url: "/profile", icon: User },
  { title: "Billing", url: "/billing", icon: CreditCard },
];

export function AppSidebar({ user }: { user: any }) {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useEnhancedAuth();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;
  const isExpanded = navigationItems.some((i) => isActive(i.url));

  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50";

  const handleSignOut = () => {
    logout(navigate, false); // Don't show toast in sidebar
  };

  return (
    <Sidebar className={state === "collapsed" ? "w-14" : "w-60"} collapsible="icon">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
            <span className="text-sm font-bold text-primary-foreground zuckerbot-brand">Z</span>
          </div>
          {state !== "collapsed" && (
            <span className="text-lg font-bold gradient-text zuckerbot-brand">ZuckerBot.ai</span>
          )}
        </div>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end className={getNavCls}>
                      <item.icon className="h-4 w-4" />
                      {state !== "collapsed" && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* User Section */}
        <div className="mt-auto p-4 border-t border-border/50">
          {state !== "collapsed" && (
            <div className="mb-3">
              <div className="text-sm font-medium truncate">{user?.email}</div>
              <div className="text-xs text-muted-foreground">Free Plan</div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Button
              variant="ghost"
              size={state === "collapsed" ? "icon" : "sm"}
              className="justify-start"
              asChild
            >
              <NavLink to="/settings">
                <Settings className="h-4 w-4" />
                {state !== "collapsed" && <span className="ml-2">Settings</span>}
              </NavLink>
            </Button>
            <Button
              variant="ghost"
              size={state === "collapsed" ? "icon" : "sm"}
              onClick={handleSignOut}
              className="justify-start text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              {state !== "collapsed" && <span className="ml-2">Sign Out</span>}
            </Button>
          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}