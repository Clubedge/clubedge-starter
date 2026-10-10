import { Activity, ArrowUpRight, Blocks, Github, LayoutDashboard } from "lucide-react";
import Link from "next/link";

import { ClubedgeMark } from "@/components/branding/clubedge-mark";
import { siteConfig } from "@/config/site";
import type { AuthUser } from "@/lib/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@clubedge/ui/components/sidebar";

import { AccountButton } from "./account-button";

const navigation = [
  { href: "#overview", label: "Overview", icon: LayoutDashboard },
  { href: "#modules", label: "Modules", icon: Blocks },
  { href: "#activity", label: "Setup status", icon: Activity },
];

export function AppSidebar({ user }: { user: AuthUser | null }) {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-12"
              render={<Link href="#overview" aria-label={`${siteConfig.name} home`} />}
              size="lg"
              tooltip={siteConfig.name}
            >
              <ClubedgeMark alt="" className="size-8 shrink-0 rounded-lg" />
              <span className="grid min-w-0 text-start leading-tight">
                <span className="truncate font-semibold">{siteConfig.shortName}</span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  {siteConfig.workspaceLabel}
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarMenu>
            {navigation.map(({ href, label, icon: Icon }, index) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  render={<Link href={href} aria-current={index === 0 ? "page" : undefined} />}
                  isActive={index === 0}
                  tooltip={label}
                >
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href={siteConfig.links.repository} target="_blank" rel="noreferrer" />}
              tooltip="Starter repository"
            >
              <Github aria-hidden="true" />
              <span>Starter repository</span>
              <ArrowUpRight aria-hidden="true" className="ms-auto" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <AccountButton className="w-full" user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
