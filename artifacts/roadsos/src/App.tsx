import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/LandingPage";
import ChildWatchPage from "@/pages/ChildWatchPage";
import ParentDashboardPage from "@/pages/ParentDashboardPage";
import ResponderDashboardPage from "@/pages/ResponderDashboardPage";
import RouteSafetyPage from "@/pages/RouteSafetyPage";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/child-watch" component={ChildWatchPage} />
      <Route path="/parent" component={ParentDashboardPage} />
      <Route path="/responder" component={ResponderDashboardPage} />
      <Route path="/route-safety" component={RouteSafetyPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Ensure we apply dark class by default for the mission-control vibe
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
