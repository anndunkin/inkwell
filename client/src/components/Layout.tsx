import { Link, useLocation } from "wouter";
import { Lightbulb, FolderOpen, Calendar, LayoutDashboard, Moon, Sun, PenLine } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import FileStatusBar from "./FileStatusBar";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/deadlines", label: "Deadlines", icon: Calendar },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col border-r border-border bg-sidebar">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-primary-foreground" stroke="currentColor" strokeWidth="1.8" aria-label="Inkwell logo">
                <path d="M12 3C8 3 4 6 4 10c0 2.5 1.5 4.5 3 6l1 5h8l1-5c1.5-1.5 3-3.5 3-6 0-4-4-7-8-7z" strokeLinejoin="round"/>
                <path d="M9 21h6" strokeLinecap="round"/>
                <path d="M12 10v5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="font-semibold text-sidebar-foreground text-sm leading-tight" style={{ fontFamily: "var(--font-display)" }}>Inkwell</div>
              <div className="text-xs text-muted-foreground">Writing Tracker</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location === href || (href !== "/" && location.startsWith(href));
            return (
              <Link key={href} href={href}>
                <a
                  data-testid={`nav-${label.toLowerCase()}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors cursor-pointer",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <div className="px-4 py-4 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            data-testid="button-theme-toggle"
            className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-screen overflow-auto flex flex-col">
        <FileStatusBar />
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
