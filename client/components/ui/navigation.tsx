import { cn } from "@/lib/utils";
import {
  Container,
  Activity,
  Settings as LucideSettings,
  AlertTriangle,
  CheckCircle,
  Server,
  Radar,
  Package,
  Search,
  ChevronDown,
} from "lucide-react";
import { Cloud } from "@carbon/icons-react";
import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const navigation: Array<any> = [
  { name: "Dashboard", href: "/", icon: Activity },
  {
    name: "Kubernetes",
    icon: Cloud,
    children: [
      { name: "Clusters", href: "/clusters", icon: Server },
      { name: "Kubeconfigs", href: "/kubernetes", icon: Cloud },
    ],
  },
  {
    name: "Docker",
    icon: Container,
    children: [
      { name: "Docker Images", href: "/docker", icon: Container },
      { name: "Cluster Images Scanning", href: "/scanning", icon: Radar },
      { name: "Image Scanning", href: "/image-scanning", icon: Package },
    ],
  },
  {
    name: "Security",
    icon: Radar,
    children: [
      { name: "Vulnerabilities", href: "/vulnerabilities", icon: AlertTriangle },
    ],
  },
  {
    name: "Cloud",
    icon: Cloud,
    children: [{ name: "Compliance", href: "/compliance", icon: CheckCircle }],
  },
  { name: "Settings", href: "/settings", icon: LucideSettings },
];

export function Navigation() {
  const location = useLocation();

  return (
    <nav className="flex h-16 items-center justify-between bg-ui-background border-b border-ui-03 px-6">
      {/* Logo and brand */}
      <div className="flex items-center space-x-8">
        <Link to="/" className="flex items-center space-x-3">
          <img
            src="https://cdn.builder.io/api/v1/image/assets%2F5c995ee535ba41c1a97538efc7d126fb%2F8295a42d5fe340d0b023be6260283662?format=webp&width=800"
            alt="hellnode logo"
            className="h-8 w-8 rounded object-cover"
          />
          <span className="carbon-type-productive-heading-03 text-text-01">hellnode</span>
        </Link>

        {/* Main navigation */}
        <div className="hidden md:flex items-center space-x-1">
          {navigation.map((item) => {
            // If item has children render a dropdown
            if (item.children) {
              const isActive = item.children.some(
                (c: any) => c.href === location.pathname,
              );

              return (
                <DropdownMenu key={item.name}>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center space-x-2 px-3 py-2 rounded carbon-type-body-01 transition-colors duration-200",
                        isActive
                          ? "bg-ui-03 text-text-01"
                          : "text-text-02 hover:bg-ui-01 hover:text-text-01",
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.name}</span>
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent sideOffset={6}>
                    {item.children.map((child: any) => (
                      <DropdownMenuItem asChild key={child.name}>
                        <Link
                          to={child.href}
                          className={cn(
                            "flex items-center space-x-2 px-3 py-2 rounded carbon-type-body-01 w-full",
                            location.pathname === child.href
                              ? "bg-ui-03 text-text-01"
                              : "text-text-02 hover:bg-ui-01 hover:text-text-01",
                          )}
                        >
                          <child.icon className="h-4 w-4" />
                          <span>{child.name}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }

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
        <div className="h-8 w-8 rounded-full bg-interactive-01 flex items-center justify-center">
          <span className="carbon-type-label-01 text-white font-medium">U</span>
        </div>
      </div>
    </nav>
  );
}
