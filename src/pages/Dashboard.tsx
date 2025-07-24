import { StrategicDashboard } from "@/components/StrategicDashboard";

const Dashboard = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        <StrategicDashboard />
      </div>
    </div>
  );
};

export default Dashboard;