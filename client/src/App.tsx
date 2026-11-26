import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Layout from "./components/Layout";
import TodayPage from "./pages/TodayPage";
import IdeasPage from "./pages/IdeasPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectPage from "./pages/ProjectPage";
import SchedulePage from "./pages/SchedulePage";
import SettingsPage from "./pages/SettingsPage";
import PublicationsPage from "./pages/PublicationsPage";
import NotFound from "./pages/not-found";
import { ThemeProvider } from "./components/ThemeProvider";
import { ConfirmProvider } from "./components/ConfirmProvider";

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
          <Router hook={useHashLocation}>
            <Layout>
              <Switch>
                <Route path="/" component={TodayPage} />
                <Route path="/ideas" component={IdeasPage} />
                <Route path="/projects" component={ProjectsPage} />
                <Route path="/projects/:id" component={ProjectPage} />
                <Route path="/schedule" component={SchedulePage} />
                <Route path="/deadlines"><Redirect to="/schedule" /></Route>
                <Route path="/publications" component={PublicationsPage} />
                <Route path="/settings" component={SettingsPage} />
                <Route component={NotFound} />
              </Switch>
            </Layout>
          </Router>
        </ConfirmProvider>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
