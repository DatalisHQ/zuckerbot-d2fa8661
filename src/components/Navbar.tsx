import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import { SlidingMenu } from "./SlidingMenu";
import { useEnhancedAuth } from "@/utils/auth";

export const Navbar = () => {
  const navigate = useNavigate();
  const { logout } = useEnhancedAuth();

  const handleSignOut = () => {
    logout(navigate, true);
  };


  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <SlidingMenu />
            <Link to="/dashboard" className="font-bold text-xl">
              ZuckerBot.ai
            </Link>
          </div>
          <div className="hidden md:flex items-center space-x-2">
            <Button variant="ghost" asChild>
              <Link to="/profile">
                <User className="h-4 w-4 mr-2" />
                Profile
              </Link>
            </Button>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};