"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ExternalLink,
  FileText,
  Home,
  List,
  Menu,
  Plus,
  Settings,
  X
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/new", label: "New Job", icon: Plus },
  { href: "/jobs", label: "Jobs", icon: List },
  { href: "/settings", label: "Settings", icon: Settings }
] as const;

const EXTERNAL_LINKS = [
  { href: "https://github.com/AshishPisey/Paper2Agent", label: "GitHub", icon: ExternalLink },
  { href: "https://github.com/AshishPisey/Paper2Agent#readme", label: "Docs", icon: FileText }
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-border/50 bg-card/80 px-4 backdrop-blur-sm lg:hidden">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Paper2Agent
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile slide-out nav */}
      <nav
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border/50 bg-card pt-14 transition-transform duration-200 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <NavContent pathname={pathname} isActive={isActive} onNavigate={() => setMobileOpen(false)} />
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-border/50 lg:bg-card/50">
        <div className="flex h-14 items-center gap-2 border-b border-border/50 px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground">
            P2A
          </div>
          <span className="text-sm font-semibold tracking-tight">Paper2Agent</span>
        </div>
        <NavContent pathname={pathname} isActive={isActive} />
        <div className="border-t border-border/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </aside>
    </>
  );
}

function NavContent({
  pathname,
  isActive,
  onNavigate
}: {
  pathname: string;
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col justify-between overflow-y-auto">
      <div className="space-y-1 p-3">
        <p className="mb-2 px-3 text-[10px] uppercase tracking-widest text-muted-foreground">
          Navigation
        </p>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive(item.href)
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        ))}
      </div>
      <div className="space-y-1 p-3">
        <p className="mb-2 px-3 text-[10px] uppercase tracking-widest text-muted-foreground">
          Resources
        </p>
        {EXTERNAL_LINKS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}
