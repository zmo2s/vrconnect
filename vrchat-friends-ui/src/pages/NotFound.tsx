import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="login-page">
      <div className="text-center">
        <div className="brand-icon mx-auto mb-6"><Compass /></div>
        <p className="eyebrow">ERROR 404</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">This place doesn’t exist</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
          The page <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{location.pathname}</code> couldn’t be found. Your friends are still waiting on the dashboard.
        </p>
        <Button asChild className="mt-6"><Link to="/"><ArrowLeft /> Back to friends</Link></Button>
      </div>
    </main>
  );
};

export default NotFound;
