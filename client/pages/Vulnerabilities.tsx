import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/ui/metric-card";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Shield,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  TrendingUp,
  Package,
  Server,
  Activity,
  Bug,
  Search,
  Filter,
  Download,
  Eye,
  ExternalLink,
  X,
  Calendar,
  Info,
  Send,
  FileDown,
} from "lucide-react";
import {
  VulnerabilityResponse,
  Vulnerability,
  ContainerImage,
  ClusterVulnerabilityStatus,
} from "@shared/api";
import { KubeconfigEntry } from "@shared/kubeconfig";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ClusterVulnerabilityDonut } from "@/components/charts/ClusterVulnerabilityDonut";

export default function Vulnerabilities() {
  const [vulnerabilityData, setVulnerabilityData] =
    useState<VulnerabilityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [selectedCluster, setSelectedCluster] = useState("all");
  const [selectedVulnerability, setSelectedVulnerability] = useState<
    | (Vulnerability & {
        clusters: Array<{ clusterName: string; containerName: string }>;
        image: string;
      })
    | null
  >(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportCluster, setExportCluster] = useState<string | null>(null);
  const [clusterToKubeconfig, setClusterToKubeconfig] = useState<
    Map<string, string>
  >(new Map());
  const location = useLocation();

  const fetchVulnerabilityData = async () => {
    setIsLoading(true);
    setError("");

    try {
      // Get valid kubeconfigs from localStorage
      const storedKubeconfigs = localStorage.getItem("kubeconfigs");
      if (!storedKubeconfigs) {
        setError(
          "No kubeconfig files found. Please upload a kubeconfig first.",
        );
        setIsLoading(false);
        return;
      }

      const kubeconfigs: KubeconfigEntry[] = JSON.parse(storedKubeconfigs);
      const validConfigs = kubeconfigs.filter((k) => k.status === "valid");

      if (validConfigs.length === 0) {
        setError(
          "No valid kubeconfig files found. Please upload a valid kubeconfig.",
        );
        setIsLoading(false);
        return;
      }

      // Fetch data from all valid kubeconfigs
      const allClusterStatuses: any[] = [];
      const clusterMap = new Map<string, string>();
      let hasValidData = false;

      for (const config of validConfigs) {
        try {
          const response = await fetch(
            `http://localhost:8080/api/v1/kubeconfigs/${config.name}/status`,
          );

          if (response.ok) {
            const data = await response.json();
            if (data.valid && data.clusterStatuses) {
              data.clusterStatuses.forEach((cs: any) => {
                allClusterStatuses.push(cs);
                clusterMap.set(cs.name, config.name);
              });
              hasValidData = true;
            }
          }
        } catch (error) {
          console.error(`Error fetching data for ${config.name}:`, error);
        }
      }

      if (!hasValidData) {
        setError("Failed to fetch vulnerability data from any kubeconfig");
        setIsLoading(false);
        return;
      }

      // Transform the combined data
      const transformedData: VulnerabilityResponse = {
        valid: true,
        message: `Data loaded from ${validConfigs.length} kubeconfig(s)`,
        clusterStatuses: allClusterStatuses.map((cluster: any) => ({
          name: cluster.name,
          server: cluster.server,
          reachable: cluster.reachable,
          nodes: cluster.nodes.map((node: any) => ({
            name: node.name,
            kubeletVersion: node.kubeletVersion,
            containerImages: node.containerImages.map((image: any) => ({
              name: image.name,
              image: image.image,
              vulnerabilities: image.vulnerabilities || [],
            })),
          })),
          apiVersions: cluster.apiVersions,
          permissions: cluster.permissions,
        })),
      };

      setVulnerabilityData(transformedData);
      setClusterToKubeconfig(clusterMap);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching vulnerability data:", error);
      setError("Failed to fetch vulnerability data from the backend");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVulnerabilityData();
  }, []);

  // Apply preset filters from URL (e.g., ?image=...)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const imagePreset = params.get("image");
    if (imagePreset) {
      setSearchTerm(imagePreset);
    }
  }, [location.search]);

  // Calculate metrics - deduplicate vulnerabilities and group by clusters
  const getAllVulnerabilities = (): Array<
    Vulnerability & {
      clusters: Array<{ clusterName: string; containerName: string }>;
      image: string;
    }
  > => {
    if (!vulnerabilityData) return [];

    const vulnMap = new Map<
      string,
      Vulnerability & {
        clusters: Array<{ clusterName: string; containerName: string }>;
        image: string;
      }
    >();

    vulnerabilityData.clusterStatuses.forEach((cluster) => {
      cluster.nodes.forEach((node) => {
        node.containerImages.forEach((container) => {
          if (container.vulnerabilities) {
            container.vulnerabilities.forEach((vuln) => {
              // Create a unique key for each vulnerability based on CVE + image
              const key = `${vuln.cve}-${container.image}`;

              if (vulnMap.has(key)) {
                // Add cluster info to existing vulnerability
                const existing = vulnMap.get(key)!;
                const clusterExists = existing.clusters.some(
                  (c) =>
                    c.clusterName === cluster.name &&
                    c.containerName === container.name,
                );
                if (!clusterExists) {
                  existing.clusters.push({
                    clusterName: cluster.name,
                    containerName: container.name,
                  });
                }
              } else {
                // Create new vulnerability entry
                vulnMap.set(key, {
                  ...vuln,
                  clusters: [
                    {
                      clusterName: cluster.name,
                      containerName: container.name,
                    },
                  ],
                  image: container.image,
                });
              }
            });
          }
        });
      });
    });

    return Array.from(vulnMap.values());
  };

  const allVulnerabilities = getAllVulnerabilities();

  // Sort vulnerabilities by severity (Critical > High > Medium > Low)
  const getSeverityOrder = (severity: string): number => {
    switch (severity) {
      case "Critical":
        return 0;
      case "High":
        return 1;
      case "Medium":
        return 2;
      case "Low":
        return 3;
      default:
        return 4;
    }
  };

  const sortedVulnerabilities = allVulnerabilities.sort((a, b) => {
    const orderA = getSeverityOrder(a.severity);
    const orderB = getSeverityOrder(b.severity);
    return orderA - orderB;
  });

  // Filter vulnerabilities
  const filteredVulnerabilities = sortedVulnerabilities.filter((vuln) => {
    const matchesSearch =
      vuln.cve.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vuln.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vuln.clusters.some((cluster) =>
        cluster.containerName.toLowerCase().includes(searchTerm.toLowerCase()),
      ) ||
      vuln.image.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSeverity =
      severityFilter === "all" || vuln.severity === severityFilter;
    const matchesCluster =
      selectedCluster === "all" ||
      vuln.clusters.some((cluster) => cluster.clusterName === selectedCluster);

    return matchesSearch && matchesSeverity && matchesCluster;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "Critical":
        return "bg-support-01 text-white";
      case "High":
        return "bg-orange-500 text-white";
      case "Medium":
        return "bg-yellow-500 text-black";
      case "Low":
        return "bg-sky-400 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const criticalCount = allVulnerabilities.filter(
    (v) => v.severity === "Critical",
  ).length;
  const highCount = allVulnerabilities.filter(
    (v) => v.severity === "High",
  ).length;
  const mediumCount = allVulnerabilities.filter(
    (v) => v.severity === "Medium",
  ).length;
  const lowCount = allVulnerabilities.filter(
    (v) => v.severity === "Low",
  ).length;

  const metrics = [
    {
      title: "Total Vulnerabilities",
      value: allVulnerabilities.length.toString(),
      change: "",
      changeType: "neutral" as const,
      icon: Bug,
    },
    {
      title: "Critical & High",
      value: (criticalCount + highCount).toString(),
      change: "",
      changeType: "neutral" as const,
      icon: AlertTriangle,
    },
    {
      title: "Affected Images",
      value: new Set(allVulnerabilities.map((v) => v.image)).size.toString(),
      change: "",
      changeType: "neutral" as const,
      icon: Package,
    },
    {
      title: "Clusters Scanned",
      value: vulnerabilityData?.clusterStatuses.length.toString() || "0",
      change: "",
      changeType: "neutral" as const,
      icon: Server,
    },
  ];

  const vulnerabilityColumns = [
    {
      key: "severity",
      label: "Severity",
      render: (value: string) => (
        <Badge className={"px-2 py-0.5 border border-ui-04 rounded " + getSeverityColor(value)}>
          {value}
        </Badge>
      ),
    },
    { key: "cve", label: "CVE ID" },
    { key: "image", label: "Image" },
    {
      key: "clusters",
      label: "Affected Clusters",
      render: (
        value: Array<{ clusterName: string; containerName: string }>,
      ) => (
        <div className="flex flex-wrap gap-1">
          {value.slice(0, 3).map((cluster, index) => (
            <span
              key={index}
              className="inline-flex items-center px-2 py-1 rounded bg-ui-03 text-text-01 carbon-type-label-01 text-xs"
            >
              {cluster.clusterName}
            </span>
          ))}
          {value.length > 3 && (
            <span className="inline-flex items-center px-2 py-1 rounded bg-ui-04 text-text-01 carbon-type-label-01 text-xs">
              +{value.length - 3} more
            </span>
          )}
        </div>
      ),
    },
    {
      key: "solution",
      label: "Solution",
      render: (value: string) => (
        <span className="text-sm text-text-02">
          {value || "No solution available"}
        </span>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="col-span-full">
        {/* Export Report Modal */}
        <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Export Report</DialogTitle>
              <DialogDescription>
                {exportCluster
                  ? "Choose where to send the report"
                  : "Select a cluster to export a report for"}
              </DialogDescription>
            </DialogHeader>

            {!exportCluster ? (
              <div className="space-y-3">
                <label className="carbon-type-body-01 text-text-02">
                  Cluster
                </label>
                <Select
                  value={exportCluster ?? undefined}
                  onValueChange={setExportCluster}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a cluster" />
                  </SelectTrigger>
                  <SelectContent>
                    {vulnerabilityData?.clusterStatuses.map((cluster) => (
                      <SelectItem key={cluster.name} value={cluster.name}>
                        {cluster.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card
                  onClick={async () => {
                    if (!exportCluster) return;
                    const kubeconfig = clusterToKubeconfig.get(exportCluster);
                    if (!kubeconfig) {
                      toast({
                        title: "Cluster not found",
                        description:
                          "Unable to map selected cluster to kubeconfig.",
                        variant: "destructive" as any,
                      });
                      return;
                    }
                    try {
                      const res = await fetch(
                        `http://localhost:8080/api/v1/kubeconfigs/${encodeURIComponent(kubeconfig)}/defect-report`,
                        { method: "POST" },
                      );
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      toast({
                        title: "Sent to DefectDojo",
                        description: `${exportCluster} report queued.`,
                      });
                      setIsExportOpen(false);
                    } catch (e) {
                      toast({
                        title: "Failed to send",
                        description:
                          e instanceof Error ? e.message : "Unknown error",
                        variant: "destructive" as any,
                      });
                    }
                  }}
                  className="cursor-pointer bg-ui-01 border border-ui-03 hover:bg-layer-01 hover:border-interactive-01 transition-colors"
                >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-text-01">
                      <Send className="h-4 w-4" /> DefectDojo
                    </CardTitle>
                    <CardDescription className="text-text-02">
                      Send the report to DefectDojo
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card
                  onClick={async () => {
                    if (!exportCluster) return;
                    const kubeconfig = clusterToKubeconfig.get(exportCluster);
                    if (!kubeconfig) {
                      toast({
                        title: "Cluster not found",
                        description:
                          "Unable to map selected cluster to kubeconfig.",
                        variant: "destructive" as any,
                      });
                      return;
                    }
                    try {
                      const res = await fetch(
                        `http://localhost:8080/api/v1/kubeconfigs/${encodeURIComponent(kubeconfig)}/pdf-report`,
                        { method: "POST" },
                      );
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${exportCluster}-vulnerabilities.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                      toast({
                        title: "PDF downloading",
                        description: `${exportCluster} report generated.`,
                      });
                      setIsExportOpen(false);
                    } catch (e) {
                      toast({
                        title: "PDF export failed",
                        description:
                          e instanceof Error ? e.message : "Unknown error",
                        variant: "destructive" as any,
                      });
                    }
                  }}
                  className="cursor-pointer bg-ui-01 border border-ui-03 hover:bg-layer-01 hover:border-interactive-01 transition-colors"
                >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-text-01">
                      <FileDown className="h-4 w-4" /> PDF Report
                    </CardTitle>
                    <CardDescription className="text-text-02">
                      Download a PDF report
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            )}

            <div className="mt-4 flex justify-between">
              <Button
                variant="outline"
                onClick={() =>
                  exportCluster
                    ? setExportCluster(null)
                    : setIsExportOpen(false)
                }
              >
                {exportCluster ? "Back" : "Close"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2">
                Vulnerability Management
              </h1>
              <p className="carbon-type-body-02 text-text-02">
                Comprehensive view of all security vulnerabilities across your
                infrastructure with risk prioritization and remediation tracking
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
                onClick={() => {
                  setIsExportOpen(true);
                  setExportCluster(null);
                }}
                className="flex items-center space-x-2 px-4 py-2 border border-ui-04 text-text-01 rounded carbon-type-body-01 hover:bg-ui-01 transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>Export Report</span>
              </button>
              <button
                onClick={fetchVulnerabilityData}
                disabled={isLoading}
                className="flex items-center space-x-2 px-4 py-2 bg-interactive-01 text-white rounded carbon-type-body-01 hover:bg-interactive-03 transition-colors"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
                <span>Refresh Scan</span>
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

        {/* Severity Distribution */}
        <div className="mb-8">
          <div className="bg-layer-01 border border-ui-03 rounded p-6">
            <h3 className="carbon-type-productive-heading-02 text-text-01 mb-4">
              Vulnerability Severity Distribution
            </h3>
            {(() => {
              const total = criticalCount + highCount + mediumCount + lowCount;
              const entries = [
                { key: "Critical", color: "bg-support-01", value: criticalCount },
                { key: "High", color: "bg-orange-500", value: highCount },
                { key: "Medium", color: "bg-yellow-500", value: mediumCount },
                { key: "Low", color: "bg-sky-400", value: lowCount },
              ];
              return (
                <div className="space-y-3">
                  <div className="w-full h-3 flex overflow-hidden border border-ui-03 bg-layer-02 rounded">
                    {entries.map((e) => (
                      <div
                        key={e.key}
                        className={`${e.color}`}
                        style={{ width: `${total ? (e.value / total) * 100 : 0}%` }}
                        title={`${e.key}: ${e.value}`}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    {entries.map((e) => (
                      <div key={e.key} className="flex items-center gap-2">
                        <span className={`inline-block h-3 w-3 rounded ${e.color}`} />
                        <span className="text-text-02">{e.key}:</span>
                        <span className="text-text-01 font-medium">{e.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Per-Cluster Vulnerabilities */}
        {vulnerabilityData && vulnerabilityData.clusterStatuses.length > 0 && (
          <div className="mb-8">
            <div className="bg-layer-01 border border-ui-03 rounded p-6">
              <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                Vulnerabilities by Cluster
              </h3>
              <p className="carbon-type-body-01 text-text-02 mb-4">
                Each chart shows the distribution of severities per cluster using a stacked bar. The label below shows counts.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {vulnerabilityData.clusterStatuses.map((cluster) => (
                  <div
                    key={cluster.name}
                    className="p-4 rounded border border-ui-03 bg-layer-02"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="carbon-type-productive-heading-02 text-text-01">
                        {cluster.name}
                      </div>
                    </div>
                    <ClusterVulnerabilityDonut cluster={cluster} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {isLoading && allVulnerabilities.length === 0 ? (
          <div className="bg-layer-01 border border-ui-03 rounded p-8 text-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin h-8 w-8 border-2 border-interactive-01 border-t-transparent rounded-full" />
              <div>
                <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                  Scanning for Vulnerabilities
                </h3>
                <p className="carbon-type-body-01 text-text-02">
                  Analyzing container images across all clusters...
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="mb-6">
              <div className="bg-layer-01 border border-ui-03 rounded p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center space-x-2">
                    <Search className="h-4 w-4 text-text-02" />
                    <Input
                      placeholder="Search CVE, container, or image..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-64"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Filter className="h-4 w-4 text-text-02" />
                    <Select
                      value={severityFilter}
                      onValueChange={setSeverityFilter}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Severities</SelectItem>
                        <SelectItem value="Critical">Critical</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Server className="h-4 w-4 text-text-02" />
                    <Select
                      value={selectedCluster}
                      onValueChange={setSelectedCluster}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Clusters</SelectItem>
                        {vulnerabilityData?.clusterStatuses.map((cluster) => (
                          <SelectItem key={cluster.name} value={cluster.name}>
                            {cluster.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-sm text-text-02">
                    Showing {filteredVulnerabilities.length} of{" "}
                    {allVulnerabilities.length} vulnerabilities
                  </div>
                </div>
              </div>
            </div>

            {/* Vulnerabilities Table */}
            <div>
              <h3 className="carbon-type-productive-heading-03 text-text-01 mb-4">
                All Vulnerabilities ({filteredVulnerabilities.length})
              </h3>
              {filteredVulnerabilities.length > 0 ? (
                <DataTable
                  columns={vulnerabilityColumns}
                  data={filteredVulnerabilities}
                  onRowClick={(row) => {
                    setSelectedVulnerability(
                      row as Vulnerability & {
                        clusters: Array<{
                          clusterName: string;
                          containerName: string;
                        }>;
                        image: string;
                      },
                    );
                    setIsDrawerOpen(true);
                  }}
                />
              ) : (
                <div className="bg-layer-01 border border-ui-03 rounded p-8 text-center">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ui-03">
                      <Shield className="h-6 w-6 text-text-02" />
                    </div>
                    <div>
                      <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                        No Vulnerabilities Found
                      </h3>
                      <p className="carbon-type-body-01 text-text-02">
                        {searchTerm ||
                        severityFilter !== "all" ||
                        selectedCluster !== "all"
                          ? "No vulnerabilities match your current filters."
                          : "Great! No vulnerabilities were detected in your container images."}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Vulnerability Details Drawer */}
        <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
          <SheetContent className="w-full sm:w-3/4 sm:max-w-none overflow-y-auto">
            <SheetHeader className="mb-6">
              <SheetTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-support-01" />
                <span>Vulnerability Details</span>
              </SheetTitle>
              <SheetDescription>
                Detailed information about the selected security vulnerability
              </SheetDescription>
            </SheetHeader>

            {selectedVulnerability && (
              <div className="space-y-6">
                {/* CVE Header */}
                <div className="bg-layer-02 border border-ui-03 rounded p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="carbon-type-productive-heading-02 text-text-01">
                      {selectedVulnerability.cve}
                    </h3>
                    <Badge
                      className={getSeverityColor(
                        selectedVulnerability.severity,
                      )}
                    >
                      {selectedVulnerability.severity}
                    </Badge>
                  </div>
                  <p className="carbon-type-body-01 text-text-02 mb-3">
                    {selectedVulnerability.message}
                  </p>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() =>
                        window.open(
                          `https://nvd.nist.gov/vuln/detail/${selectedVulnerability.cve}`,
                          "_blank",
                        )
                      }
                      className="flex items-center space-x-2 px-3 py-2 bg-interactive-01 text-white rounded carbon-type-body-01 hover:bg-interactive-03 transition-colors text-sm"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>View in NVD</span>
                    </button>
                  </div>
                </div>

                {/* Location Information */}
                <div className="space-y-4">
                  <h4 className="carbon-type-productive-heading-02 text-text-01">
                    Affected Locations
                  </h4>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="flex items-center justify-between py-2 border-b border-ui-03">
                      <span className="carbon-type-body-01 text-text-02">
                        Image
                      </span>
                      <span className="carbon-type-code-01 text-text-01 text-xs break-all">
                        {selectedVulnerability.image}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-ui-03">
                      <span className="carbon-type-body-01 text-text-02">
                        Category
                      </span>
                      <span className="carbon-type-body-01 text-text-01 font-medium">
                        {selectedVulnerability.category}
                      </span>
                    </div>
                    <div className="py-2">
                      <span className="carbon-type-body-01 text-text-02 mb-2 block">
                        Clusters ({selectedVulnerability.clusters.length})
                      </span>
                      <div className="space-y-2">
                        {selectedVulnerability.clusters.map(
                          (cluster, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-3 bg-layer-02 border border-ui-03 rounded"
                            >
                              <div className="flex items-center space-x-3">
                                <div className="flex h-6 w-6 items-center justify-center rounded bg-interactive-01">
                                  <Server className="h-3 w-3 text-white" />
                                </div>
                                <div>
                                  <span className="carbon-type-body-01 text-text-01 font-medium">
                                    {cluster.clusterName}
                                  </span>
                                  <div className="carbon-type-label-01 text-text-02">
                                    Container: {cluster.containerName}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-4">
                  <h4 className="carbon-type-productive-heading-02 text-text-01 flex items-center space-x-2">
                    <Info className="h-4 w-4" />
                    <span>Description</span>
                  </h4>
                  <div className="bg-layer-02 border border-ui-03 rounded p-4">
                    <p className="carbon-type-body-01 text-text-01 leading-relaxed">
                      {selectedVulnerability.description ||
                        "No detailed description available for this vulnerability."}
                    </p>
                  </div>
                </div>

                {/* Solution */}
                <div className="space-y-4">
                  <h4 className="carbon-type-productive-heading-02 text-text-01">
                    Remediation
                  </h4>
                  <div className="bg-layer-02 border border-ui-03 rounded p-4">
                    <p className="carbon-type-body-01 text-text-01">
                      {selectedVulnerability.solution ||
                        "No specific solution provided. Please refer to the CVE database for more information."}
                    </p>
                  </div>
                </div>

                {/* Additional Actions */}
                <div className="space-y-4">
                  <h4 className="carbon-type-productive-heading-02 text-text-01">
                    Actions
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        window.open(
                          `https://nvd.nist.gov/vuln/detail/${selectedVulnerability.cve}`,
                          "_blank",
                        )
                      }
                      className="flex items-center space-x-2 px-3 py-2 border border-ui-04 text-text-01 rounded carbon-type-body-01 hover:bg-ui-01 transition-colors text-sm"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>NVD Database</span>
                    </button>
                    <button
                      onClick={() =>
                        window.open(
                          `https://cve.mitre.org/cgi-bin/cvename.cgi?name=${selectedVulnerability.cve}`,
                          "_blank",
                        )
                      }
                      className="flex items-center space-x-2 px-3 py-2 border border-ui-04 text-text-01 rounded carbon-type-body-01 hover:bg-ui-01 transition-colors text-sm"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>MITRE CVE</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
}
