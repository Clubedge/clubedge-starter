"use client";

// The dashboard's layout, modelled on Fumadocs' "spacious" docs layout: a sidebar on the page
// background with a section switcher and a scrollable list, and the page in a rounded card beside
// it. On phones a slim top bar opens the same sidebar as a drawer from the right.
// apps/start/src/components/dashboard/dashboard-shell.tsx is the same component; keep them in sync.
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Blocks,
  Check,
  ChevronsUpDown,
  Ellipsis,
  Github,
  House,
  LayoutDashboard,
  Moon,
  PanelLeft,
  Sun,
  SunMoon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@clubedge/ui/lib/utils";
import { ClubedgeMark } from "@/components/branding/clubedge-mark";
import { siteConfig } from "@/config/site";
import { useTheme } from "@/app/theme-provider";
import { Sheet, SheetContent, SheetTitle } from "@clubedge/ui/components/sheet";
import "./dashboard-palette.css";

/** An area of the app, shown in the section switcher at the top of the sidebar. */
export type DashboardArea = {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  current?: boolean;
};

type DashboardShellProps = {
  areas: DashboardArea[];
  /** The account card, in the sidebar footer. */
  account: ReactNode;
  children: ReactNode;
};

const sections = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "modules", label: "Modules", icon: Blocks },
  { id: "activity", label: "Setup status", icon: Activity },
];

const resources = [
  { href: siteConfig.links.setupGuide, label: "Setup guide", icon: BookOpen },
  { href: siteConfig.links.repository, label: "Starter repository", icon: Github },
];

const iconLinks = [
  { href: "/", label: "Home", icon: House, external: false },
  {
    href: siteConfig.links.repository,
    label: "GitHub repository",
    icon: GitHubMark,
    external: true,
  },
];

/** Fumadocs' ghost icon-sm button: 30px, 18px icons. */
const iconButton =
  "inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4.5";

/** The GitHub mark (filled), as in the docs' top bar. */
function GitHubMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

const popupClass =
  "flex flex-col overflow-y-auto rounded-2xl border bg-popover text-sm text-popover-foreground shadow-lg outline-none";
const menuItemClass =
  "flex min-h-9 w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-start outline-none transition-colors duration-100 hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0";

const ease = "ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

function itemClass(active = false) {
  return cn(
    "relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0",
    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-accent-foreground",
  );
}

/** The section in view: the last one whose top has passed a third of the viewport. */
function useCurrentSection() {
  const [current, setCurrent] = useState(sections[0].id);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight / 3;
      let next = sections[0].id;
      for (const { id } of sections) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= line) next = id;
      }
      setCurrent(next);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    // The page scrolls inside its card on wide screens and the window on phones; capture both.
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    measure();
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return current;
}

/** A soft block glides to the item under the pointer or keyboard focus. */
function useGlide() {
  return useCallback((area: HTMLDivElement | null) => {
    const block = area?.firstElementChild;
    if (!area || !(block instanceof HTMLElement)) return;
    let current: Element | null = null;
    const show = (item: Element | null) => {
      if (item === current) return;
      block.style.transitionProperty = current ? "" : "opacity";
      current = item;
      if (!item) {
        block.style.opacity = "0";
        return;
      }
      const rect = item.getBoundingClientRect();
      const origin = area.getBoundingClientRect();
      block.style.translate = `${rect.left - origin.left}px ${rect.top - origin.top}px`;
      block.style.width = `${rect.width}px`;
      block.style.height = `${rect.height}px`;
      block.style.opacity = item.matches("[data-active=true]") ? "0" : "1";
    };
    const itemOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest("a[href]") : null;
    const controller = new AbortController();
    const { signal } = controller;
    area.addEventListener(
      "pointerover",
      (e) => {
        const item = itemOf(e.target);
        if (item && e.pointerType === "mouse") show(item);
      },
      { signal },
    );
    area.addEventListener("pointerleave", () => show(null), { signal });
    area.addEventListener(
      "focusin",
      (e) => {
        if (e.target instanceof Element && e.target.matches(":focus-visible"))
          show(itemOf(e.target));
      },
      { signal },
    );
    area.addEventListener("focusout", () => !area.matches(":hover") && show(null), { signal });
    return () => controller.abort();
  }, []);
}

function Title({ className }: { className?: string }) {
  return (
    <Link
      href="#overview"
      className={cn("inline-flex min-w-0 items-center gap-2.5 font-semibold", className)}
    >
      <ClubedgeMark alt="" className="size-6 shrink-0" />
      <span className="truncate">{siteConfig.shortName}</span>
    </Link>
  );
}

