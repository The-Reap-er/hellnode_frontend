import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/ui/metric-card";
import { DataTable } from "@/components/ui/data-table";
import { Link } from "react-router-dom";
import {
  Shield,
  Container,
  AlertTriangle,
  CheckCircle,
  Activity,
  Search,
  Server,
  Loader2,
} from "lucide-react";
import { VulnerabilityResponse, ScanRecord, Vulnerability } from "@shared/api";
import { KubeconfigEntry } from "@shared/kubeconfig";
import { formatDistanceToNow } from "date-fns";

interface RecentScanData {
  name: string;
  type: string;
  status: string;
  severity: string;
  vulnerabilities: string;
  lastScan: string;
}

interface CriticalVulnData {
  cve: string;
  severity: string;
  component: string;
  description: string;
  affected: string;
}

export default function Dashboard() {
  const [vulnerabilityData, setVulnerabilityData] = useState<VulnerabilityResponse | null>(null);
  const [allScans, setAllScans] = useState<ScanRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      setError("");

      // Get valid kubeconfigs from localStorage
      const storedKubeconfigs = localStorage.getItem("kubeconfigs");
      if (!storedKubeconfigs) {
        setError("No kubeconfig files found");
        setIsLoading(false);
        return;
      }

      const kubeconfigs: KubeconfigEntry[] = JSON.parse(storedKubeconfigs);
      const validConfigs = kubeconfigs.filter((k) => k.status === "valid");

      if (validConfigs.length === 0) {
        setError("No valid kubeconfig files found");
        setIsLoading(false);
        return;
      }

      // Fetch vulnerability data and scan history
      const allClusterStatuses: any[] = [];
      const allScanRecords: ScanRecord[] = [];

      for (const config of validConfigs) {
        try {
          // Fetch cluster status and vulnerabilities
          const statusResponse = await fetch(
            `http://localhost:8080/api/v1/kubeconfigs/${config.name}/status`
          );

          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.valid && statusData.clusterStatuses) {
              allClusterStatuses.push(...statusData.clusterStatuses);

              // Fetch scan history for each context
              for (const cluster of statusData.clusterStatuses) {
                try {
                  const scanResponse = await fetch(
                    `http://localhost:8080/api/v1/kubeconfigs/${config.name}/contexts/${cluster.name}/scans`
                  );

                  if (scanResponse.ok) {
                    const scanData = await scanResponse.json();
                    if (Array.isArray(scanData)) {
                      allScanRecords.push(...scanData);
                    }
                  }
                } catch (scanError) {
                  console.error(`Error fetching scans for ${cluster.name}:`, scanError);
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching data for ${config.name}:`, error);
        }
      }

      setVulnerabilityData({
        valid: true,
        message: `Data loaded from ${validConfigs.length} kubeconfig(s)`,
        clusterStatuses: allClusterStatuses,
      });
      setAllScans(allScanRecords);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      setError("Failed to fetch dashboard data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Calculate real metrics
  const totalScans = allScans.reduce((sum, scan) => sum + (scan.total_scans || 0), 0);
  const totalClusters = vulnerabilityData?.clusterStatuses.length || 0;

  const totalImages = vulnerabilityData?.clusterStatuses.reduce(
    (sum, cluster) =>
      sum +
      cluster.nodes.reduce(
        (nodeSum: number, node: any) => nodeSum + node.containerImages.length,
        0
      ),
    0
  ) || 0;

  // Get all vulnerabilities and count critical ones
  const allVulnerabilities: Vulnerability[] = [];
  vulnerabilityData?.clusterStatuses.forEach((cluster) => {
    cluster.nodes.forEach((node: any) => {
      node.containerImages.forEach((image: any) => {
        if (image.vulnerabilities) {
          allVulnerabilities.push(...image.vulnerabilities);
        }
      });
    });
  });

  const criticalVulnCount = allVulnerabilities.filter(
    (vuln) => vuln.severity === "Critical"
  ).length;

  const metrics = [
    {
      title: "Total Scans",
      value: totalScans.toLocaleString(),
      change: isLoading ? "" : "Real data",
      changeType: "neutral" as const,
      icon: Activity,
    },
    {
      title: "Critical Vulnerabilities",
      value: criticalVulnCount.toString(),
      change: isLoading ? "" : "Across all clusters",
      changeType: criticalVulnCount > 0 ? ("negative" as const) : ("positive" as const),
      icon: AlertTriangle,
    },
    {
      title: "Docker Images",
      value: totalImages.toLocaleString(),
      change: isLoading ? "" : "Total monitored",
      changeType: "neutral" as const,
      icon: Container,
    },
    {
      title: "K8s Clusters",
      value: totalClusters.toString(),
      change: isLoading ? "" : "Connected clusters",
      changeType: "neutral" as const,
      icon: Shield,
    },
  ];

  // Generate recent scans from real data
  const recentScans: RecentScanData[] = allScans
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .slice(0, 5)
    .map((scan) => {
      const cluster = vulnerabilityData?.clusterStatuses.find(c => c.name === scan.context);
      const totalVulns = cluster?.nodes.reduce((sum: number, node: any) =>
        sum + node.containerImages.reduce((imgSum: number, img: any) =>
          imgSum + (img.vulnerabilities?.length || 0), 0), 0) || 0;

      const maxSeverity = cluster?.nodes.reduce((maxSev: string, node: any) => {
        const nodeSeverity = node.containerImages.reduce((max: string, img: any) => {
          if (!img.vulnerabilities) return max;
          const severities = img.vulnerabilities.map((v: any) => v.severity);
          if (severities.includes("Critical")) return "Critical";
          if (severities.includes("High") && max !== "Critical") return "High";
          if (severities.includes("Medium") && !["Critical", "High"].includes(max)) return "Medium";
          if (severities.includes("Low") && max === "Low") return "Low";
          return max;
        }, "Low");

        if (nodeSeverity === "Critical") return "Critical";
        if (nodeSeverity === "High" && maxSev !== "Critical") return "High";
        if (nodeSeverity === "Medium" && !["Critical", "High"].includes(maxSev)) return "Medium";
        return maxSev;
      }, "Low") || "Low";

      return {
        name: scan.context,
        type: "Kubernetes Cluster",
        status: scan.status === "completed" ? "Completed" : scan.status === "running" ? "Running" : "Failed",
        severity: maxSeverity,
        vulnerabilities: totalVulns.toString(),
        lastScan: formatDistanceToNow(new Date(scan.started_at), { addSuffix: true }),
      };
    });

  const tableColumns = [
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "severity", label: "Severity" },
    { key: "vulnerabilities", label: "Vulnerabilities" },
    { key: "lastScan", label: "Last Scan" },
  ];

  // Generate critical vulnerabilities from real data
  const criticalVulnerabilities: CriticalVulnData[] = allVulnerabilities
    .filter((vuln) => vuln.severity === "Critical" || vuln.severity === "High")
    .slice(0, 10)
    .map((vuln) => {
      // Find which clusters/images this vulnerability affects
      const affectedAssets: string[] = [];
      vulnerabilityData?.clusterStatuses.forEach((cluster) => {
        cluster.nodes.forEach((node: any) => {
          node.containerImages.forEach((image: any) => {
            if (image.vulnerabilities?.some((v: any) => v.id === vuln.id)) {
              affectedAssets.push(`${cluster.name}/${image.name}`);
            }
          });
        });
      });

      return {
        cve: vuln.cve || vuln.id,
        severity: vuln.severity,
        component: vuln.category || "Unknown",
        description: vuln.description.length > 80
          ? vuln.description.substring(0, 80) + "..."
          : vuln.description,
        affected: affectedAssets.length > 0
          ? affectedAssets.slice(0, 2).join(", ") + (affectedAssets.length > 2 ? "..." : "")
          : "Unknown",
      };
    });

  const vulnerabilityColumns = [
    { key: "cve", label: "CVE ID" },
    { key: "severity", label: "Severity" },
    { key: "component", label: "Component" },
    { key: "description", label: "Description" },
    { key: "affected", label: "Affected Assets" },
  ];

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="col-span-full">
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-interactive-01" />
              <div>
                <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                  Loading Dashboard
                </h3>
                <p className="carbon-type-body-01 text-text-02">
                  Fetching data from your Kubernetes clusters...
                </p>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="col-span-full">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2">
                Security Dashboard
              </h1>
              <p className="carbon-type-body-02 text-text-02">
                Monitor and manage security vulnerabilities across your Kubernetes
                clusters and Docker images
              </p>
            </div>
            <button
              onClick={fetchDashboardData}
              className="flex items-center space-x-2 px-4 py-2 border border-ui-04 text-text-01 rounded carbon-type-body-01 hover:bg-ui-01 transition-colors"
            >
              <Activity className="h-4 w-4" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 flex items-center space-x-2 p-4 bg-support-01 text-white rounded">
            <AlertTriangle className="h-5 w-5" />
            <span className="carbon-type-body-01">{error}</span>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {metrics.map((metric, index) => (
            <MetricCard key={index} {...metric} />
          ))}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Scans */}
          <div className="lg:col-span-2">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="carbon-type-productive-heading-03 text-text-01">
                  Recent Scans
                </h2>
                <Link
                  to="/scanning"
                  className="flex items-center space-x-2 px-4 py-2 bg-interactive-01 text-white rounded carbon-type-body-01 hover:bg-interactive-03 transition-colors"
                >
                  <Search className="h-4 w-4" />
                  <span>New Scan</span>
                </Link>
              </div>
              {recentScans.length > 0 ? (
                <DataTable columns={tableColumns} data={recentScans} />
              ) : (
                <div className="bg-layer-01 border border-ui-03 rounded p-8 text-center">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ui-03">
                      <Activity className="h-6 w-6 text-text-02" />
                    </div>
                    <div>
                      <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                        No Recent Scans
                      </h3>
                      <p className="carbon-type-body-01 text-text-02 mb-4">
                        Start scanning your clusters to see scan history here.
                      </p>
                      <Link
                        to="/scanning"
                        className="inline-flex items-center space-x-2 px-4 py-2 bg-interactive-01 text-white rounded carbon-type-body-01 hover:bg-interactive-03 transition-colors"
                      >
                        <Search className="h-4 w-4" />
                        <span>Start Scanning</span>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions & Stats */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-layer-01 border border-ui-03 rounded p-6">
              <h3 className="carbon-type-productive-heading-02 text-text-01 mb-4">
                Quick Actions
              </h3>
              <div className="space-y-3">
                <Link
                  to="/docker"
                  className="w-full flex items-center space-x-3 p-3 bg-ui-01 hover:bg-ui-03 rounded transition-colors text-left"
                >
                  <Container className="h-5 w-5 text-interactive-01" />
                  <div>
                    <p className="carbon-type-body-01 text-text-01">
                      View Docker Images
                    </p>
                    <p className="carbon-type-label-01 text-text-02">
                      Browse container images across clusters
                    </p>
                  </div>
                </Link>
                <Link
                  to="/kubernetes"
                  className="w-full flex items-center space-x-3 p-3 bg-ui-01 hover:bg-ui-03 rounded transition-colors text-left"
                >
                  <Shield className="h-5 w-5 text-interactive-01" />
                  <div>
                    <p className="carbon-type-body-01 text-text-01">
                      Manage Kubeconfigs
                    </p>
                    <p className="carbon-type-label-01 text-text-02">
                      Upload and manage cluster configurations
                    </p>
                  </div>
                </Link>
                <Link
                  to="/vulnerabilities"
                  className="w-full flex items-center space-x-3 p-3 bg-ui-01 hover:bg-ui-03 rounded transition-colors text-left"
                >
                  <AlertTriangle className="h-5 w-5 text-interactive-01" />
                  <div>
                    <p className="carbon-type-body-01 text-text-01">
                      View Vulnerabilities
                    </p>
                    <p className="carbon-type-label-01 text-text-02">
                      Analyze security issues across clusters
                    </p>
                  </div>
                </Link>
              </div>
            </div>

          </div>
        </div>

        {/* Critical Vulnerabilities */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="carbon-type-productive-heading-03 text-text-01">
              Critical Vulnerabilities
            </h2>
            <Link
              to="/vulnerabilities"
              className="carbon-type-body-01 text-interactive-01 hover:text-interactive-03"
            >
              View all vulnerabilities →
            </Link>
          </div>
          {criticalVulnerabilities.length > 0 ? (
            <DataTable
              columns={vulnerabilityColumns}
              data={criticalVulnerabilities}
            />
          ) : (
            <div className="bg-layer-01 border border-ui-03 rounded p-8 text-center">
              <div className="flex flex-col items-center space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-support-02">
                  <CheckCircle className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                    No Critical Vulnerabilities
                  </h3>
                  <p className="carbon-type-body-01 text-text-02">
                    {allVulnerabilities.length === 0
                      ? "No vulnerability data available. Run a scan to analyze your clusters."
                      : "Great! No critical or high severity vulnerabilities found in your clusters."
                    }
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
