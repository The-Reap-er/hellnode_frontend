import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ScanResults from "./pages/ScanResults";
import KubeconfigManagement from "./pages/KubeconfigManagement";
import ClusterDetails from "./pages/ClusterDetails";
import DockerImages from "./pages/DockerImages";
import Scanning from "./pages/Scanning";
import Vulnerabilities from "./pages/Vulnerabilities";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import Settings from "./pages/Settings";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider
    attribute="class"
    defaultTheme="dark"
    enableSystem={false}
    disableTransitionOnChange
  >
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/scan/:scanId" element={<ScanResults />} />
            <Route path="/kubernetes" element={<KubeconfigManagement />} />
            <Route path="/clusters" element={<ClusterDetails />} />
            <Route path="/docker" element={<DockerImages />} />
            <Route path="/scanning" element={<Scanning />} />
            <Route path="/image-scanning" element={<ImageScanning />} />
            <Route path="/vulnerabilities" element={<Vulnerabilities />} />
            <Route
              path="/compliance"
              element={
                <PlaceholderPage
                  title="Compliance Dashboard"
                  description="Track compliance with security standards like CIS, PCI DSS, SOC 2, and custom policies across your container and Kubernetes environments."
                />
              }
            />
            <Route path="/settings" element={<Settings />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
