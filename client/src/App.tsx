import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import IdeasPage from "./pages/IdeasPage";
import ProjectsPage from "./pages/ProjectsPage";
import DeadlinesPage from "./pages/DeadlinesPage";
import SettingsPage from "./pages/SettingsPage";
import PublicationsPage from "./pages/PublicationsPage";
import NotFound from "./pages/not-found";
import { ThemeProvider } from "./components/ThemeProvider";

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Router hook={useHashLocation}>
          <Layout>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/ideas" component={IdeasPage} />
              <Route path="/projects" component={ProjectsPage} />
              <Route path="/deadlines" component={DeadlinesPage} />
              <Route path="/publications" component={PublicationsPage} />
              <Route path="/settings" component={SettingsPage} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
