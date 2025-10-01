import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/ui/metric-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Package,
  Search,
  AlertTriangle,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  History,
  Info,
  AlertCircle,
  Trash2,
  Layers,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

// Types
type VulnerabilitySeverity = "Critical" | "High" | "Medium" | "Low" | "Informational" | "Unknown";

type Vulnerability = {
  id: string;
  cve: string;
  title: string;
  description: string;
  severity: VulnerabilitySeverity | string; // Allow any string from API
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

type ScanStatus = "queued" | "processing" | "completed" | "failed";

type ScanJob = {
  id: string;
  image_name: string;
  status: ScanStatus;
  start_time: string;
  end_time: string | null;
  result: ScanResult | null;
  error: string;
  force_rescan?: boolean;
};

// Hook for image scanning
function useImageScanning() {
  const [status, setStatus] = useState<"idle" | "loading" | "completed" | "failed">("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const pollIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const cleanup = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const startScan = async (imageName: string, forceRescan: boolean = false) => {
    cleanup();
    setStatus("loading");
    setError(null);
    setResult(null);
    setProgress("Queuing scan...");

    try {
      const startResponse = await fetch("http://localhost:8080/api/v2/security/image/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_name: imageName, force_rescan: forceRescan }),
      });

      if (startResponse.status !== 202) {
        const errorData = await startResponse.json();
        throw new Error(errorData.error || "Failed to start scan");
      }

      const { job_id } = await startResponse.json();
      setProgress(`Scan queued (Job ID: ${job_id})`);

      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusResponse = await fetch(
            `http://localhost:8080/api/v2/security/image/status/${job_id}`
          );

          if (statusResponse.status === 404) {
            cleanup();
            setError("Job not found");
            setStatus("failed");
            return;
          }

          if (statusResponse.status !== 200) {
            const errorData = await statusResponse.json();
            throw new Error(errorData.error || "Failed to get status");
          }

          const jobStatus: ScanJob = await statusResponse.json();

          if (jobStatus.status === "processing") {
            setProgress("Scanning image...");
          } else if (jobStatus.status === "queued") {
            setProgress("Waiting in queue...");
          }

          if (jobStatus.status === "completed" && jobStatus.result) {
            setResult(jobStatus.result);
            setStatus("completed");
            cleanup();
          } else if (jobStatus.status === "failed") {
            setError(jobStatus.error || "Scan failed");
            setStatus("failed");
            cleanup();
          }
        } catch (err) {
          cleanup();
          setError(err instanceof Error ? err.message : "Unknown error");
          setStatus("failed");
        }
      }, 2000);

      timeoutRef.current = setTimeout(() => {
        cleanup();
        setError("Timeout waiting for scan completion");
        setStatus("failed");
      }, 600000);
    } catch (err) {
      cleanup();
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("failed");
    }
  };

  const reset = () => {
    cleanup();
    setStatus("idle");
    setResult(null);
    setError(null);
    setProgress("");
  };

  const setResultDirectly = (scanResult: ScanResult) => {
    cleanup();
    setResult(scanResult);
    setStatus("completed");
    setError(null);
    setProgress("");
  };

  useEffect(() => {
    return () => cleanup();
  }, []);

  return { status, result, error, progress, startScan, reset, setResultDirectly };
}

