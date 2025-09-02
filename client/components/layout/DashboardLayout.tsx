import { Navigation } from "@/components/ui/navigation";
import { ReactNode } from "react";
import { Navigation as AppNavigation } from "@/components/ui/navigation";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-ui-background">
      <AppNavigation />
      <main className="carbon-grid py-8">{children}</main>
    </div>
  );
}
