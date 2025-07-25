import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from '@supabase/supabase-js';
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

interface ConversationLayoutProps {
  children: React.ReactNode;
}

export default function ConversationLayout({ children }: ConversationLayoutProps) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen w-full flex bg-background">
        <AppSidebar user={user} />
        
        <main className="flex-1 flex flex-col">
          <div className="h-16 border-b border-border/50 flex items-center px-6 gap-4">
            <SidebarTrigger />
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
                <span className="text-sm font-bold text-primary-foreground zuckerbot-brand">Z</span>
              </div>
              <div>
                <h1 className="text-lg font-bold gradient-text zuckerbot-brand">ZuckerBot.ai</h1>
                <p className="text-xs text-muted-foreground">AI Facebook Ads Assistant</p>
              </div>
            </div>
          </div>

          <div className="flex-1 p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}