/** The section switcher: a bordered button that opens a menu of the app's areas. */
function AreaMenu({ areas }: { areas: DashboardArea[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = areas.find((area) => area.current) ?? areas[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!selected) return null;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-full items-center gap-3 rounded-xl border bg-secondary/50 ps-[calc(--spacing(2.5)-1px)] pe-2.5 text-start font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-accent [&_svg]:size-4 [&_svg]:shrink-0"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">{selected.icon}</span>
        <span className="flex-1 truncate">{selected.title}</span>
        <ChevronsUpDown className="size-3.5! text-muted-foreground" aria-hidden="true" />
      </button>
      <div
        id={menuId}
        role="menu"
        hidden={!open}
        onKeyDown={(e) => {
          const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]")];
          const index = items.indexOf(document.activeElement as HTMLElement);
          const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          items[(index + step + items.length) % items.length]?.focus();
        }}
        className="absolute inset-x-[-4px] top-full z-50 mt-2 flex flex-col rounded-2xl border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
      >
        {areas.map((area) => (
          <Link
            key={area.href}
            href={area.href}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-9 w-full items-start gap-3 rounded-lg px-[calc(--spacing(2.5)-1px)] py-2 text-start outline-none transition-colors duration-100 hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0"
          >
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
              {area.icon}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{area.title}</span>
              <span className="truncate text-xs text-muted-foreground">{area.description}</span>
            </span>
            {area === selected && <Check aria-hidden="true" className="mt-0.5 text-primary" />}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Light and dark, with a thumb that slides to the selected one. */
function ThemeSegments() {
  const { theme, setTheme } = useTheme();
  const themes = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
  ] as const;
  const index = themes.findIndex((t) => t.value === theme);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="relative flex rounded-full border bg-secondary p-0.5"
    >
      {index !== -1 && (
        <span
          aria-hidden="true"
          style={{ translate: `${index * 100}% 0` }}
          className={cn(
            "absolute start-0.5 top-0.5 size-7 rounded-full bg-background shadow-sm ring-1 ring-border transition-[translate] duration-300",
            ease,
          )}
        />
      )}
      {themes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          onClick={() => setTheme(value)}
          className={cn(
            "relative flex size-7 items-center justify-center rounded-full outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
            theme === value ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Icon aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/** The "..." menu: theme, plus the icon links on smaller screens. */
function OptionsMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Options"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={cn(iconButton, "aria-expanded:bg-accent aria-expanded:text-accent-foreground")}
      >
        <Ellipsis aria-hidden="true" />
      </button>
      <div
        id={menuId}
        hidden={!open}
        className={cn(popupClass, "absolute end-0 top-full z-50 mt-2 w-64 *:not-first:border-t")}
      >
        <div className="flex flex-col p-1">
          <div className="flex items-center gap-3 py-1 ps-2.5 pe-1">
            <SunMoon aria-hidden="true" className="size-4 text-muted-foreground" />
            <span aria-hidden="true" className="flex-1">
              Theme
            </span>
            <ThemeSegments />
          </div>
        </div>
        <div className="flex flex-col p-1 lg:hidden">
          {iconLinks.map(({ href, label, icon: Icon, external }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
              className={menuItemClass}
            >
              <Icon aria-hidden="true" />
              <span className="flex-1">{label}</span>
              {external && <ArrowUpRight aria-hidden="true" className="text-muted-foreground" />}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The scrollable list: in-page sections, then resources. */
function SidebarList({ onNavigate }: { onNavigate?: () => void }) {
  const current = useCurrentSection();
  const glide = useGlide();

  return (
    <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-4 pb-8 [scrollbar-width:thin] mask-t-from-[calc(100%-16px)] mask-b-from-[calc(100%-32px)]">
      <div ref={glide} className="relative flex flex-col">
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-0 left-0 rounded-lg bg-accent/60 bg-clip-content py-0.5 opacity-0 transition-opacity duration-200 motion-safe:transition-[translate,width,height,opacity]",
            ease,
          )}
        />
        <p className="mb-1.5 px-2.5 text-xs font-medium text-muted-foreground">Workspace</p>
        <nav aria-label="Dashboard sections" className="flex flex-col">
          {sections.map(({ id, label, icon: Icon }) => (
            <Link
              key={id}
              href={`#${id}`}
              onClick={onNavigate}
              data-active={current === id}
              aria-current={current === id ? "location" : undefined}
              className={itemClass(current === id)}
            >
              <Icon aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <p className="mt-6 mb-1.5 px-2.5 text-xs font-medium text-muted-foreground">Resources</p>
        {resources.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} target="_blank" rel="noreferrer" className={itemClass()}>
            <Icon aria-hidden="true" />
            <span className="flex-1">{label}</span>
            <ArrowUpRight aria-hidden="true" className="size-3.5! opacity-60" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function DashboardShell({ areas, account, children }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Remember the collapsed sidebar, and toggle it with Ctrl/Cmd+B like the docs and shadcn's sidebar.
  useEffect(() => {
    setCollapsed(localStorage.getItem("dashboard-sidebar") === "collapsed");
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCollapsed((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(
    () => localStorage.setItem("dashboard-sidebar", collapsed ? "collapsed" : "open"),
    [collapsed],
  );

  // The drawer is for phones. If the window grows to the desktop layout while it is open, close it:
  // its panel hides at md, but the Sheet's backdrop would otherwise stay over the page until a click.
  useEffect(() => {
    const desktop = matchMedia("(min-width: 48rem)");
    const close = () => desktop.matches && setDrawerOpen(false);
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);

  // The account card, at the bottom of the sidebar and the drawer. Empty without auth.
  const footer = <div className="flex flex-col gap-2 p-3 empty:hidden">{account}</div>;

  return (
    <div
      data-dashboard
      data-collapsed={collapsed}
      className={cn(
        "relative grid min-h-dvh grid-cols-[minmax(0,1fr)] bg-card transition-[grid-template-columns] duration-300 md:h-dvh md:grid-cols-[268px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:overflow-clip md:data-[collapsed=true]:grid-cols-[--spacing(2)_minmax(0,1fr)]",
        ease,
      )}
    >
      {/* Sidebar (wide screens) */}
      <aside
        data-dashboard-sidebar
        inert={collapsed}
        className="flex min-h-0 overflow-clip text-sm max-md:hidden"
      >
        <div
          className={cn(
            "flex w-[268px] shrink-0 flex-col transition-[opacity,translate] duration-300",
            ease,
            collapsed && "-translate-x-3 opacity-0",
          )}
        >
          <div className="my-2 flex h-14 items-center gap-2 ps-5.5 pe-3">
            <Title className="me-auto text-[0.9375rem]" />
            <button
              type="button"
              aria-label="Collapse sidebar"
              onClick={() => setCollapsed(true)}
              className={cn(iconButton, "size-8")}
            >
              <PanelLeft aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-col gap-2 px-3">
            <AreaMenu areas={areas} />
          </div>
          <SidebarList />
          {footer}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col">
        {/* Navbar (phones) */}
        <header className="sticky top-0 z-30 flex h-14 items-center bg-card ps-4 pe-2.5 md:hidden">
          <Title className="me-auto" />
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
            className={cn(iconButton, "p-2")}
          >
            <PanelLeft aria-hidden="true" />
          </button>
        </header>

        {/* The page, in a rounded card */}
        <main className="relative mx-2 mb-2 flex min-h-0 min-w-0 flex-1 flex-col bg-background max-md:rounded-2xl max-md:border md:my-2 md:ms-0 md:overflow-clip md:rounded-2xl md:border md:shadow-sm">
          {/* Top bar (wide screens), over the top of the card like the docs page's */}
          <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-14 items-center gap-1.5 bg-linear-to-b from-background from-50% to-transparent ps-6 pe-4 *:pointer-events-auto max-md:hidden">
            {collapsed && (
              <button
                type="button"
                aria-label="Expand sidebar"
                onClick={() => setCollapsed(false)}
                className={cn(iconButton, "-ms-2 size-8")}
              >
                <PanelLeft aria-hidden="true" />
              </button>
            )}
            <div className="ms-auto flex items-center gap-0.5 rounded-lg bg-background">
              {iconLinks.map(({ href, label, icon: Icon, external }) => (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  title={label}
                  {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                  className={cn(iconButton, "max-lg:hidden")}
                >
                  <Icon aria-hidden="true" />
                </Link>
              ))}
              <OptionsMenu />
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col [&_[id]]:scroll-mt-16 md:overflow-y-auto md:overscroll-y-contain md:pt-14 md:[scrollbar-gutter:stable] md:[scrollbar-width:thin]">
            {children}
          </div>
        </main>
      </div>

      {/* Drawer (phones): the same sidebar, from the right */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          data-dashboard
          data-dashboard-sidebar
          className={cn(
            "gap-0 bg-background p-0 text-[0.9375rem] data-[side=right]:w-[85%] data-[side=right]:sm:max-w-95 md:hidden",
          )}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center gap-1.5 ps-3.5 pe-2.5 text-muted-foreground">
            <div className="flex flex-1">
              {iconLinks.map(({ href, label, icon: Icon, external }) => (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  onClick={() => setDrawerOpen(false)}
                  {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                  className={cn(iconButton, "p-2")}
                >
                  <Icon aria-hidden="true" />
                </Link>
              ))}
            </div>
            <ThemeSegments />
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
              className={cn(iconButton, "p-2")}
            >
              <PanelLeft aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-col gap-2 px-3">
            <AreaMenu areas={areas} />
          </div>
          <SidebarList onNavigate={() => setDrawerOpen(false)} />
          {footer}
        </SheetContent>
      </Sheet>
    </div>
  );
}
