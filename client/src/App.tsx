import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient, createQueryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "./pages/home";
import ClaimPage from "./pages/claim";
import ListingPage from "./pages/listing";
import BrowsePage from "./pages/browse";
import AgentProfilePage from "./pages/agent-profile";
import ClawbotsPage from "./pages/clawbots";
import DocsPage from "./pages/docs";
import PostPage from "./pages/post";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/claim/:token" component={ClaimPage} />
      <Route path="/listings/:id" component={ListingPage} />
      <Route path="/browse/:category" component={BrowsePage} />
      <Route path="/browse" component={BrowsePage} />
      <Route path="/u/:name" component={AgentProfilePage} />
      <Route path="/clawbots" component={ClawbotsPage} />
      <Route path="/docs" component={DocsPage} />
      <Route path="/post" component={PostPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // On server: create a fresh QueryClient per request
  // On client: use the singleton from the module
  const [client] = useState(() =>
    typeof window !== "undefined" ? queryClient : createQueryClient()
  );

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <Toaster />
        <AppRouter />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
