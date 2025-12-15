import { useEffect, useMemo, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  AlertTriangle,
  Shield,
  Activity,
  Loader2,
  FileCode,
  Package,
  Layers,
  GitBranch,
  GitCommit,
  Clock,
  Download,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Copy,
  AlertCircle,
  TrendingUp,
  BarChart3,
  PieChart,
  X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PieChart as RechartsPie,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";

const HELLNODE_URL =
  import.meta.env.VITE_HELLNODE_URL || "http://localhost:8080";
const API_BASE = `${HELLNODE_URL}/api/v2/security/ci`;

// Types based on the spec
interface CIScanSummary {
  total_vulnerabilities?: number;
  total_misconfigurations?: number;
  total_components?: number;
  critical_count?: number;
  high_count?: number;
  medium_count?: number;
  low_count?: number;
  unknown_count?: number;
}

interface CIScanResult {
  id: string;
  scan_type: "dockerfile" | "sca" | "sbom";
  pipeline_id: string;
  job_id: string;
  project_id: string;
  project_name: string;
  commit_sha: string;
  branch: string;
  status: "success" | "failed";
  results?: any;
  summary: CIScanSummary;
  error?: string;
  file_name?: string;
  files_scanned?: string[];
  created_at: string;
  duration?: string;
}

interface ScansResponse {
  success: boolean;
  scans?: CIScanResult[];
  scan?: CIScanResult;
  total?: number;
  limit?: number;
  offset?: number;
  message?: string;
}

// Severity colors
const SEVERITY_COLORS = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#2563eb",
  unknown: "#6b7280",
};

// Scan type colors
const SCAN_TYPE_COLORS = {
  dockerfile: "#3b82f6",
  sca: "#f97316",
  sbom: "#22c55e",
};

// Helper functions
function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function truncateSHA(sha: string): string {
  return sha?.slice(0, 7) || "";
}

function copyToClipboard(text: string, toast: any) {
  navigator.clipboard.writeText(text);
  toast({ title: "Copied!", description: text });
}

// Helper function to check if a scan contains the search query in its results
function scanContainsQuery(scan: CIScanResult, query: string): boolean {
  const lowerQuery = query.toLowerCase();

  // Check metadata (existing search logic)
  if (
    scan.id.toLowerCase().includes(lowerQuery) ||
    scan.pipeline_id.toLowerCase().includes(lowerQuery) ||
    scan.project_id.toLowerCase().includes(lowerQuery) ||
    scan.project_name?.toLowerCase().includes(lowerQuery) ||
    scan.commit_sha?.toLowerCase().includes(lowerQuery) ||
    scan.branch?.toLowerCase().includes(lowerQuery)
  ) {
    return true;
  }

  // Check file_name and files_scanned
  if (scan.file_name?.toLowerCase().includes(lowerQuery)) {
    return true;
  }

  if (scan.files_scanned?.some((file) => file.toLowerCase().includes(lowerQuery))) {
    return true;
  }

  // If no results data, return false
  if (!scan.results) {
    return false;
  }

  // Search based on scan type
  if (scan.scan_type === "sbom") {
    // Search in SBOM components/artifacts/packages
    const components =
      scan.results?.components ||
      scan.results?.artifacts ||
      scan.results?.packages ||
      [];

    return components.some((comp: any) => {
      const name = (comp.name || comp.Name || "").toLowerCase();
      const version = (comp.version || comp.Version || "").toLowerCase();
      const type = (comp.type || comp.Type || "").toLowerCase();
      const purl = (comp.purl || comp.PURL || "").toLowerCase();

      return (
        name.includes(lowerQuery) ||
        version.includes(lowerQuery) ||
        type.includes(lowerQuery) ||
        purl.includes(lowerQuery)
      );
    });
  } else if (scan.scan_type === "sca") {
    // Search in SCA vulnerabilities/matches
    const matches =
      scan.results?.matches || scan.results?.vulnerabilities || [];

    return matches.some((match: any) => {
      // Package name variations
      const pkgName =
        match.artifact?.name ||
        match.PkgName ||
        match.package ||
        match.pkg_name ||
        "";
      const pkgVersion =
        match.artifact?.version ||
        match.InstalledVersion ||
        match.version ||
        "";
      // CVE/GHSA ID variations
      const vulnId =
        match.vulnerability?.id ||
        match.VulnerabilityID ||
        match.cve_id ||
        match.cve ||
        match.id ||
        "";
      // Description
      const description =
        match.vulnerability?.description ||
        match.Description ||
        match.description ||
        "";

      return (
        pkgName.toLowerCase().includes(lowerQuery) ||
        pkgVersion.toLowerCase().includes(lowerQuery) ||
        vulnId.toLowerCase().includes(lowerQuery) ||
        description.toLowerCase().includes(lowerQuery)
      );
    });
  } else if (scan.scan_type === "dockerfile") {
    // Search in Dockerfile misconfigurations
    const misconfigs =
      scan.results?.Results?.[0]?.Misconfigurations ||
      scan.results?.misconfigurations ||
      [];

    return misconfigs.some((misconfig: any) => {
      const id = (misconfig.ID || misconfig.id || "").toLowerCase();
      const title = (misconfig.Title || misconfig.title || "").toLowerCase();
      const description =
        (misconfig.Description || misconfig.description || "").toLowerCase();
      const severity =
        (misconfig.Severity || misconfig.severity || "").toLowerCase();

      return (
        id.includes(lowerQuery) ||
        title.includes(lowerQuery) ||
        description.includes(lowerQuery) ||
        severity.includes(lowerQuery)
      );
    });
  }

  return false;
}

