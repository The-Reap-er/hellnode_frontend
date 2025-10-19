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
import DockerfileScanner from "./pages/DockerfileScanner";
import ManifestScanner from "./pages/ManifestScanner";
import ImageScanning from "./pages/ImageScanning";
import Scanning from "./pages/Scanning";
import Vulnerabilities from "./pages/Vulnerabilities";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import VulnerabilityDashboard from "./pages/VulnerabilityDashboard";
import ImageDashboard from "./pages/ImageDashboard";
import LayerAnalysis from "./pages/LayerAnalysis";
import Settings from "./pages/Settings";
import HardenedImagesRegistry from "./pages/HardenedImagesRegistry";
import GitLabIntegration from "./pages/GitLabIntegration";
import SecurityJobs from "./pages/SecurityJobs";

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
            <Route path="/docker/scan" element={<DockerfileScanner />} />
            <Route path="/kubernetes/manifest-scan" element={<ManifestScanner />} />
            <Route path="/scanning" element={<Scanning />} />
            <Route path="/image-scanning" element={<ImageScanning />} />
            <Route path="/vulnerabilities" element={<Vulnerabilities />} />
            <Route path="/dashboard" element={<VulnerabilityDashboard />} />
            <Route path="/dashboard/image/*" element={<ImageDashboard />} />
            <Route path="/security/layers" element={<LayerAnalysis />} />
            <Route path="/security/hardened-images" element={<HardenedImagesRegistry />} />
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
            <Route path="/integrations/gitlab" element={<GitLabIntegration />} />
            <Route path="/security/jobs" element={<SecurityJobs />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
