import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Package,
  Search,
  AlertTriangle,
  Shield,
  Clock,
  CheckCircle2,
  Trash2,
  Layers,
  TrendingUp,
  TrendingDown,
  History,
  Filter,
} from "lucide-react";

// Types
type VulnerabilitySeverity = "Critical" | "High" | "Medium" | "Low" | "Informational" | "Unknown";

type Vulnerability = {
  id: string;
  cve: string;
  title: string;
  description: string;
  severity: VulnerabilitySeverity | string;
  score?: string;
  category: string;
  solution?: string;
  package?: string;
  version?: string;
};

type ScanSummary = {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
};

type ScanResult = {
  image_name: string;
  digest: string;
  scan_time: string;
  vulnerabilities: Vulnerability[];
  summary: ScanSummary;
  cache_hit: boolean;
  scan_duration: string;
  status: string;
  error?: string;
};

export default function ScanHistory() {
  const [savedScans, setSavedScans] = useState<ScanResult[]>([]);
  const [filteredScans, setFilteredScans] = useState<ScanResult[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [selectedScan, setSelectedScan] = useState<ScanResult | null>(null);
  const [selectedVuln, setSelectedVuln] = useState<Vulnerability | null>(null);
  const [isVulnDialogOpen, setIsVulnDialogOpen] = useState(false);
  const [isScanDialogOpen, setIsScanDialogOpen] = useState(false);
  const [expandedSeverity, setExpandedSeverity] = useState<VulnerabilitySeverity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch saved scans on mount
  useEffect(() => {
    fetchSavedScans();
  }, []);

  // Apply filters whenever search term, severity filter, or saved scans change
  useEffect(() => {
    applyFilters();
  }, [searchTerm, severityFilter, savedScans]);

  const fetchSavedScans = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("http://localhost:8080/api/v2/security/image/saved?limit=100");
      if (!response.ok) {
        throw new Error(`Failed to fetch scans: ${response.statusText}`);
      }
      const data = await response.json();
      // Filter out scans without required fields
      const validScans = (data.results || []).filter(
        (scan: ScanResult) => scan.summary && (scan.image_name || scan.digest)
      );
      setSavedScans(validScans);
    } catch (err) {
      console.error("Failed to fetch saved scans:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch saved scans");
      setSavedScans([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...savedScans];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter((scan) =>
        scan.image_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        scan.digest?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply severity filter
    if (severityFilter !== "all") {
      filtered = filtered.filter((scan) => {
        const summary = scan.summary;
        if (!summary) return false;

        switch (severityFilter) {
          case "critical":
            return summary.critical > 0;
          case "high":
            return summary.high > 0;
          case "medium":
            return summary.medium > 0;
          case "low":
            return summary.low > 0;
          case "clean":
            return summary.total === 0;
          default:
            return true;
        }
      });
    }

    setFilteredScans(filtered);
  };

  const deleteScanResult = async (imageName: string, scanTime: string) => {
    try {
      const response = await fetch(
        `http://localhost:8080/api/v2/security/image/saved?image=${encodeURIComponent(
          imageName
        )}&scan_time=${encodeURIComponent(scanTime)}`,
        { method: "DELETE" }
      );
      if (response.ok) {
        fetchSavedScans();
        if (selectedScan?.image_name === imageName && selectedScan?.scan_time === scanTime) {
          setSelectedScan(null);
          setIsScanDialogOpen(false);
        }
      }
    } catch (error) {
      console.error("Failed to delete scan:", error);
    }
  };

  const loadScanDetails = async (imageName: string) => {
    try {
      const response = await fetch(
        `http://localhost:8080/api/v2/security/image/saved/latest?image=${encodeURIComponent(
          imageName
        )}`
      );
      if (response.ok) {
        const result: ScanResult = await response.json();
        if (!result.image_name) result.image_name = imageName;
        if (!result.vulnerabilities) result.vulnerabilities = [];
        setSelectedScan(result);
        setIsScanDialogOpen(true);
      }
    } catch (error) {
      console.error("Failed to load scan details:", error);
    }
  };

  const handleViewVulnerability = (vuln: Vulnerability) => {
    setSelectedVuln(vuln);
    setIsVulnDialogOpen(true);
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return "N/A";
    try {
      const dateWithoutTZ = dateString.replace(/([+-]\d{2}):(\d{2})$/, '');
      const date = new Date(dateWithoutTZ);
      if (isNaN(date.getTime())) {
        const fallbackDate = new Date(dateString);
        if (isNaN(fallbackDate.getTime())) {
          return "Invalid Date";
        }
        return fallbackDate.toLocaleDateString();
      }
      return date.toLocaleDateString();
    } catch {
      return "Invalid Date";
    }
  };

  const formatDateTime = (dateString: string): string => {
    if (!dateString) return "N/A";
    try {
      const dateWithoutTZ = dateString.replace(/([+-]\d{2}):(\d{2})$/, '');
      const date = new Date(dateWithoutTZ);
      if (isNaN(date.getTime())) {
        const fallbackDate = new Date(dateString);
        if (isNaN(fallbackDate.getTime())) {
          return "Invalid Date";
        }
        return fallbackDate.toLocaleString();
      }
      return date.toLocaleString();
    } catch {
      return "Invalid Date";
    }
  };

  const normalizeSeverity = (severity: string): string => {
    const lower = severity.toLowerCase();
    if (lower === "critical") return "Critical";
    if (lower === "high") return "High";
    if (lower === "medium") return "Medium";
    if (lower === "low") return "Low";
    if (lower === "informational") return "Informational";
    return "Unknown";
  };

  const getSeverityColor = (severity: string) => {
    const normalized = normalizeSeverity(severity);
    switch (normalized) {
      case "Critical":
        return "bg-support-01 text-white";
      case "High":
        return "bg-orange-500 text-white";
      case "Medium":
        return "bg-yellow-500 text-black";
      case "Low":
        return "bg-sky-400 text-white";
      case "Informational":
        return "bg-gray-500 text-white";
      default:
        return "bg-gray-400 text-white";
    }
  };

  const getSeverityBorderColor = (severity: string) => {
    const normalized = normalizeSeverity(severity);
    switch (normalized) {
      case "Critical":
        return "border-support-01";
      case "High":
        return "border-orange-500";
      case "Medium":
        return "border-yellow-500";
      case "Low":
        return "border-sky-400";
      case "Informational":
        return "border-gray-500";
      default:
        return "border-gray-400";
    }
  };

  return (
    <DashboardLayout>
      <div className="col-span-full">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2 flex items-center gap-2">
                <History className="h-8 w-8" />
                Scan History
              </h1>
              <p className="carbon-type-body-02 text-text-02">
                View and manage all previously scanned container images
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-4 py-2 bg-ui-02 border border-ui-03 rounded carbon-type-label-01 text-text-01">
                Total: {filteredScans.length} / {savedScans.length}
              </div>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 flex items-center space-x-2 p-4 bg-support-01 text-white rounded">
            <AlertTriangle className="h-5 w-5" />
            <span className="carbon-type-body-01">{error}</span>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <label className="block carbon-type-label-01 text-text-02 mb-2">
              Search Images
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-03" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by image name or digest..."
                className="w-full pl-10 pr-3 py-2 bg-field-01 border border-ui-04 rounded carbon-type-body-01 text-text-01 placeholder-text-03 focus:outline-none focus:ring-2 focus:ring-interactive-01"
              />
            </div>
          </div>

          {/* Severity Filter - Using Carbon Design System Styled Select */}
          <div className="lg:col-span-2">
            <label className="block carbon-type-label-01 text-text-02 mb-2">
              Filter by Severity
            </label>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-full bg-field-01 border-ui-04 text-text-01 carbon-type-body-01">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-text-03" />
                  <SelectValue placeholder="All Scans" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-layer-01 border-ui-03">
                <SelectItem value="all" className="carbon-type-body-01 text-text-01 focus:bg-ui-03">
                  All Scans
                </SelectItem>
                <SelectItem value="critical" className="carbon-type-body-01 text-text-01 focus:bg-ui-03">
                  Critical Vulnerabilities
                </SelectItem>
                <SelectItem value="high" className="carbon-type-body-01 text-text-01 focus:bg-ui-03">
                  High Vulnerabilities
                </SelectItem>
                <SelectItem value="medium" className="carbon-type-body-01 text-text-01 focus:bg-ui-03">
                  Medium Vulnerabilities
                </SelectItem>
                <SelectItem value="low" className="carbon-type-body-01 text-text-01 focus:bg-ui-03">
                  Low Vulnerabilities
                </SelectItem>
                <SelectItem value="clean" className="carbon-type-body-01 text-text-01 focus:bg-ui-03">
                  Clean Scans
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-layer-01 border border-ui-03 rounded p-8 text-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                <div className="h-16 w-16 border-4 border-purple-600/20 rounded-full" />
                <div className="absolute inset-0 h-16 w-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="carbon-type-body-01 text-text-02">Loading scan history...</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredScans.length === 0 && !error && (
          <div className="bg-layer-01 border border-ui-03 rounded p-12 text-center">
            <History className="h-16 w-16 text-text-03 mx-auto mb-4" />
            <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
              {searchTerm || severityFilter !== "all" ? "No scans found" : "No scan history"}
            </h3>
            <p className="carbon-type-body-01 text-text-02">
              {searchTerm || severityFilter !== "all"
                ? "Try adjusting your search or filter criteria"
                : "Start scanning images to see your history here"}
            </p>
          </div>
        )}

        {/* Scans Grid */}
        {!loading && filteredScans.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredScans.map((scan, idx) => {
              // Handle cases where digest might be undefined - add safety checks
              if (!scan.summary) return null;

              const displayName = scan.image_name || (scan.digest ? scan.digest.substring(0, 19) : 'unknown-image');
              const [imageName, tag] = displayName.includes(':')
                ? displayName.split(':', 2)
                : [displayName, 'latest'];
              const displayTime = scan.scan_time || new Date().toISOString();
              const digestDisplay = scan.digest ? scan.digest.substring(0, 40) : 'N/A';

              return (
                <div
                  key={(scan.digest || `scan-${idx}`) + idx}
                  className="bg-layer-01 border border-ui-03 rounded-lg p-5 hover:border-interactive-01 cursor-pointer transition-all hover:shadow-lg group"
                  onClick={() => loadScanDetails(displayName)}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="h-5 w-5 text-text-02 flex-shrink-0" />
                        <div className="carbon-type-body-01 font-semibold text-text-01 truncate font-mono">
                          {imageName}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-purple-500/10 text-purple-500 rounded carbon-type-label-01 font-medium">
                          {tag}
                        </span>
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Search className="h-5 w-5 text-interactive-01" />
                    </div>
                  </div>

                  {/* Vulnerabilities Summary */}
                  <div className="mb-4 pb-4 border-b border-ui-03">
                    <div className="flex items-center justify-between mb-2">
                      <span className="carbon-type-label-01 text-text-02">Total Vulnerabilities</span>
                      <span className="carbon-type-productive-heading-03 text-text-01">{scan.summary.total}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {scan.summary.critical > 0 && (
                        <span className="px-2 py-0.5 bg-red-500/10 text-red-500 rounded carbon-type-label-01 font-medium">
                          {scan.summary.critical} Critical
                        </span>
                      )}
                      {scan.summary.high > 0 && (
                        <span className="px-2 py-0.5 bg-orange-500/10 text-orange-500 rounded carbon-type-label-01 font-medium">
                          {scan.summary.high} High
                        </span>
                      )}
                      {scan.summary.medium > 0 && (
                        <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-500 rounded carbon-type-label-01 font-medium">
                          {scan.summary.medium} Medium
                        </span>
                      )}
                      {scan.summary.low > 0 && (
                        <span className="px-2 py-0.5 bg-sky-400/10 text-sky-400 rounded carbon-type-label-01 font-medium">
                          {scan.summary.low} Low
                        </span>
                      )}
                      {scan.summary.total === 0 && (
                        <span className="px-2 py-0.5 bg-green-500/10 text-green-500 rounded carbon-type-label-01 font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Clean
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 carbon-type-helper-text-01 text-text-03">
                      <Clock className="h-3 w-3" />
                      <span>{formatDateTime(displayTime)}</span>
                    </div>
                    {scan.scan_duration && (
                      <div className="flex items-center gap-2 carbon-type-helper-text-01 text-text-03">
                        <Layers className="h-3 w-3" />
                        <span>Duration: {scan.scan_duration}</span>
                      </div>
                    )}
                    <div className="carbon-type-helper-text-01 text-text-03 font-mono truncate">
                      {digestDisplay}...
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteScanResult(displayName, displayTime);
                    }}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-support-01/10 hover:bg-support-01/20 text-support-01 rounded carbon-type-body-01 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete Scan
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Scan Details Dialog */}
        <Dialog open={isScanDialogOpen} onOpenChange={setIsScanDialogOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-layer-01 border-ui-03">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 carbon-type-productive-heading-03 text-text-01">
                <Package className="h-5 w-5 text-purple-500" />
                Scan Details
              </DialogTitle>
              <DialogDescription className="carbon-type-body-01 text-text-02">
                Detailed vulnerability information for {selectedScan?.image_name}
              </DialogDescription>
            </DialogHeader>

            {selectedScan && (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-layer-02 border border-ui-03 rounded p-3 text-center">
                    <div className="carbon-type-productive-heading-03 text-text-01">{selectedScan.summary.total}</div>
                    <div className="carbon-type-label-01 text-text-02 mt-1">Total</div>
                  </div>
                  <div className="bg-red-500/10 border border-red-500 rounded p-3 text-center">
                    <div className="carbon-type-productive-heading-03 text-red-500">{selectedScan.summary.critical}</div>
                    <div className="carbon-type-label-01 text-red-500 mt-1">Critical</div>
                  </div>
                  <div className="bg-orange-500/10 border border-orange-500 rounded p-3 text-center">
                    <div className="carbon-type-productive-heading-03 text-orange-500">{selectedScan.summary.high}</div>
                    <div className="carbon-type-label-01 text-orange-500 mt-1">High</div>
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500 rounded p-3 text-center">
                    <div className="carbon-type-productive-heading-03 text-yellow-500">{selectedScan.summary.medium}</div>
                    <div className="carbon-type-label-01 text-yellow-500 mt-1">Medium</div>
                  </div>
                  <div className="bg-sky-400/10 border border-sky-400 rounded p-3 text-center">
                    <div className="carbon-type-productive-heading-03 text-sky-400">{selectedScan.summary.low}</div>
                    <div className="carbon-type-label-01 text-sky-400 mt-1">Low</div>
                  </div>
                </div>

                {/* Clean Scan Message */}
                {selectedScan.summary.total === 0 && (
                  <div className="bg-green-500/10 border-2 border-green-500 rounded-lg p-6">
                    <div className="flex items-center justify-center gap-4">
                      <div className="p-3 bg-green-500 rounded-full">
                        <Shield className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="carbon-type-productive-heading-03 text-green-500 mb-1">
                          Clean Security Scan
                        </h3>
                        <p className="carbon-type-body-01 text-text-02">
                          No vulnerabilities detected in this image
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Vulnerabilities List */}
                {selectedScan.vulnerabilities && selectedScan.vulnerabilities.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="carbon-type-productive-heading-02 text-text-01">
                      Vulnerabilities ({selectedScan.vulnerabilities.length})
                    </h3>
                    {(["Critical", "High", "Medium", "Low", "Informational", "Unknown"] as VulnerabilitySeverity[]).map(
                      (severity) => {
                        const vulns = selectedScan.vulnerabilities?.filter(
                          (v) => normalizeSeverity(v.severity) === severity
                        ) || [];
                        if (vulns.length === 0) return null;

                        const isExpanded = expandedSeverity === severity;

                        return (
                          <div key={severity} className={`border-2 rounded-lg ${getSeverityBorderColor(severity)}`}>
                            <button
                              onClick={() => setExpandedSeverity(isExpanded ? null : severity)}
                              className="w-full flex items-center justify-between p-4 hover:bg-ui-01 transition-colors rounded-t-lg"
                            >
                              <div className="flex items-center gap-3">
                                <span className={`px-3 py-1 rounded-md font-semibold carbon-type-label-01 ${getSeverityColor(severity)}`}>
                                  {severity}
                                </span>
                                <span className="text-text-01 font-medium carbon-type-body-01">
                                  {vulns.length} {vulns.length === 1 ? "vulnerability" : "vulnerabilities"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {severity === "Critical" || severity === "High" ? (
                                  <TrendingUp className="h-4 w-4 text-red-500" />
                                ) : (
                                  <TrendingDown className="h-4 w-4 text-gray-400" />
                                )}
                                <span className="text-text-02 carbon-type-body-01">
                                  {isExpanded ? "▼" : "▶"}
                                </span>
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="border-t-2 border-ui-03">
                                <div className="p-4 space-y-2">
                                  {vulns.map((vuln) => (
                                    <div
                                      key={vuln.id}
                                      onClick={() => handleViewVulnerability(vuln)}
                                      className="p-4 bg-layer-02 border border-ui-03 rounded-lg hover:border-interactive-01 cursor-pointer transition-all hover:shadow-md"
                                    >
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-2">
                                            <span className="font-mono carbon-type-body-01 font-bold text-text-01">
                                              {vuln.cve}
                                            </span>
                                            {vuln.score && (
                                              <span className="px-2 py-0.5 bg-ui-03 rounded carbon-type-label-01 text-text-02">
                                                CVSS {vuln.score}
                                              </span>
                                            )}
                                          </div>
                                          <div className="carbon-type-body-01 text-text-01 mb-1 line-clamp-2">
                                            {vuln.title}
                                          </div>
                                          {vuln.package && (
                                            <div className="carbon-type-helper-text-01 text-text-02">
                                              Package: <span className="font-mono">{vuln.package}@{vuln.version}</span>
                                            </div>
                                          )}
                                        </div>
                                        <AlertTriangle className="h-5 w-5 text-text-03 flex-shrink-0" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                )}

                {/* Scan Meta Info */}
                <div className="pt-4 border-t border-ui-03 space-y-2">
                  <div className="flex items-center gap-2 carbon-type-body-01 text-text-02">
                    <Clock className="h-4 w-4" />
                    <span>Scanned: {formatDateTime(selectedScan.scan_time)}</span>
                  </div>
                  {selectedScan.scan_duration && (
                    <div className="flex items-center gap-2 carbon-type-body-01 text-text-02">
                      <Layers className="h-4 w-4" />
                      <span>Duration: {selectedScan.scan_duration}</span>
                    </div>
                  )}
                  {selectedScan.digest && (
                    <div className="carbon-type-body-01 text-text-02 font-mono">
                      Digest: {selectedScan.digest}
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Vulnerability Details Dialog */}
        <Dialog open={isVulnDialogOpen} onOpenChange={setIsVulnDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-layer-01 border-ui-03">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 carbon-type-productive-heading-03 text-text-01">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Vulnerability Details
              </DialogTitle>
              <DialogDescription className="carbon-type-body-01 text-text-02">
                Comprehensive security analysis and remediation information
              </DialogDescription>
            </DialogHeader>

            {selectedVuln && (
              <div className="space-y-6">
                {/* Header */}
                <div className="p-4 bg-layer-02 border-2 border-ui-03 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono carbon-type-productive-heading-03 text-text-01">{selectedVuln.cve}</span>
                    <span
                      className={`px-3 py-1 rounded-md font-semibold ${getSeverityColor(selectedVuln.severity)}`}
                    >
                      {selectedVuln.severity}
                    </span>
                  </div>
                  {selectedVuln.score && (
                    <div className="carbon-type-body-01 text-text-02">CVSS Score: {selectedVuln.score}</div>
                  )}
                </div>

                {/* Content */}
                <div className="space-y-4">
                  <div>
                    <h4 className="carbon-type-label-01 text-text-02 mb-2">Title</h4>
                    <p className="carbon-type-body-01 text-text-01">{selectedVuln.title}</p>
                  </div>

                  <div>
                    <h4 className="carbon-type-label-01 text-text-02 mb-2">Description</h4>
                    <p className="carbon-type-body-01 text-text-01 whitespace-pre-wrap">
                      {selectedVuln.description}
                    </p>
                  </div>

                  {selectedVuln.package && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="carbon-type-label-01 text-text-02 mb-2">Package</h4>
                        <p className="font-mono carbon-type-body-01 text-text-01 bg-layer-02 px-3 py-2 rounded">
                          {selectedVuln.package}
                        </p>
                      </div>
                      <div>
                        <h4 className="carbon-type-label-01 text-text-02 mb-2">Version</h4>
                        <p className="font-mono carbon-type-body-01 text-text-01 bg-layer-02 px-3 py-2 rounded">
                          {selectedVuln.version}
                        </p>
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="carbon-type-label-01 text-text-02 mb-2">Category</h4>
                    <p className="carbon-type-body-01 text-text-01">{selectedVuln.category}</p>
                  </div>

                  {selectedVuln.solution && (
                    <div className="bg-green-500/10 border-2 border-green-500 rounded-lg p-4">
                      <h4 className="carbon-type-label-01 text-green-500 mb-2 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Solution
                      </h4>
                      <p className="carbon-type-body-01 text-text-01">{selectedVuln.solution}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