export default function CiScanDashboardPage() {
  const { toast } = useToast();

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [scanType, setScanType] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState("");

  // Data state
  const [scans, setScans] = useState<CIScanResult[]>([]);
  const [selectedScan, setSelectedScan] = useState<CIScanResult | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [loadingScans, setLoadingScans] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalScans, setTotalScans] = useState(0);
  const [expandedJson, setExpandedJson] = useState(false);
  const pageSize = 50;

  // Modal search and pagination state
  const [modalSearchQuery, setModalSearchQuery] = useState("");
  const [componentsPage, setComponentsPage] = useState(0);
  const [vulnerabilitiesPage, setVulnerabilitiesPage] = useState(0);
  const [misconfigurationsPage, setMisconfigurationsPage] = useState(0);
  const [loadingScanDetails, setLoadingScanDetails] = useState(false);
  const modalPageSize = 50;

  // Fetch scans
  const fetchScans = useCallback(
    async (showToast = false) => {
    try {
      setLoadingScans(true);

      const params = new URLSearchParams();
      if (pipelineId) params.set("pipeline_id", pipelineId);
        if (projectId) params.set("project_id", projectId);
      if (scanType !== "all") params.set("scan_type", scanType);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (branchFilter) params.set("branch", branchFilter);
        params.set("limit", pageSize.toString());
        params.set("offset", (currentPage * pageSize).toString());

        const res = await fetch(`${API_BASE}/scans?${params.toString()}`);

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data: ScansResponse = await res.json();
        const list = data.scans || (data.scan ? [data.scan] : []);

      setScans(list);
        setTotalScans(data.total || list.length);

      if (showToast) {
        toast({
          title: "Scans loaded",
            description: `Fetched ${list.length} scan(s)`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Failed to load scans",
        description: error?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoadingScans(false);
    }
    },
    [pipelineId, projectId, scanType, statusFilter, branchFilter, currentPage, toast]
  );

  // Initial load
  useEffect(() => {
    fetchScans();
  }, []);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchScans(), 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchScans]);

  // Filter scans by search query (includes metadata and scan results)
  const filteredScans = useMemo(() => {
    if (!searchQuery) return scans;
    return scans.filter((scan) => scanContainsQuery(scan, searchQuery));
  }, [scans, searchQuery]);

  // Compute statistics
  const stats = useMemo(() => {
    const byType = {
      dockerfile: scans.filter((s) => s.scan_type === "dockerfile").length,
      sca: scans.filter((s) => s.scan_type === "sca").length,
      sbom: scans.filter((s) => s.scan_type === "sbom").length,
    };

    const byStatus = {
      success: scans.filter((s) => s.status === "success").length,
      failed: scans.filter((s) => s.status === "failed").length,
    };

    const severityCounts = scans.reduce(
      (acc, scan) => {
        acc.critical += scan.summary?.critical_count || 0;
        acc.high += scan.summary?.high_count || 0;
        acc.medium += scan.summary?.medium_count || 0;
        acc.low += scan.summary?.low_count || 0;
        return acc;
      },
      { critical: 0, high: 0, medium: 0, low: 0 }
    );

    const totalVulnerabilities =
      severityCounts.critical +
      severityCounts.high +
      severityCounts.medium +
      severityCounts.low;

    return {
      total: scans.length,
      byType,
      byStatus,
      severityCounts,
      totalVulnerabilities,
    };
  }, [scans]);

  // Chart data
  const severityChartData = [
    { name: "Critical", value: stats.severityCounts.critical, fill: SEVERITY_COLORS.critical },
    { name: "High", value: stats.severityCounts.high, fill: SEVERITY_COLORS.high },
    { name: "Medium", value: stats.severityCounts.medium, fill: SEVERITY_COLORS.medium },
    { name: "Low", value: stats.severityCounts.low, fill: SEVERITY_COLORS.low },
  ];

  const scanTypeChartData = [
    { name: "Dockerfile", value: stats.byType.dockerfile, fill: SCAN_TYPE_COLORS.dockerfile },
    { name: "SCA", value: stats.byType.sca, fill: SCAN_TYPE_COLORS.sca },
    { name: "SBOM", value: stats.byType.sbom, fill: SCAN_TYPE_COLORS.sbom },
  ];

  // Badge components
  const ScanTypeBadge = ({ type }: { type: string }) => {
    const config: Record<string, { label: string; className: string; icon: any }> = {
      dockerfile: {
        label: "Dockerfile",
        className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
        icon: FileCode,
      },
      sca: {
        label: "SCA",
        className: "bg-orange-500/20 text-orange-400 border-orange-500/30",
        icon: Package,
      },
      sbom: {
        label: "SBOM",
        className: "bg-green-500/20 text-green-400 border-green-500/30",
        icon: Layers,
      },
    };
    const { label, className, icon: Icon } = config[type] || config.dockerfile;
    return (
      <Badge variant="outline" className={`${className} gap-1`}>
        <Icon className="h-3 w-3" />
        {label}
      </Badge>
    );
  };

  const StatusBadge = ({ status, error }: { status: string; error?: string }) => {
    if (status === "success") {
  return (
        <Badge className="bg-green-500/20 text-green-400 border border-green-500/30 gap-1">
          <CheckCircle className="h-3 w-3" />
          Success
        </Badge>
      );
    }
    return (
      <Badge
        className="bg-red-500/20 text-red-400 border border-red-500/30 gap-1 cursor-help"
        title={error}
      >
        <XCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  };

  const SeverityBadge = ({ severity }: { severity: string }) => {
    const colors: Record<string, string> = {
      critical: "bg-red-500/20 text-red-400 border-red-500/30",
      high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      unknown: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    };
    return (
      <Badge variant="outline" className={colors[severity.toLowerCase()] || colors.unknown}>
        {severity}
      </Badge>
    );
  };

  // Stat card component
  const StatCard = ({
    title,
    value,
    icon: Icon,
    color,
    subtitle,
  }: {
    title: string;
    value: number | string;
    icon: any;
    color: string;
    subtitle?: string;
  }) => (
    <Card className="bg-ui-01 border-ui-03 hover:border-ui-04 transition-colors">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
                  <div>
            <p className="text-sm text-text-03">{title}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {subtitle && <p className="text-xs text-text-03 mt-1">{subtitle}</p>}
          </div>
          <div className={`p-3 rounded-lg bg-ui-02`}>
            <Icon className={`h-6 w-6 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // View scan details
  const handleViewScan = async (scan: CIScanResult) => {
    try {
      console.log("Opening scan:", scan?.id, scan?.scan_type);
      // Validate scan before opening
      if (!scan || !scan.id) {
        toast({
          title: "Invalid scan",
          description: "Cannot open scan: missing scan data",
          variant: "destructive",
        });
        return;
      }

      // Set initial scan data first
      setSelectedScan(scan);
      setIsDetailOpen(true);
      setExpandedJson(false);
      setLoadingScanDetails(true);
      // Reset modal search and pagination
      setModalSearchQuery("");
      setComponentsPage(0);
      setVulnerabilitiesPage(0);
      setMisconfigurationsPage(0);

      // Optionally fetch full scan details with timeout and size check
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        try {
          const res = await fetch(`${API_BASE}/scans/${scan.id}`, {
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }

          // Check content length if available
          const contentLength = res.headers.get("content-length");
          if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
            // 10MB limit
            toast({
              title: "Response too large",
              description: "Scan data is very large. Showing cached data.",
              variant: "default",
            });
            setLoadingScanDetails(false);
            return;
          }

          const data = await res.json();
          console.log("Fetched scan details:", data?.scan?.id, "Results size:", JSON.stringify(data?.scan?.results || {}).length);
          if (data.scan) {
            // Validate the scan data structure
            if (data.scan.results && typeof data.scan.results === "object") {
              // Check if results is too large (safety check)
              const resultsSize = JSON.stringify(data.scan.results).length;
              if (resultsSize > 5 * 1024 * 1024) {
                // 5MB limit
                console.warn("Results too large, using existing scan data");
                toast({
                  title: "Large dataset",
                  description: "Scan results are very large. Showing available data.",
                  variant: "default",
                });
              } else {
                setSelectedScan(data.scan);
              }
            } else {
              // Keep existing scan if new one is invalid
              console.warn("Invalid scan data structure, using existing scan");
            }
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === "AbortError") {
            toast({
              title: "Request timeout",
              description: "Taking too long to load. Showing available data.",
              variant: "default",
            });
          } else {
            console.error("Error fetching scan details:", fetchError);
            // Continue with existing scan data
          }
        } finally {
          setLoadingScanDetails(false);
        }
      } catch (e) {
        // Use existing scan data
        console.error("Error in fetch:", e);
        setLoadingScanDetails(false);
      }
    } catch (error: any) {
      console.error("Error opening scan:", error);
      setLoadingScanDetails(false);
      toast({
        title: "Error opening scan",
        description: error?.message || "Failed to load scan details",
        variant: "destructive",
      });
      // Close modal on error
      setIsDetailOpen(false);
    }
  };

  // Download scan as JSON
  const downloadScan = (scan: CIScanResult) => {
    const blob = new Blob([JSON.stringify(scan, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan-${scan.id}-${scan.scan_type}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render misconfigurations for Dockerfile scans
  const renderMisconfigurations = (scan: CIScanResult) => {
    try {
      if (!scan?.results) {
  return (
          <div className="text-center py-8 text-text-03">
            <AlertCircle className="h-12 w-12 mx-auto mb-2 text-text-03" />
            <p>No scan results available</p>
          </div>
        );
      }

      const misconfigs =
        scan.results?.Results?.[0]?.Misconfigurations || scan.results?.misconfigurations || [];

      if (!Array.isArray(misconfigs)) {
        return (
          <div className="text-center py-8 text-text-03">
            <AlertCircle className="h-12 w-12 mx-auto mb-2 text-text-03" />
            <p>Invalid misconfigurations data</p>
          </div>
        );
      }

      // Filter by search query
      const filtered = modalSearchQuery
        ? misconfigs.filter((misconfig: any) => {
            const query = modalSearchQuery.toLowerCase();
            const id = (misconfig.ID || misconfig.id || "").toLowerCase();
            const title = (misconfig.Title || misconfig.title || "").toLowerCase();
            const description = (misconfig.Description || misconfig.description || "").toLowerCase();
            return id.includes(query) || title.includes(query) || description.includes(query);
          })
        : misconfigs;

      if (filtered.length === 0) {
        return (
          <div className="text-center py-8 text-text-03">
            <Search className="h-12 w-12 mx-auto mb-2 text-text-03" />
            <p>{modalSearchQuery ? "No misconfigurations match your search" : "No misconfigurations found"}</p>
          </div>
        );
      }

      // Pagination
      const startIdx = misconfigurationsPage * modalPageSize;
      const endIdx = startIdx + modalPageSize;
      const paginated = filtered.slice(startIdx, endIdx);
      const totalPages = Math.ceil(filtered.length / modalPageSize);

      return (
        <div className="space-y-4">
          {paginated.map((misconfig: any, idx: number) => (
          <Card key={idx} className="bg-ui-02 border-ui-03">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <SeverityBadge severity={misconfig.Severity || misconfig.severity || "UNKNOWN"} />
                    <span className="font-mono text-sm text-text-02">
                      {misconfig.ID || misconfig.id}
                    </span>
                  </div>
                  <p className="text-sm text-text-01 font-medium mb-1">
                    {misconfig.Title || misconfig.title}
                  </p>
                  <p className="text-xs text-text-03 mb-2">
                    {misconfig.Description || misconfig.description}
                  </p>
                  {(misconfig.Resolution || misconfig.resolution) && (
                    <div className="mt-2 p-2 bg-ui-01 rounded text-xs">
                      <span className="font-medium text-green-400">Fix: </span>
                      <span className="text-text-02">
                        {misconfig.Resolution || misconfig.resolution}
                      </span>
                    </div>
                  )}
                  </div>
                {(misconfig.PrimaryURL || misconfig.primary_url) && (
                  <a
                    href={misconfig.PrimaryURL || misconfig.primary_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-interactive-01 hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                </div>
            </CardContent>
          </Card>
        ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-ui-03">
              <span className="text-sm text-text-03">
                Showing {startIdx + 1}-{Math.min(endIdx, filtered.length)} of {filtered.length} misconfigurations
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMisconfigurationsPage((p) => Math.max(0, p - 1))}
                  disabled={misconfigurationsPage === 0}
                >
                  Previous
                </Button>
                <span className="text-sm text-text-02">
                  Page {misconfigurationsPage + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMisconfigurationsPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={misconfigurationsPage >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      );
    } catch (error) {
      return (
        <div className="text-center py-8 text-text-03">
          <XCircle className="h-12 w-12 mx-auto mb-2 text-red-500" />
          <p>Error loading misconfigurations</p>
        </div>
      );
    }
  };

  // Render vulnerabilities for SCA scans
  const renderVulnerabilities = (scan: CIScanResult) => {
    try {
      if (!scan?.results) {
        return (
          <div className="text-center py-8 text-text-03">
            <AlertCircle className="h-12 w-12 mx-auto mb-2 text-text-03" />
            <p>No scan results available</p>
          </div>
        );
      }

      const vulns = scan.results?.matches || scan.results?.vulnerabilities || [];

      if (!Array.isArray(vulns)) {
        return (
          <div className="text-center py-8 text-text-03">
            <AlertCircle className="h-12 w-12 mx-auto mb-2 text-text-03" />
            <p>Invalid vulnerabilities data</p>
          </div>
        );
      }

      // Filter by search query
      const filtered = modalSearchQuery
        ? vulns.filter((vuln: any) => {
            const query = modalSearchQuery.toLowerCase();
            const pkgName = (
              vuln.artifact?.name ||
              vuln.PkgName ||
              vuln.package ||
              vuln.pkg_name ||
              ""
            ).toLowerCase();
            const vulnId = (
              vuln.vulnerability?.id ||
              vuln.VulnerabilityID ||
              vuln.cve_id ||
              vuln.cve ||
              vuln.id ||
              ""
            ).toLowerCase();
            const description = (
              vuln.vulnerability?.description ||
              vuln.Description ||
              vuln.description ||
              ""
            ).toLowerCase();
            return pkgName.includes(query) || vulnId.includes(query) || description.includes(query);
          })
        : vulns;

      if (filtered.length === 0) {
        return (
          <div className="text-center py-8 text-text-03">
            <Search className="h-12 w-12 mx-auto mb-2 text-text-03" />
            <p>{modalSearchQuery ? "No vulnerabilities match your search" : "No vulnerabilities found"}</p>
          </div>
        );
      }

      // Pagination
      const startIdx = vulnerabilitiesPage * modalPageSize;
      const endIdx = startIdx + modalPageSize;
      const paginated = filtered.slice(startIdx, endIdx);
      const totalPages = Math.ceil(filtered.length / modalPageSize);

      return (
        <div className="space-y-4">
          {paginated.map((vuln: any, idx: number) => (
          <Card key={idx} className="bg-ui-02 border-ui-03">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <SeverityBadge
                      severity={
                        vuln.vulnerability?.severity || vuln.Severity || vuln.severity || "UNKNOWN"
                      }
                    />
                    <span className="font-mono text-sm text-blue-400 hover:underline cursor-pointer">
                      {vuln.vulnerability?.id || vuln.VulnerabilityID || vuln.cve_id}
                    </span>
                    {(vuln.vulnerability?.cvss?.nvd?.V3Score || vuln.cvss_score) && (
                      <Badge variant="outline" className="text-xs">
                        CVSS: {vuln.vulnerability?.cvss?.nvd?.V3Score || vuln.cvss_score}
                      </Badge>
                    )}
              </div>
                  <p className="text-sm text-text-01 font-medium mb-1">
                    {vuln.artifact?.name || vuln.PkgName || vuln.package}
                    <span className="text-text-03 font-normal ml-2">
                      {vuln.artifact?.version || vuln.InstalledVersion || vuln.version}
                    </span>
                  </p>
                  <p className="text-xs text-text-03 line-clamp-2">
                    {vuln.vulnerability?.description || vuln.Description || vuln.description}
                  </p>
                  {(vuln.vulnerability?.fix?.versions || vuln.FixedVersion) && (
                    <div className="mt-2 text-xs">
                      <span className="text-green-400">Fixed in: </span>
                      <span className="font-mono text-text-02">
                        {vuln.vulnerability?.fix?.versions?.[0] || vuln.FixedVersion}
                      </span>
                    </div>
                  )}
                  </div>
                </div>
            </CardContent>
          </Card>
        ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-ui-03">
              <span className="text-sm text-text-03">
                Showing {startIdx + 1}-{Math.min(endIdx, filtered.length)} of {filtered.length} vulnerabilities
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVulnerabilitiesPage((p) => Math.max(0, p - 1))}
                  disabled={vulnerabilitiesPage === 0}
                >
                  Previous
                </Button>
                <span className="text-sm text-text-02">
                  Page {vulnerabilitiesPage + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVulnerabilitiesPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={vulnerabilitiesPage >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      );
    } catch (error) {
      return (
        <div className="text-center py-8 text-text-03">
          <XCircle className="h-12 w-12 mx-auto mb-2 text-red-500" />
          <p>Error loading vulnerabilities</p>
        </div>
      );
    }
  };

  // Helper function to safely extract license string from various formats
  const getLicenseString = (licenseData: any): string => {
    if (!licenseData) return "—";
    if (typeof licenseData === "string") return licenseData;
    if (typeof licenseData === "object") {
      // Handle various license object formats
      if (licenseData.expression) return String(licenseData.expression);
      if (licenseData.name) return String(licenseData.name);
      if (licenseData.license) {
        if (typeof licenseData.license === "string") return licenseData.license;
        if (typeof licenseData.license === "object" && licenseData.license.name) {
          return String(licenseData.license.name);
        }
      }
      if (licenseData.id) return String(licenseData.id);
      // If it's an object but we can't extract a string, return a safe string
      try {
        const str = JSON.stringify(licenseData);
        // Limit length to prevent UI issues
        return str.length > 100 ? str.substring(0, 100) + "..." : str;
      } catch {
        return "—";
      }
    }
    return String(licenseData);
  };

  // Render components for SBOM scans
  const renderComponents = (scan: CIScanResult) => {
    try {
      if (!scan?.results) {
        return (
          <div className="text-center py-8 text-text-03">
            <AlertCircle className="h-12 w-12 mx-auto mb-2 text-text-03" />
            <p>No scan results available</p>
          </div>
        );
      }

      // Safely extract components with size limit check
      let components: any[] = [];
      try {
        const rawComponents =
          scan.results?.components || scan.results?.artifacts || scan.results?.packages || [];

        if (Array.isArray(rawComponents)) {
          // Limit to prevent memory issues - show first 10000 components max
          components = rawComponents.slice(0, 10000);
          if (rawComponents.length > 10000) {
            toast({
              title: "Large dataset",
              description: `Showing first 10,000 of ${rawComponents.length} components`,
              variant: "default",
            });
          }
        } else {
          return (
            <div className="text-center py-8 text-text-03">
              <AlertCircle className="h-12 w-12 mx-auto mb-2 text-text-03" />
              <p>Invalid components data structure</p>
            </div>
          );
        }
      } catch (extractError) {
        console.error("Error extracting components:", extractError);
        return (
          <div className="text-center py-8 text-text-03">
            <XCircle className="h-12 w-12 mx-auto mb-2 text-red-500" />
            <p>Error parsing components data</p>
          </div>
        );
      }

      // Filter by search query
      const filtered = modalSearchQuery
        ? components.filter((comp: any) => {
            const query = modalSearchQuery.toLowerCase();
            const name = (comp.name || comp.Name || "").toLowerCase();
            const version = (comp.version || comp.Version || "").toLowerCase();
            const type = (comp.type || comp.Type || "").toLowerCase();
            // Safely extract license string for search
            const licenseStr = getLicenseString(comp.licenses?.[0] || comp.license || "");
            return name.includes(query) || version.includes(query) || type.includes(query) || licenseStr.toLowerCase().includes(query);
          })
        : components;

      if (filtered.length === 0) {
        return (
          <div className="text-center py-8 text-text-03">
            <Search className="h-12 w-12 mx-auto mb-2 text-text-03" />
            <p>{modalSearchQuery ? "No components match your search" : "No components found"}</p>
          </div>
        );
      }

      // Pagination
      const startIdx = componentsPage * modalPageSize;
      const endIdx = startIdx + modalPageSize;
      const paginated = filtered.slice(startIdx, endIdx);
      const totalPages = Math.ceil(filtered.length / modalPageSize);

      return (
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow className="border-ui-03">
                <TableHead className="text-text-02">Package</TableHead>
                <TableHead className="text-text-02">Version</TableHead>
                <TableHead className="text-text-02">Type</TableHead>
                <TableHead className="text-text-02">License</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((comp: any, idx: number) => (
                <TableRow key={startIdx + idx} className="border-ui-03 hover:bg-ui-02">
                  <TableCell className="font-mono text-sm">{comp.name || comp.Name || "—"}</TableCell>
                  <TableCell className="text-text-02">{comp.version || comp.Version || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {comp.type || comp.Type || "unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-text-03 text-xs">
                    {getLicenseString(comp.licenses?.[0] || comp.license)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-ui-03">
              <span className="text-sm text-text-03">
                Showing {startIdx + 1}-{Math.min(endIdx, filtered.length)} of {filtered.length} components
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setComponentsPage((p) => Math.max(0, p - 1))}
                  disabled={componentsPage === 0}
                >
                  Previous
                </Button>
                <span className="text-sm text-text-02">
                  Page {componentsPage + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setComponentsPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={componentsPage >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      );
    } catch (error) {
      return (
        <div className="text-center py-8 text-text-03">
          <XCircle className="h-12 w-12 mx-auto mb-2 text-red-500" />
          <p>Error loading components</p>
        </div>
      );
    }
  };

  return (
    <DashboardLayout>
      <div className="col-span-full space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="carbon-type-productive-heading-04 text-text-01 mb-1">
              CI Security Scan Dashboard
            </h1>
            <p className="carbon-type-body-02 text-text-02">
              Monitor Dockerfile, SCA, and SBOM scans from your CI/CD pipelines
            </p>
              </div>
          <div className="flex items-center gap-2">
                <Button
              variant={autoRefresh ? "default" : "outline"}
                  size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={autoRefresh ? "bg-interactive-01" : ""}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? "animate-spin" : ""}`} />
              {autoRefresh ? "Auto Refresh On" : "Auto Refresh"}
            </Button>
            <Button onClick={() => fetchScans(true)} disabled={loadingScans}>
              {loadingScans ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
                </Button>
              </div>
        </div>

        {/* Summary Cards - Top Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Scans"
            value={stats.total}
            icon={Shield}
            color="text-interactive-01"
          />
          <StatCard
            title="Dockerfile"
            value={stats.byType.dockerfile}
            icon={FileCode}
            color="text-blue-400"
            subtitle="Trivy scans"
          />
          <StatCard
            title="SCA"
            value={stats.byType.sca}
            icon={Package}
            color="text-orange-400"
            subtitle="Grype scans"
          />
          <StatCard
            title="SBOM"
            value={stats.byType.sbom}
            icon={Layers}
            color="text-green-400"
            subtitle="Syft generation"
                />
              </div>

        {/* Summary Cards - Severity Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            title="Critical"
            value={stats.severityCounts.critical}
            icon={AlertCircle}
            color="text-red-500"
          />
          <StatCard
            title="High"
            value={stats.severityCounts.high}
            icon={AlertTriangle}
            color="text-orange-500"
          />
          <StatCard
            title="Medium"
            value={stats.severityCounts.medium}
            icon={AlertTriangle}
            color="text-yellow-500"
          />
          <StatCard
            title="Low"
            value={stats.severityCounts.low}
            icon={Activity}
            color="text-blue-500"
          />
          <StatCard
            title="Success Rate"
            value={
              stats.total > 0
                ? `${Math.round((stats.byStatus.success / stats.total) * 100)}%`
                : "—"
            }
            icon={TrendingUp}
            color="text-green-500"
                />
              </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-ui-01 border-ui-03">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-text-01">
                <PieChart className="h-5 w-5" />
                Severity Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie
                      data={severityChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => (value > 0 ? `${name}: ${value}` : "")}
                      labelLine={false}
                    >
                      {severityChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#262626",
                        border: "1px solid #525252",
                        borderRadius: "8px",
                        color: "#f4f4f4",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
                      }}
                      itemStyle={{
                        color: "#f4f4f4",
                      }}
                      labelStyle={{
                        color: "#c6c6c6",
                        fontWeight: 500,
                      }}
                    />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-ui-01 border-ui-03">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-text-01">
                <BarChart3 className="h-5 w-5" />
                Scans by Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scanTypeChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#525252" />
                    <XAxis dataKey="name" tick={{ fill: "#c6c6c6" }} />
                    <YAxis tick={{ fill: "#c6c6c6" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#262626",
                        border: "1px solid #525252",
                        borderRadius: "8px",
                        color: "#f4f4f4",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
                      }}
                      itemStyle={{
                        color: "#f4f4f4",
                      }}
                      labelStyle={{
                        color: "#c6c6c6",
                        fontWeight: 500,
                      }}
                      cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {scanTypeChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="bg-ui-01 border-ui-03">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-text-01">
              <Filter className="h-5 w-5" />
              Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="lg:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-03" />
                <Input
                  placeholder="Search by ID, project, commit..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-ui-02 border-ui-03"
                />
              </div>

              <Input
                placeholder="Pipeline ID"
                value={pipelineId}
                onChange={(e) => setPipelineId(e.target.value)}
                className="bg-ui-02 border-ui-03"
              />

              <Input
                placeholder="Project ID"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="bg-ui-02 border-ui-03"
              />

              <Select value={scanType} onValueChange={setScanType}>
                <SelectTrigger className="bg-ui-02 border-ui-03">
                  <SelectValue placeholder="Scan Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="dockerfile">Dockerfile</SelectItem>
                  <SelectItem value="sca">SCA</SelectItem>
                  <SelectItem value="sbom">SBOM</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-ui-02 border-ui-03">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
                </Select>
              </div>

            <div className="flex items-center justify-between mt-4">
              <Input
                placeholder="Branch filter..."
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="bg-ui-02 border-ui-03 max-w-xs"
              />
              <Button onClick={() => fetchScans(true)} disabled={loadingScans}>
                {loadingScans ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Apply Filters
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Scans Table */}
        <Card className="bg-ui-01 border-ui-03">
          <CardHeader>
            <div className="flex items-center justify-between">
                <div>
                <CardTitle className="text-text-01">Recent Scans</CardTitle>
                <CardDescription>
                  Showing {filteredScans.length} of {totalScans} scan
                  {totalScans !== 1 ? "s" : ""}
                </CardDescription>
                </div>
              {stats.severityCounts.critical > 0 && (
                <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {stats.severityCounts.critical} Critical
                </Badge>
              )}
              </div>
          </CardHeader>
          <CardContent>
            {loadingScans && scans.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-interactive-01" />
                <span className="ml-3 text-text-02">Loading scans...</span>
              </div>
            ) : filteredScans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Shield className="h-16 w-16 text-text-03 mb-4" />
                <p className="text-text-01 font-medium mb-1">No scans found</p>
                <p className="text-sm text-text-03">
                  {searchQuery || pipelineId || projectId
                    ? "Try adjusting your filters"
                    : "Security scans from your CI pipelines will appear here"}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-ui-03 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-ui-02 border-ui-03">
                      <TableHead className="text-text-02">Type</TableHead>
                      <TableHead className="text-text-02">Project</TableHead>
                      <TableHead className="text-text-02">Pipeline</TableHead>
                      <TableHead className="text-text-02">Branch</TableHead>
                      <TableHead className="text-text-02">Commit</TableHead>
                      <TableHead className="text-text-02">Status</TableHead>
                      <TableHead className="text-text-02">Findings</TableHead>
                      <TableHead className="text-text-02">Created</TableHead>
                      <TableHead className="text-text-02 text-right">Actions</TableHead>
                        </TableRow>
                  </TableHeader>
                      <TableBody>
                    {filteredScans.map((scan) => (
                      <TableRow
                        key={scan.id}
                        className="border-ui-03 hover:bg-ui-02 cursor-pointer transition-colors"
                        onClick={() => handleViewScan(scan)}
                      >
                        <TableCell>
                          <ScanTypeBadge type={scan.scan_type} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-text-01 font-medium">
                              {scan.project_name || "—"}
                              </span>
                            <span className="text-xs text-text-03 font-mono">
                              {scan.project_id}
                            </span>
                          </div>
                            </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm text-text-02">
                            {scan.pipeline_id}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <GitBranch className="h-3 w-3 text-text-03" />
                            <span className="text-sm text-text-02">{scan.branch || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div
                            className="flex items-center gap-1 group cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(scan.commit_sha, toast);
                            }}
                          >
                            <GitCommit className="h-3 w-3 text-text-03" />
                            <span className="font-mono text-sm text-interactive-01 group-hover:underline">
                              {truncateSHA(scan.commit_sha)}
                            </span>
                            <Copy className="h-3 w-3 text-text-03 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={scan.status} error={scan.error} />
                        </TableCell>
                        <TableCell>
                          {scan.scan_type === "sbom" ? (
                            <span className="text-sm text-text-02">
                              {scan.summary?.total_components || 0} components
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              {(scan.summary?.critical_count || 0) > 0 && (
                                <Badge className="bg-red-500/20 text-red-400 text-xs px-1.5">
                                  {scan.summary?.critical_count} C
                                </Badge>
                              )}
                              {(scan.summary?.high_count || 0) > 0 && (
                                <Badge className="bg-orange-500/20 text-orange-400 text-xs px-1.5">
                                  {scan.summary?.high_count} H
                                </Badge>
                              )}
                              {(scan.summary?.medium_count || 0) > 0 && (
                                <Badge className="bg-yellow-500/20 text-yellow-400 text-xs px-1.5">
                                  {scan.summary?.medium_count} M
                                </Badge>
                              )}
                              {(scan.summary?.low_count || 0) > 0 && (
                                <Badge className="bg-blue-500/20 text-blue-400 text-xs px-1.5">
                                  {scan.summary?.low_count} L
                                </Badge>
                              )}
                              {!scan.summary?.critical_count &&
                                !scan.summary?.high_count &&
                                !scan.summary?.medium_count &&
                                !scan.summary?.low_count && (
                                  <span className="text-sm text-green-400">Clean</span>
                                )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-text-03">
                            <Clock className="h-3 w-3" />
                            <span className="text-sm text-text-01">
                              {getRelativeTime(scan.created_at)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewScan(scan);
                              }}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadScan(scan);
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
              </div>
            )}

            {/* Pagination */}
            {totalScans > pageSize && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-ui-03">
                <span className="text-sm text-text-03">
                  Page {currentPage + 1} of {Math.ceil(totalScans / pageSize)}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCurrentPage((p) => Math.max(0, p - 1));
                      fetchScans();
                    }}
                    disabled={currentPage === 0}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCurrentPage((p) => p + 1);
                      fetchScans();
                    }}
                    disabled={(currentPage + 1) * pageSize >= totalScans}
                  >
                    Next
                  </Button>
                </div>
                </div>
              )}
          </CardContent>
        </Card>

        {/* Scan Detail Dialog - Full screen modal */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-[95vw] w-[1400px] max-h-[95vh] p-0 bg-ui-background border-ui-03 overflow-hidden flex flex-col">
              {loadingScanDetails ? (
                <div className="flex flex-col items-center justify-center h-[90vh] p-6">
                  <Loader2 className="h-12 w-12 animate-spin text-interactive-01 mb-4" />
                  <p className="text-text-02">Loading scan details...</p>
                </div>
              ) : selectedScan ? (
              (() => {
                try {
                  return (
                    <div className="flex flex-col h-[90vh] max-h-[90vh] overflow-hidden">
                      {/* Sticky Header */}
                      <div className="sticky top-0 z-20 bg-ui-background border-b border-ui-03 p-6 flex-shrink-0">
                        <DialogHeader className="mb-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="p-3 rounded-xl bg-gradient-to-br from-interactive-01/20 to-interactive-01/5 border border-interactive-01/30">
                                {selectedScan?.scan_type === "dockerfile" && (
                                  <FileCode className="h-6 w-6 text-blue-400" />
                                )}
                                {selectedScan?.scan_type === "sca" && (
                                  <Package className="h-6 w-6 text-orange-400" />
                                )}
                                {selectedScan?.scan_type === "sbom" && (
                                  <Layers className="h-6 w-6 text-green-400" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-3">
                                  <DialogTitle className="text-xl text-text-01">
                                    {selectedScan?.scan_type === "dockerfile"
                                      ? "Dockerfile Scan"
                                      : selectedScan?.scan_type === "sca"
                                      ? "SCA Scan"
                                      : selectedScan?.scan_type === "sbom"
                                      ? "SBOM Generation"
                                      : "Scan Details"}
                                  </DialogTitle>
                                  <StatusBadge status={selectedScan?.status || "unknown"} error={selectedScan?.error} />
                                </div>
                                <DialogDescription className="text-text-03 mt-1">
                                  {selectedScan?.project_name || selectedScan?.project_id || "Unknown Project"}
                                </DialogDescription>
                              </div>
                            </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            copyToClipboard(selectedScan.id, toast);
                          }}
                          className="gap-2"
                        >
                          <Copy className="h-4 w-4" />
                          Copy ID
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadScan(selectedScan)}
                          className="gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Export
                        </Button>
                      </div>
                    </div>
                  </DialogHeader>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-6 min-h-0">
                  {/* Scan Info Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    <Card className="bg-gradient-to-br from-ui-01 to-ui-02 border-ui-03">
                      <CardContent className="p-4">
                        <p className="text-xs text-text-03 mb-1 flex items-center gap-1">
                          <Shield className="h-3 w-3" /> Scan ID
                        </p>
                        <p className="font-mono text-sm text-text-01 truncate" title={selectedScan?.id || ""}>
                          {selectedScan?.id ? `${selectedScan.id.slice(0, 12)}...` : "N/A"}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-ui-01 to-ui-02 border-ui-03">
                      <CardContent className="p-4">
                        <p className="text-xs text-text-03 mb-1 flex items-center gap-1">
                          <Activity className="h-3 w-3" /> Pipeline
                        </p>
                        <p className="font-mono text-sm text-interactive-01">{selectedScan?.pipeline_id || "—"}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-ui-01 to-ui-02 border-ui-03">
                      <CardContent className="p-4">
                        <p className="text-xs text-text-03 mb-1 flex items-center gap-1">
                          <GitBranch className="h-3 w-3" /> Branch
                        </p>
                        <p className="text-sm text-text-01">{selectedScan?.branch || "—"}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-ui-01 to-ui-02 border-ui-03">
                      <CardContent className="p-4">
                        <p className="text-xs text-text-03 mb-1 flex items-center gap-1">
                          <GitCommit className="h-3 w-3" /> Commit
                        </p>
                        <p className="font-mono text-sm text-interactive-01">
                          {selectedScan?.commit_sha ? truncateSHA(selectedScan.commit_sha) : "—"}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-ui-01 to-ui-02 border-ui-03">
                      <CardContent className="p-4">
                        <p className="text-xs text-text-03 mb-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Created
                        </p>
                        <p className="text-sm text-text-01">
                          {selectedScan?.created_at ? getRelativeTime(selectedScan.created_at) : "—"}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-ui-01 to-ui-02 border-ui-03">
                      <CardContent className="p-4">
                        <p className="text-xs text-text-03 mb-1 flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" /> Duration
                        </p>
                        <p className="text-sm text-text-01">{selectedScan?.duration || "—"}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Severity Summary with Animated Cards */}
                  <div>
                    <h4 className="text-sm font-medium text-text-01 mb-4 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Findings Summary
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {selectedScan?.scan_type === "sbom" ? (
                        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/30 hover:border-green-500/50 transition-colors">
                          <CardContent className="p-5 text-center">
                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/20 mb-3">
                              <Layers className="h-6 w-6 text-green-400" />
                            </div>
                              <p className="text-3xl font-bold text-green-400">
                              {selectedScan?.summary?.total_components || 0}
                            </p>
                            <p className="text-sm text-text-03 mt-1">Components</p>
                          </CardContent>
                        </Card>
                      ) : (
                        <>
                          <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/30 hover:border-red-500/50 transition-colors group">
                            <CardContent className="p-5 text-center">
                              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/20 mb-3 group-hover:scale-110 transition-transform">
                                <AlertCircle className="h-6 w-6 text-red-400" />
                              </div>
                              <p className="text-3xl font-bold text-red-400">
                                {selectedScan?.summary?.critical_count || 0}
                              </p>
                              <p className="text-sm text-text-03 mt-1">Critical</p>
                            </CardContent>
                          </Card>
                          <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/30 hover:border-orange-500/50 transition-colors group">
                            <CardContent className="p-5 text-center">
                              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/20 mb-3 group-hover:scale-110 transition-transform">
                                <AlertTriangle className="h-6 w-6 text-orange-400" />
                              </div>
                              <p className="text-3xl font-bold text-orange-400">
                                {selectedScan?.summary?.high_count || 0}
                              </p>
                              <p className="text-sm text-text-03 mt-1">High</p>
                            </CardContent>
                          </Card>
                          <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/30 hover:border-yellow-500/50 transition-colors group">
                            <CardContent className="p-5 text-center">
                              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-500/20 mb-3 group-hover:scale-110 transition-transform">
                                <AlertTriangle className="h-6 w-6 text-yellow-400" />
                              </div>
                              <p className="text-3xl font-bold text-yellow-400">
                                {selectedScan?.summary?.medium_count || 0}
                              </p>
                              <p className="text-sm text-text-03 mt-1">Medium</p>
                            </CardContent>
                          </Card>
                          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/30 hover:border-blue-500/50 transition-colors group">
                            <CardContent className="p-5 text-center">
                              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/20 mb-3 group-hover:scale-110 transition-transform">
                                <Activity className="h-6 w-6 text-blue-400" />
                              </div>
                              <p className="text-3xl font-bold text-blue-400">
                                {selectedScan?.summary?.low_count || 0}
                              </p>
                              <p className="text-sm text-text-03 mt-1">Low</p>
                            </CardContent>
                          </Card>
                          <Card className="bg-gradient-to-br from-ui-01 to-ui-02 border-ui-03 hover:border-ui-04 transition-colors group">
                            <CardContent className="p-5 text-center">
                              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-ui-03/50 mb-3 group-hover:scale-110 transition-transform">
                                <Shield className="h-6 w-6 text-text-02" />
                              </div>
                              <p className="text-3xl font-bold text-text-01">
                                {(selectedScan?.summary?.critical_count || 0) +
                                  (selectedScan?.summary?.high_count || 0) +
                                  (selectedScan?.summary?.medium_count || 0) +
                                  (selectedScan?.summary?.low_count || 0)}
                              </p>
                              <p className="text-sm text-text-03 mt-1">Total</p>
                            </CardContent>
                          </Card>
                        </>
                    )}
                  </div>
                    </div>

                  {/* Files Scanned */}
                  {selectedScan?.files_scanned && selectedScan.files_scanned.length > 0 && (
                    <Card className="bg-ui-01 border-ui-03">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <FileCode className="h-4 w-4" />
                          Files Scanned ({selectedScan.files_scanned.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {selectedScan.files_scanned.map((file, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className="font-mono text-xs bg-ui-02"
                            >
                              {file}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Error Message */}
                  {selectedScan?.error && (
                    <Card className="bg-red-500/10 border-red-500/30">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <XCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-red-400 mb-1">Error Details</p>
                            <p className="text-sm text-text-02">{selectedScan.error}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Content Tabs */}
                  <Tabs defaultValue="findings" className="w-full">
                    <TabsList className="w-full bg-ui-01 border border-ui-03 p-1 h-auto">
                      <TabsTrigger
                        value="findings"
                        className="flex-1 gap-2 data-[state=active]:bg-interactive-01 data-[state=active]:text-white py-2"
                      >
                        {selectedScan?.scan_type === "dockerfile" && (
                          <>
                            <FileCode className="h-4 w-4" />
                            Misconfigurations
                          </>
                        )}
                        {selectedScan?.scan_type === "sca" && (
                          <>
                            <AlertTriangle className="h-4 w-4" />
                            Vulnerabilities
                          </>
                        )}
                        {selectedScan?.scan_type === "sbom" && (
                          <>
                            <Package className="h-4 w-4" />
                            Components
                          </>
                        )}
                      </TabsTrigger>
                      <TabsTrigger
                        value="raw"
                        className="flex-1 gap-2 data-[state=active]:bg-interactive-01 data-[state=active]:text-white py-2"
                      >
                        <Activity className="h-4 w-4" />
                        Raw JSON
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="findings" className="mt-4">
                      {/* Search Input */}
                      <div className="mb-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-03" />
                          <Input
                            placeholder={
                              selectedScan?.scan_type === "dockerfile"
                                ? "Search misconfigurations by ID, title..."
                                : selectedScan?.scan_type === "sca"
                                ? "Search vulnerabilities by package, CVE ID..."
                                : "Search components by name, version, type..."
                            }
                            value={modalSearchQuery}
                            onChange={(e) => {
                              setModalSearchQuery(e.target.value);
                              // Reset pagination when search changes
                              setComponentsPage(0);
                              setVulnerabilitiesPage(0);
                              setMisconfigurationsPage(0);
                            }}
                            className="pl-9 bg-ui-02 border-ui-03"
                          />
                          {modalSearchQuery && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                              onClick={() => {
                                setModalSearchQuery("");
                                setComponentsPage(0);
                                setVulnerabilitiesPage(0);
                                setMisconfigurationsPage(0);
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {selectedScan?.scan_type === "dockerfile" &&
                        selectedScan && renderMisconfigurations(selectedScan)}
                      {selectedScan?.scan_type === "sca" && selectedScan && renderVulnerabilities(selectedScan)}
                      {selectedScan?.scan_type === "sbom" && selectedScan && renderComponents(selectedScan)}
                    </TabsContent>

                    <TabsContent value="raw" className="mt-4">
                      <Card className="bg-ui-01 border-ui-03 overflow-hidden">
                        <CardHeader className="pb-3 border-b border-ui-03">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Activity className="h-4 w-4" />
                              Raw Scan Data
                            </CardTitle>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (selectedScan) {
                                    copyToClipboard(JSON.stringify(selectedScan, null, 2), toast);
                                  }
                                }}
                                className="gap-2"
                              >
                                <Copy className="h-4 w-4" />
                                Copy
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => downloadScan(selectedScan)}
                                className="gap-2"
                              >
                                <Download className="h-4 w-4" />
                                Download
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-0 overflow-hidden">
                          <div className="overflow-auto max-h-[60vh]">
                            <pre className="p-0 text-xs font-mono text-text-02 m-0">
                              <code className="block">
                                {selectedScan
                                  ? JSON.stringify(selectedScan, null, 2)
                                      .split("\n")
                                      .map((line, i) => {
                                        // Escape HTML entities first
                                        const escapedLine = line
                                          .replace(/&/g, "&amp;")
                                          .replace(/</g, "&lt;")
                                          .replace(/>/g, "&gt;");

                                        // Apply syntax highlighting
                                        const highlighted = escapedLine
                                          // String keys: "key":
                                          .replace(
                                            /"([^"]+)":/g,
                                            '<span class="text-blue-400">"$1"</span>:'
                                          )
                                          // String values: : "value"
                                          .replace(
                                            /: "([^"]*)"/g,
                                            ': <span class="text-green-400">"$1"</span>'
                                          )
                                          // Numbers: : 123
                                          .replace(
                                            /: (\d+\.?\d*)/g,
                                            ': <span class="text-orange-400">$1</span>'
                                          )
                                          // Booleans and null: : true/false/null
                                          .replace(
                                            /: (true|false|null)/g,
                                            ': <span class="text-purple-400">$1</span>'
                                          )
                                          // Brackets and braces
                                          .replace(/(\{|\})/g, '<span class="text-yellow-400">$1</span>')
                                          .replace(/(\[|\])/g, '<span class="text-yellow-400">$1</span>');

                                        return (
                                          <div
                                            key={i}
                                            className="hover:bg-ui-02 flex items-start min-h-[1.5rem] border-b border-ui-03/30 last:border-b-0"
                                          >
                                            <span className="flex-shrink-0 w-12 text-text-03 select-none text-right pr-4 py-1 bg-ui-02/50">
                                              {i + 1}
                                            </span>
                                            <span
                                              className="flex-1 whitespace-pre py-1 pl-2 overflow-x-auto"
                                              dangerouslySetInnerHTML={{ __html: highlighted }}
                                            />
                                          </div>
                                        );
                                      })
                                  : "{}"}
                              </code>
                            </pre>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Sticky Footer */}
                <div className="sticky bottom-0 z-20 bg-ui-background border-t border-ui-03 px-6 py-4 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-text-03">
                      <span className="font-mono">{selectedScan?.id || "N/A"}</span>
                      <span className="mx-2">•</span>
                      <span>
                        {selectedScan?.created_at
                          ? new Date(selectedScan.created_at).toLocaleString()
                          : "Unknown"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                        Close
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
                  );
                } catch (renderError: any) {
                  console.error("Error rendering modal content:", renderError);
                  return (
                    <div className="flex flex-col items-center justify-center h-[90vh] p-6">
                      <XCircle className="h-16 w-16 text-red-500 mb-4" />
                      <h3 className="text-lg font-semibold text-text-01 mb-2">Rendering Error</h3>
                      <p className="text-sm text-text-03 mb-4 text-center max-w-md">
                        An error occurred while rendering the scan details. This may be due to
                        invalid or corrupted data.
                      </p>
                      <div className="text-xs text-text-03 mb-4 font-mono bg-ui-01 p-2 rounded">
                        {renderError?.message || "Unknown error"}
                      </div>
                      <Button onClick={() => setIsDetailOpen(false)}>Close</Button>
                    </div>
                  );
                }
              })()
            ) : (
              <div className="flex flex-col items-center justify-center h-[90vh] p-6">
                <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
                <h3 className="text-lg font-semibold text-text-01 mb-2">Error Loading Scan</h3>
                <p className="text-sm text-text-03 mb-4 text-center">
                  Unable to load scan details. The data may be corrupted or too large.
                </p>
                <Button onClick={() => setIsDetailOpen(false)}>Close</Button>
                </div>
              )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
