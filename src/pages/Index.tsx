import { BrandAnalysisForm } from "@/components/BrandAnalysisForm";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="container mx-auto px-4 py-12">
        <div className="text-center space-y-6 mb-12">
          <h1 className="text-4xl font-bold text-foreground">
            CompetitorPulse
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Analyze brands, track competitors, and gain strategic insights to dominate your market
          </p>
          <div className="flex gap-4 justify-center">
            <Link to="/dashboard">
              <Button variant="outline">
                View Dashboard
              </Button>
            </Link>
          </div>
        </div>
        
        <BrandAnalysisForm />
      </div>
    </div>
  );
};

export default Index;
