import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/ui/metric-card";
import {
  Radar,
  Play,
  Pause,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Server,
  Activity,
  Clock,
  Package,
  Loader2,
} from "lucide-react";
import { VulnerabilityResponse, ClusterVulnerabilityStatus } from "@shared/api";
import { Badge } from "@/components/ui/badge";

interface ScanStatus {
  contextName: string;
  isScanning: boolean;
  lastScanned: Date | null;
  error?: string;
}

export default function Scanning() {
  const [vulnerabilityData, setVulnerabilityData] =
    useState<VulnerabilityResponse | null>(null);
  const [scanStatuses, setScanStatuses] = useState<Map<string, ScanStatus>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchContextData = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(
        "http://localhost:8080/api/v1/kubeconfigs/jesus/status",
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setVulnerabilityData(data);
      setLastUpdated(new Date());

      // Initialize scan statuses for each cluster if not already present
      const newScanStatuses = new Map(scanStatuses);
      data.clusterStatuses.forEach((cluster: ClusterVulnerabilityStatus) => {
        if (!newScanStatuses.has(cluster.name)) {
          newScanStatuses.set(cluster.name, {
            contextName: cluster.name,
            isScanning: false,
            lastScanned: null,
          });
        }
      });
      setScanStatuses(newScanStatuses);
    } catch (error) {
      console.error("Error fetching context data:", error);
      setError("Failed to fetch context data from the backend");
    } finally {
      setIsLoading(false);
    }
  };

  const startScan = async (contextName: string) => {
    try {
      // Update scan status to indicate scanning
      const newScanStatuses = new Map(scanStatuses);
      newScanStatuses.set(contextName, {
        ...newScanStatuses.get(contextName)!,
        isScanning: true,
        error: undefined,
      });
      setScanStatuses(newScanStatuses);

      const response = await fetch(
        `http://localhost:8080/api/v1/kubeconfigs/jesus/contexts/${contextName}/scan`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Scan request failed: ${response.status}`);
      }

      // Mark scan as completed when server responds
      const finalScanStatuses = new Map(scanStatuses);
      finalScanStatuses.set(contextName, {
        ...finalScanStatuses.get(contextName)!,
        isScanning: false,
        lastScanned: new Date(),
        error: undefined,
      });
      setScanStatuses(finalScanStatuses);
    } catch (error) {
      console.error(`Error starting scan for ${contextName}:`, error);

      // Update scan status to show error
      const newScanStatuses = new Map(scanStatuses);
      newScanStatuses.set(contextName, {
        ...newScanStatuses.get(contextName)!,
        isScanning: false,
        error: error instanceof Error ? error.message : "Failed to start scan",
      });
      setScanStatuses(newScanStatuses);
    }
  };

  useEffect(() => {
    fetchContextData();
  }, []);

  // Calculate metrics
  const totalContexts = vulnerabilityData?.clusterStatuses.length || 0;
  const activeScans = Array.from(scanStatuses.values()).filter(
    (status) => status.isScanning,
  ).length;
  const completedScans = Array.from(scanStatuses.values()).filter(
    (status) => status.lastScanned,
  ).length;
  const totalImages =
    vulnerabilityData?.clusterStatuses.reduce(
      (sum, cluster) =>
        sum +
        cluster.nodes.reduce(
          (nodeSum, node) => nodeSum + node.containerImages.length,
          0,
        ),
      0,
    ) || 0;

  const metrics = [
    {
      title: "Available Contexts",
      value: totalContexts.toString(),
      change: "",
      changeType: "neutral" as const,
      icon: Server,
    },
    {
      title: "Active Scans",
      value: activeScans.toString(),
      change: activeScans > 0 ? "Scanning in progress" : "Ready to scan",
      changeType:
        activeScans > 0 ? ("neutral" as const) : ("positive" as const),
      icon: Radar,
    },
    {
      title: "Completed Scans",
      value: completedScans.toString(),
      change: "Total scanned",
      changeType: "neutral" as const,
      icon: CheckCircle,
    },
    {
      title: "Total Images",
      value: totalImages.toString(),
      change: "",
      changeType: "neutral" as const,
      icon: Package,
    },
  ];

  const getScanStatusBadge = (status: ScanStatus) => {
    if (status.isScanning) {
      return (
        <Badge className="bg-blue-500 text-white">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Scanning
        </Badge>
      );
    }

    if (status.error) {
      return (
        <Badge className="bg-red-500 text-white">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Error
        </Badge>
      );
    }

    if (status.lastScanned) {
      const timeDiff = new Date().getTime() - status.lastScanned.getTime();
      const hours = Math.floor(timeDiff / 3600000);
      const timeAgo = hours < 1 ? "Completed" : `${hours}h ago`;

      return (
        <Badge className="bg-green-500 text-white">
          <CheckCircle className="h-3 w-3 mr-1" />
          {timeAgo}
        </Badge>
      );
    }

    return (
      <Badge className="bg-gray-500 text-white">
        <Clock className="h-3 w-3 mr-1" />
        Never scanned
      </Badge>
    );
  };

  const startAllScans = async () => {
    if (!vulnerabilityData) return;

    // Start scans for all contexts concurrently
    const scanPromises = vulnerabilityData.clusterStatuses.map((cluster) => {
      const status = scanStatuses.get(cluster.name);
      if (!status?.isScanning && cluster.reachable) {
        return startScan(cluster.name);
      }
      return Promise.resolve();
    });

    await Promise.all(scanPromises);
  };

  return (
    <DashboardLayout>
      <div className="col-span-full">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2">
                Security Scanning
              </h1>
              <p className="carbon-type-body-02 text-text-02">
                Initiate background vulnerability scans across your Kubernetes
                contexts
              </p>
              {lastUpdated && (
                <p className="carbon-type-label-01 text-text-03 flex items-center space-x-1 mt-2">
                  <Activity className="h-3 w-3" />
                  <span>Last updated: {lastUpdated.toLocaleString()}</span>
                </p>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={startAllScans}
                disabled={isLoading || activeScans > 0}
                className="flex items-center space-x-2 px-4 py-2 border border-ui-04 text-text-01 rounded carbon-type-body-01 hover:bg-ui-01 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Radar className="h-4 w-4" />
                <span>Scan All Contexts</span>
              </button>
              <button
                onClick={fetchContextData}
                disabled={isLoading}
                className="flex items-center space-x-2 px-4 py-2 bg-interactive-01 text-white rounded carbon-type-body-01 hover:bg-interactive-03 transition-colors"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
                <span>Refresh</span>
              </button>
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

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {metrics.map((metric, index) => (
            <MetricCard key={index} {...metric} />
          ))}
        </div>

        {isLoading && !vulnerabilityData ? (
          <div className="bg-layer-01 border border-ui-03 rounded p-8 text-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin h-8 w-8 border-2 border-interactive-01 border-t-transparent rounded-full" />
              <div>
                <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                  Loading Contexts
                </h3>
                <p className="carbon-type-body-01 text-text-02">
                  Fetching available Kubernetes contexts...
                </p>
              </div>
            </div>
          </div>
        ) : vulnerabilityData?.clusterStatuses.length === 0 ? (
          <div className="bg-layer-01 border border-ui-03 rounded p-8 text-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ui-03">
                <Server className="h-6 w-6 text-text-02" />
              </div>
              <div>
                <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                  No Contexts Available
                </h3>
                <p className="carbon-type-body-01 text-text-02 mb-4">
                  Configure your Kubernetes contexts first to enable scanning.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Context Cards */}
            <div>
              <h3 className="carbon-type-productive-heading-03 text-text-01 mb-4">
                Available Contexts ({vulnerabilityData?.clusterStatuses.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vulnerabilityData?.clusterStatuses.map((cluster) => {
                  const scanStatus = scanStatuses.get(cluster.name) || {
                    contextName: cluster.name,
                    isScanning: false,
                    lastScanned: null,
                  };
                  const totalImages = cluster.nodes.reduce(
                    (sum, node) => sum + node.containerImages.length,
                    0,
                  );

                  return (
                    <div
                      key={cluster.name}
                      className="bg-layer-01 border border-ui-03 rounded p-6 hover:bg-layer-02 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded bg-interactive-01">
                            <Server className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h4 className="carbon-type-productive-heading-02 text-text-01">
                              {cluster.name}
                            </h4>
                            <p className="carbon-type-label-01 text-text-02">
                              {cluster.nodes.length} node
                              {cluster.nodes.length !== 1 ? "s" : ""} •{" "}
                              {totalImages} images
                            </p>
                          </div>
                        </div>
                        {getScanStatusBadge(scanStatus)}
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-text-02">Server:</span>
                          <span className="text-text-01 font-mono text-xs">
                            {cluster.server.replace("https://", "")}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-text-02">Status:</span>
                          <span
                            className={`flex items-center space-x-1 ${cluster.reachable ? "text-support-02" : "text-support-01"}`}
                          >
                            {cluster.reachable ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <AlertTriangle className="h-3 w-3" />
                            )}
                            <span>
                              {cluster.reachable ? "Online" : "Offline"}
                            </span>
                          </span>
                        </div>
                      </div>

                      {scanStatus.error && (
                        <div className="mb-4 p-3 bg-support-01 text-white rounded text-sm">
                          <div className="flex items-center space-x-2">
                            <AlertTriangle className="h-4 w-4" />
                            <span>{scanStatus.error}</span>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => startScan(cluster.name)}
                        disabled={scanStatus.isScanning || !cluster.reachable}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-interactive-01 text-white rounded carbon-type-body-01 hover:bg-interactive-03 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {scanStatus.isScanning ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Scanning...</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" />
                            <span>Start Scan</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
