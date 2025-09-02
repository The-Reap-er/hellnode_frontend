import { cn } from "@/lib/utils";
import {
  Shield,
  Container,
  Activity,
  Settings,
  AlertTriangle,
  CheckCircle,
  Server,
  Radar,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: Activity },
  { name: "Kubernetes", href: "/kubernetes", icon: Shield },
  { name: "Clusters", href: "/clusters", icon: Server },
  { name: "Docker Images", href: "/docker", icon: Container },
  { name: "Scanning", href: "/scanning", icon: Radar },
  { name: "Vulnerabilities", href: "/vulnerabilities", icon: AlertTriangle },
  { name: "Compliance", href: "/compliance", icon: CheckCircle },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Navigation() {
  const location = useLocation();

  return (
    <nav className="flex h-16 items-center justify-between bg-ui-background border-b border-ui-03 px-6">
      {/* Logo and brand */}
      <div className="flex items-center space-x-8">
        <Link to="/" className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-interactive-01">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <span className="carbon-type-productive-heading-03 text-text-01">
            SecureScan
          </span>
        </Link>

        {/* Main navigation */}
        <div className="hidden md:flex items-center space-x-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center space-x-2 px-3 py-2 rounded carbon-type-body-01 transition-colors duration-200",
                  isActive
                    ? "bg-ui-03 text-text-01"
                    : "text-text-02 hover:bg-ui-01 hover:text-text-01",
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* User actions */}
      <div className="flex items-center space-x-4">
        <ThemeToggle />
        <button className="flex h-8 w-8 items-center justify-center rounded bg-ui-01 text-text-02 hover:bg-ui-03 hover:text-text-01 transition-colors">
          <Settings className="h-4 w-4" />
        </button>
        <div className="h-8 w-8 rounded-full bg-interactive-01 flex items-center justify-center">
          <span className="carbon-type-label-01 text-white font-medium">U</span>
        </div>
      </div>
    </nav>
  );
}
