import { Activity, ArrowUpRight, Blocks, Github, LayoutDashboard } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@clubedge/ui/components/button";
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

const navigation = [
  { href: "#overview", label: "Overview", icon: LayoutDashboard },
  { href: "#modules", label: "Modules", icon: Blocks },
  { href: "#activity", label: "Setup status", icon: Activity },
];

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-12"
              render={<Link href="#overview" aria-label="Clubedge Starter home" />}
              size="lg"
              tooltip="Clubedge Starter"
            >
              <Image
                alt=""
                className="size-8 shrink-0 rounded-lg"
                height={512}
                src="/.well-known/logo.svg"
                unoptimized
                width={512}
              />
              <span className="grid min-w-0 text-start leading-tight">
                <span className="truncate font-semibold">Clubedge</span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  Starter workspace
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
              render={
                <Link
                  href="https://github.com/yassine-ahmed/clubedge-starter"
                  target="_blank"
                  rel="noreferrer"
                />
              }
              tooltip="Starter repository"
            >
              <Github aria-hidden="true" />
              <span>Starter repository</span>
              <ArrowUpRight aria-hidden="true" className="ms-auto" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Button className="w-full" render={<Link href="/login" />} size="sm" variant="outline">
          Sign in
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