export default function ImageScanning() {
  const [imageName, setImageName] = useState("");
  const [forceRescan, setForceRescan] = useState(false);
  const [selectedVuln, setSelectedVuln] = useState<Vulnerability | null>(null);
  const [isVulnDialogOpen, setIsVulnDialogOpen] = useState(false);
  const [scanJobs, setScanJobs] = useState<ScanJob[]>([]);
  const [savedScans, setSavedScans] = useState<ScanResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSavedScans, setShowSavedScans] = useState(false);
  const [expandedSeverity, setExpandedSeverity] = useState<VulnerabilitySeverity | null>(null);

  const scanHook = useImageScanning();

  // Fetch saved scans on mount
  useEffect(() => {
    fetchSavedScans();
  }, []);

  // Fetch jobs when image name changes
  useEffect(() => {
    if (imageName && showHistory) {
      fetchScanJobs(imageName);
    }
  }, [imageName, showHistory]);

  const fetchSavedScans = async () => {
    try {
      const response = await fetch("http://localhost:8080/api/v2/security/image/saved?limit=20");
      if (response.ok) {
        const data = await response.json();
        setSavedScans(data.results || []);
      }
    } catch (error) {
      console.error("Failed to fetch saved scans:", error);
    }
  };

  const fetchScanJobs = async (image: string) => {
    try {
      const response = await fetch(
        `http://localhost:8080/api/v2/security/image/jobs?image=${encodeURIComponent(image)}`
      );
      if (response.ok) {
        const data = await response.json();
        setScanJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Failed to fetch scan jobs:", error);
    }
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
      }
    } catch (error) {
      console.error("Failed to delete scan:", error);
    }
  };

  const handleStartScan = async () => {
    if (!imageName.trim()) return;
    await scanHook.startScan(imageName.trim(), forceRescan);
    fetchSavedScans();
  };

  const loadSavedScan = async (imageName: string, scanTime: string) => {
    try {
      const response = await fetch(
        `http://localhost:8080/api/v2/security/image/saved/latest?image=${encodeURIComponent(
          imageName
        )}`
      );
      if (response.ok) {
        const result: ScanResult = await response.json();
        // Fill in missing fields from the saved scan entry
        if (!result.image_name) result.image_name = imageName;
        if (!result.scan_time) result.scan_time = scanTime;
        // Ensure vulnerabilities is an array
        if (!result.vulnerabilities) result.vulnerabilities = [];

        scanHook.setResultDirectly(result);
        setImageName(imageName);
      }
    } catch (error) {
      console.error("Failed to load saved scan:", error);
    }
  };

  const loadJobResult = async (job: ScanJob) => {
    if (job.status !== "completed" || !job.result) return;

    const result = job.result;
    // Ensure vulnerabilities is an array
    if (!result.vulnerabilities) result.vulnerabilities = [];

    scanHook.setResultDirectly(result);
  };

  const handleViewVulnerability = (vuln: Vulnerability) => {
    setSelectedVuln(vuln);
    setIsVulnDialogOpen(true);
  };

  const formatDate = (dateString: string): string => {
    try {
      // Handle timezone offset format like "2025-10-01T13:02:07+03:30"
      // Parse the date string by removing the timezone part
      const dateWithoutTZ = dateString.replace(/([+-]\d{2}):(\d{2})$/, '');
      const date = new Date(dateWithoutTZ);
      if (isNaN(date.getTime())) {
        // Fallback: try parsing as-is
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
    try {
      // Handle timezone offset format like "2025-10-01T13:02:07+03:30"
      const dateWithoutTZ = dateString.replace(/([+-]\d{2}):(\d{2})$/, '');
      const date = new Date(dateWithoutTZ);
      if (isNaN(date.getTime())) {
        // Fallback: try parsing as-is
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

  const displayResult = scanHook.result;

  // Metrics for summary cards
  const metrics = displayResult
    ? [
        {
          title: "Total Vulnerabilities",
          value: displayResult.summary.total.toString(),
          change: displayResult.cache_hit ? "Cached" : "Fresh scan",
          changeType: "neutral" as const,
          icon: Shield,
        },
        {
          title: "Critical",
          value: displayResult.summary.critical.toString(),
          change: "",
          changeType: displayResult.summary.critical > 0 ? ("negative" as const) : ("neutral" as const),
          icon: XCircle,
        },
        {
          title: "High",
          value: displayResult.summary.high.toString(),
          change: "",
          changeType: displayResult.summary.high > 0 ? ("negative" as const) : ("neutral" as const),
          icon: AlertTriangle,
        },
        {
          title: "Medium",
          value: displayResult.summary.medium.toString(),
          change: "",
          changeType: "neutral" as const,
          icon: AlertCircle,
        },
        {
          title: "Low",
          value: displayResult.summary.low.toString(),
          change: "",
          changeType: "neutral" as const,
          icon: Info,
        },
      ]
    : [];

  return (
    <DashboardLayout>
      <div className="col-span-full">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2">
                Image Security Scanner
              </h1>
              <p className="carbon-type-body-02 text-text-02">
                Scan container images for vulnerabilities and security issues
              </p>
            </div>
            <div className="flex items-center gap-2">
              {displayResult && displayResult.cache_hit && (
                <div className="px-3 py-1 bg-blue-500/10 text-blue-500 rounded carbon-type-label-01 flex items-center gap-2">
                  <Layers className="h-3 w-3" />
                  Cached Result
                </div>
              )}
              <button
                onClick={() => setShowSavedScans(!showSavedScans)}
                className="flex items-center gap-2 px-4 py-2 border border-ui-04 text-text-01 rounded carbon-type-body-01 hover:bg-ui-01 transition-colors"
              >
                <History className="h-4 w-4" />
                Saved Scans ({savedScans.length})
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {scanHook.status === "failed" && (
          <div className="mb-6 flex items-center space-x-2 p-4 bg-support-01 text-white rounded">
            <AlertTriangle className="h-5 w-5" />
            <span className="carbon-type-body-01">{scanHook.error}</span>
          </div>
        )}

        {/* Metrics Grid */}
        {displayResult && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
            {metrics.map((metric, index) => (
              <MetricCard key={index} {...metric} />
            ))}
          </div>
        )}

        {/* Scan Input & Saved Scans Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Scan Configuration */}
          <div className={`${showSavedScans ? "lg:col-span-2" : "lg:col-span-3"} bg-layer-01 border border-ui-03 rounded p-6`}>
            <h3 className="carbon-type-productive-heading-02 text-text-01 mb-4">
              Scan Configuration
            </h3>
            <div className="space-y-4">
              {/* Image Name Input */}
              <div>
                <label className="block carbon-type-label-01 text-text-02 mb-2">
                  Image Name
                </label>
                <div className="relative">
                  <Package className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-03" />
                  <input
                    type="text"
                    value={imageName}
                    onChange={(e) => setImageName(e.target.value)}
                    placeholder="e.g., nginx:latest, node:14-alpine"
                    className="w-full pl-10 pr-3 py-2 bg-field-01 border border-ui-04 rounded carbon-type-body-01 text-text-01 placeholder-text-03 focus:outline-none focus:ring-2 focus:ring-interactive-01"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleStartScan();
                      }
                    }}
                  />
                </div>
              </div>

              {/* Options Row */}
              <div className="flex items-center justify-between gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-text-02">
                  <Checkbox
                    checked={forceRescan}
                    onCheckedChange={(v) => setForceRescan(Boolean(v))}
                  />
                  <span>Force rescan (ignore cache)</span>
                </label>

                {imageName.trim() && (
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center gap-2 px-3 py-1 border border-ui-04 text-text-01 rounded text-sm hover:bg-ui-01 transition-colors"
                  >
                    <Clock className="h-3 w-3" />
                    {showHistory ? "Hide" : "Show"} Jobs
                  </button>
                )}
              </div>

              {/* Scan Button */}
              <button
                onClick={handleStartScan}
                disabled={!imageName.trim() || scanHook.status === "loading"}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded carbon-type-body-01 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {scanHook.status === "loading" ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Start Security Scan
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Saved Scans Quick Access */}
          {showSavedScans && (
            <div className="bg-layer-01 border border-ui-03 rounded p-6">
              <h3 className="carbon-type-productive-heading-02 text-text-01 mb-4">
                Recent Scans
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {savedScans
                  .filter(scan => scan.digest) // Only show scans with valid data
                  .slice(0, 5)
                  .map((scan, idx) => {
                    // Use digest as a unique identifier since image_name might be empty
                    const displayName = scan.image_name || scan.digest.substring(0, 19);
                    const [imageName, tag] = displayName.includes(':')
                      ? displayName.split(':', 2)
                      : [displayName, 'latest'];

                    // Format the scan time, or use current time as fallback
                    const displayTime = scan.scan_time || new Date().toISOString();

                    return (
                      <div
                        key={scan.digest + idx}
                        onClick={() => loadSavedScan(displayName, displayTime)}
                        className="p-3 bg-layer-02 border border-ui-03 rounded hover:border-interactive-01 cursor-pointer transition-all hover:shadow-md group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-text-01 truncate font-mono">
                              {imageName}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="px-2 py-0.5 bg-purple-500/10 text-purple-500 rounded text-xs">
                                {tag}
                              </span>
                              <span className="text-xs text-text-03">•</span>
                              <span className="text-xs text-text-02">
                                {formatDate(displayTime)}
                              </span>
                            </div>
                            <div className="mt-1">
                              <span className="px-2 py-0.5 bg-ui-03 rounded text-xs text-text-02">
                                {scan.summary.total} vulnerabilities
                              </span>
                            </div>
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Search className="h-4 w-4 text-interactive-01" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Scan Jobs History */}
        {showHistory && scanJobs.length > 0 && (
          <div className="mb-6 bg-layer-01 border border-ui-03 rounded p-6">
            <h3 className="carbon-type-productive-heading-02 text-text-01 mb-4">
              Scan Jobs - {imageName}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {scanJobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => loadJobResult(job)}
                  className={`p-3 bg-layer-02 border border-ui-03 rounded transition-all ${
                    job.status === "completed" && job.result
                      ? "cursor-pointer hover:border-interactive-01 hover:shadow-md"
                      : "opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {job.status === "completed" && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                      {job.status === "failed" && <XCircle className="h-4 w-4 text-red-500" />}
                      {job.status === "processing" && (
                        <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
                      )}
                      {job.status === "queued" && <Clock className="h-4 w-4 text-gray-500" />}
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          job.status === "completed"
                            ? "bg-green-500/10 text-green-500"
                            : job.status === "failed"
                              ? "bg-red-500/10 text-red-500"
                              : job.status === "processing"
                                ? "bg-blue-500/10 text-blue-500"
                                : "bg-gray-500/10 text-gray-500"
                        }`}
                      >
                        {job.status}
                      </span>
                    </div>
                    {job.force_rescan && (
                      <span className="px-2 py-0.5 bg-purple-500/10 text-purple-500 rounded text-xs">
                        Force
                      </span>
                    )}
                  </div>

                  {/* Show vulnerability summary if available */}
                  {job.result && job.result.summary && (
                    <div className="mb-2 flex items-center gap-2 flex-wrap">
                      {job.result.summary.critical > 0 && (
                        <span className="px-2 py-0.5 bg-red-500/10 text-red-500 rounded text-xs">
                          {job.result.summary.critical} Critical
                        </span>
                      )}
                      {job.result.summary.high > 0 && (
                        <span className="px-2 py-0.5 bg-orange-500/10 text-orange-500 rounded text-xs">
                          {job.result.summary.high} High
                        </span>
                      )}
                      {job.result.summary.total === 0 && (
                        <span className="px-2 py-0.5 bg-green-500/10 text-green-500 rounded text-xs flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          Clean
                        </span>
                      )}
                    </div>
                  )}

                  <div className="text-xs text-text-02 font-mono truncate">
                    {job.id.substring(0, 24)}...
                  </div>
                  <div className="text-xs text-text-03 mt-1">
                    {formatDateTime(job.start_time)}
                  </div>

                  {job.result && job.result.scan_duration && (
                    <div className="text-xs text-text-03 mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {job.result.scan_duration}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {scanHook.status === "loading" && (
          <div className="bg-layer-01 border border-ui-03 rounded p-8 text-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                <div className="h-16 w-16 border-4 border-purple-600/20 rounded-full" />
                <div className="absolute inset-0 h-16 w-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
              </div>
              <div>
                <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                  Scanning Image
                </h3>
                <p className="carbon-type-body-01 text-text-02">
                  {scanHook.progress || "Processing..."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Clean Scan Message */}
        {displayResult && displayResult.summary.total === 0 && (
          <div className="bg-green-500/10 border-2 border-green-500 rounded-lg p-8">
            <div className="flex items-center justify-center gap-4">
              <div className="p-3 bg-green-500 rounded-full">
                <Shield className="h-8 w-8 text-white" />
              </div>
              <div>
                <h3 className="carbon-type-productive-heading-03 text-green-500 mb-1">
                  Clean Security Scan
                </h3>
                <p className="carbon-type-body-01 text-text-02">
                  No vulnerabilities detected • Scanned in {displayResult.scan_duration}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Vulnerabilities List */}
        {displayResult && displayResult.vulnerabilities && displayResult.vulnerabilities.length > 0 && (
          <div className="bg-layer-01 border border-ui-03 rounded p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="carbon-type-productive-heading-02 text-text-01">
                Vulnerabilities ({displayResult.vulnerabilities.length})
              </h3>
              <div className="flex items-center gap-2 text-sm text-text-02">
                <Clock className="h-3 w-3" />
                <span>{displayResult.scan_duration}</span>
              </div>
            </div>
            <div className="space-y-3">
              {/* Group by severity */}
              {(["Critical", "High", "Medium", "Low", "Informational", "Unknown"] as VulnerabilitySeverity[]).map(
                (severity) => {
                  const vulns = displayResult.vulnerabilities?.filter((v) => normalizeSeverity(v.severity) === severity) || [];
                  if (vulns.length === 0) return null;

                  const isExpanded = expandedSeverity === severity;

                  return (
                    <div key={severity} className={`border-2 rounded-lg ${getSeverityBorderColor(severity)}`}>
                      <button
                        onClick={() => setExpandedSeverity(isExpanded ? null : severity)}
                        className="w-full flex items-center justify-between p-4 hover:bg-ui-01 transition-colors rounded-t-lg"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 rounded-md font-semibold text-sm ${getSeverityColor(severity)}`}>
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
                                      <span className="font-mono text-sm font-bold text-text-01">
                                        {vuln.cve}
                                      </span>
                                      {vuln.score && (
                                        <span className="px-2 py-0.5 bg-ui-03 rounded text-xs text-text-02">
                                          CVSS {vuln.score}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm text-text-01 mb-1 line-clamp-2">
                                      {vuln.title}
                                    </div>
                                    {vuln.package && (
                                      <div className="text-xs text-text-02">
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

            {/* Meta Info */}
            <div className="mt-6 pt-4 border-t border-ui-03 flex items-center justify-between text-text-03 carbon-type-helper-text-01">
              <div className="flex items-center gap-4">
                <span>Scanned: {formatDateTime(displayResult.scan_time)}</span>
                <span className="px-2 py-0.5 bg-ui-03 rounded">
                  Digest: {displayResult.digest.substring(0, 19)}...
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Vulnerability Details Dialog */}
        <Dialog open={isVulnDialogOpen} onOpenChange={setIsVulnDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Vulnerability Details
              </DialogTitle>
              <DialogDescription>Comprehensive security analysis and remediation information</DialogDescription>
            </DialogHeader>

            {selectedVuln && (
              <div className="space-y-6">
                {/* Header */}
                <div className="p-4 bg-layer-02 border-2 border-ui-03 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-xl font-bold text-text-01">{selectedVuln.cve}</span>
                    <span
                      className={`px-3 py-1 rounded-md font-semibold ${getSeverityColor(selectedVuln.severity)}`}
                    >
                      {selectedVuln.severity}
                    </span>
                  </div>
                  {selectedVuln.score && (
                    <div className="text-sm text-text-02">CVSS Score: {selectedVuln.score}</div>
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
                        <p className="font-mono text-text-01 bg-layer-02 px-3 py-2 rounded">
                          {selectedVuln.package}
                        </p>
                      </div>
                      <div>
                        <h4 className="carbon-type-label-01 text-text-02 mb-2">Version</h4>
                        <p className="font-mono text-text-01 bg-layer-02 px-3 py-2 rounded">
                          {selectedVuln.version}
                        </p>
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="carbon-type-label-01 text-text-02 mb-2">Category</h4>
                    <p className="text-text-01">{selectedVuln.category}</p>
                  </div>

                  {selectedVuln.solution && (
                    <div className="bg-green-500/10 border-2 border-green-500 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-green-500 mb-2 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Solution
                      </h4>
                      <p className="text-text-01">{selectedVuln.solution}</p>
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
