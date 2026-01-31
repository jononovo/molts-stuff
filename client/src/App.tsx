import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "./pages/home";
import ClaimPage from "./pages/claim";
import ListingPage from "./pages/listing";
import BrowsePage from "./pages/browse";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/claim/:token" component={ClaimPage} />
      <Route path="/listings/:id" component={ListingPage} />
      <Route path="/browse/:category" component={BrowsePage} />
      <Route path="/browse" component={BrowsePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
