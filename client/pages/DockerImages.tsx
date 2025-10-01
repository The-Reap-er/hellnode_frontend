import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/ui/metric-card";
import {
  Container,
  Package,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  Server,
  Shield,
  ArrowRight,
  CheckCircle2,
  XCircle,
  MinusCircle,
  GitCompare,
} from "lucide-react";
import { KubeconfigEntry } from "@shared/kubeconfig";
import {
  ClusterStatusResponse,
  DockerImageSummary,
} from "@shared/cluster-status";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

// Local types for aggregations in this page
type Severity = "Low" | "Medium" | "High" | "Critical";

type ImageOccurrence = {
  cluster: string;
  node: string;
  containerName: string;
};

type AggregatedImageDetails = {
  image: string;
  names: string[];
  clusters: string[];
  nodes: string[];
  totalInstances: number;
  occurrences: ImageOccurrence[];
  severityCounts: Record<Severity, number>;
  cves: Array<{
    cve: string;
    severity: Severity;
    count: number; // number of occurrences across containers/nodes/clusters
    clusters: string[];
    nodes: string[];
    containers: string[];
  }>;
};

// Types for vulnerability resolution
type VulnerabilityResolutionResult = {
  image_name: string;
  original_tag: string;
  latest_tag: string;
  resolution_status: 'resolved' | 'partially_resolved' | 'unresolvable' | 'no_vulnerabilities';
  message: string;
  recommendation: string;
  original_vulnerabilities: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  };
  latest_vulnerabilities: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  };
  timestamp: string;
};

// Hook for vulnerability resolution checking
function useVulnerabilityResolution() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'completed' | 'failed'>('idle');
  const [result, setResult] = useState<VulnerabilityResolutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
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

  const startCheck = async (imageName: string) => {
    cleanup(); // Clear any existing intervals
    setStatus('loading');
    setError(null);
    setResult(null);
    setProgress('Starting vulnerability check...');

    try {
      // Start the check
      const startResponse = await fetch('http://localhost:8080/api/v2/security/image/check-resolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_name: imageName })
      });

      if (startResponse.status !== 202) {
        const errorText = await startResponse.text();
        throw new Error(`Failed to start check: ${errorText}`);
      }

      const { job_id } = await startResponse.json();
      setProgress(`Job started: ${job_id}`);

      // Poll for completion
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusResponse = await fetch(`http://localhost:8080/api/v2/security/image/resolution-status/${job_id}`);

          if (statusResponse.status === 404) {
            cleanup();
            setError('Job not found');
            setStatus('failed');
            return;
          }

          if (statusResponse.status !== 200) {
            const errorText = await statusResponse.text();
            throw new Error(`Failed to get status: ${errorText}`);
          }

          const jobStatus = await statusResponse.json();
          setProgress(jobStatus.progress || 'Processing...');

          if (jobStatus.status === 'completed') {
            setResult(jobStatus.result);
            setStatus('completed');

            // Save to localStorage
            const saved = JSON.parse(localStorage.getItem('vulnerabilityResolutions') || '{}');
            saved[imageName] = {
              result: jobStatus.result,
              timestamp: new Date().toISOString()
            };
            localStorage.setItem('vulnerabilityResolutions', JSON.stringify(saved));

            cleanup();
          } else if (jobStatus.status === 'failed') {
            setError(jobStatus.error || 'Job failed');
            setStatus('failed');
            cleanup();
          }
        } catch (err) {
          cleanup();
          setError(err instanceof Error ? err.message : 'Unknown error');
          setStatus('failed');
        }
      }, 2000);

      // Timeout after 2 minutes
      timeoutRef.current = setTimeout(() => {
        cleanup();
        setError('Timeout waiting for job completion');
        setStatus('failed');
      }, 120000);

    } catch (err) {
      cleanup();
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('failed');
    }
  };

  const reset = () => {
    cleanup();
    setStatus('idle');
    setResult(null);
    setError(null);
    setProgress('');
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => cleanup();
  }, []);

  return { status, result, error, progress, startCheck, reset };
}

export default function DockerImages() {
  const [dockerImages, setDockerImages] = useState<DockerImageSummary[]>([]);
  const [filteredImages, setFilteredImages] = useState<DockerImageSummary[]>(
    [],
  );
  const [imageDetailsMap, setImageDetailsMap] = useState<
    Map<string, AggregatedImageDetails>
  >(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [registryFilter, setRegistryFilter] = useState("all");
  const [error, setError] = useState("");
  const [clusterFilter, setClusterFilter] = useState("all");
  const [minSeverity, setMinSeverity] = useState<Severity | "all">("all");
  const [onlyWithVulns, setOnlyWithVulns] = useState(false);
  const [onlyHighCritical, setOnlyHighCritical] = useState(false);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pageSize, setPageSize] = useState(12);
  const [autoRefreshSec, setAutoRefreshSec] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Vulnerability resolution state
  const [resolutionDialogOpen, setResolutionDialogOpen] = useState(false);
  const [selectedImageForResolution, setSelectedImageForResolution] = useState<string | null>(null);
  const [cachedResolutions, setCachedResolutions] = useState<Record<string, { result: VulnerabilityResolutionResult; timestamp: string }>>({});
  const resolutionHook = useVulnerabilityResolution();

  // Load and aggregate docker images from all clusters
  useEffect(() => {
    fetchDockerImages();
  }, []);

  // Filter images based on search and filters
  useEffect(() => {
    let filtered = dockerImages;

    if (searchTerm) {
      const query = searchTerm.toLowerCase().trim();
      const tokens = query.split(/\s+/).filter(Boolean);
      filtered = filtered.filter((img) => {
        const { registry, repository, tag } = parseImage(img.image);
        const hay = [img.image, img.name, registry, repository, tag]
          .join(" ")
          .toLowerCase();
        return tokens.every((t) => hay.includes(t));
      });
    }

    if (registryFilter !== "all") {
      filtered = filtered.filter((img) => {
        const registry = img.image.split("/")[0];
        return registry.includes(registryFilter);
      });
    }

    if (clusterFilter !== "all") {
      filtered = filtered.filter((img) => img.clusters.includes(clusterFilter));
    }

    if (onlyWithVulns) {
      filtered = filtered.filter((img) => {
        const det = imageDetailsMap.get(img.image);
        if (!det) return false;
        const total = Object.values(det.severityCounts).reduce(
          (a, b) => a + b,
          0,
        );
        return total > 0;
      });
    }

    if (onlyHighCritical) {
      filtered = filtered.filter((img) => {
        const det = imageDetailsMap.get(img.image);
        if (!det) return false;
        return det.severityCounts.High + det.severityCounts.Critical > 0;
      });
    }

    if (minSeverity !== "all") {
      const order: Record<Severity, number> = {
        Critical: 0,
        High: 1,
        Medium: 2,
        Low: 3,
      };
      const threshold = order[minSeverity as Severity];
      filtered = filtered.filter((img) => {
        const det = imageDetailsMap.get(img.image);
        if (!det) return false;
        return (
          Object.entries(det.severityCounts) as Array<[Severity, number]>
        ).some(([sev, count]) => count > 0 && order[sev] <= threshold);
      });
    }

    setFilteredImages(filtered);
  }, [
    dockerImages,
    searchTerm,
    registryFilter,
    clusterFilter,
    onlyWithVulns,
    onlyHighCritical,
    minSeverity,
    imageDetailsMap,
  ]);

  // Load settings defaults and cached resolutions
  useEffect(() => {
    try {
      const raw = localStorage.getItem("appSettings");
      if (raw) {
        const s = JSON.parse(raw) as any;
        if (typeof s.imagesPageSize === "number") setPageSize(s.imagesPageSize);
        if (typeof s.imagesAutoRefresh === "number")
          setAutoRefreshSec(s.imagesAutoRefresh);
        if (typeof s.onlyWithVulnsDefault === "boolean")
          setOnlyWithVulns(s.onlyWithVulnsDefault);
        if (typeof s.onlyHighCriticalDefault === "boolean")
          setOnlyHighCritical(s.onlyHighCriticalDefault);
      }

      // Load cached resolutions
      const cachedRaw = localStorage.getItem("vulnerabilityResolutions");
      if (cachedRaw) {
        setCachedResolutions(JSON.parse(cachedRaw));
      }
    } catch {}
  }, []);

  // Auto refresh
  useEffect(() => {
    if (!autoRefreshSec || autoRefreshSec <= 0) return;
    const id = setInterval(() => {
      fetchDockerImages();
    }, autoRefreshSec * 1000);
    return () => clearInterval(id);
  }, [autoRefreshSec]);

  // Clamp current page when results change
  useEffect(() => {
    const tp = Math.max(1, Math.ceil(filteredImages.length / pageSize));
    if (currentPage > tp) setCurrentPage(tp);
  }, [filteredImages, currentPage, pageSize]);

  const fetchDockerImages = async () => {
    setIsLoading(true);
    setError("");

    try {
      const storedKubeconfigs = localStorage.getItem("kubeconfigs");
      if (!storedKubeconfigs) {
        setDockerImages([]);
        setImageDetailsMap(new Map());
        return;
      }

      const kubeconfigs: KubeconfigEntry[] = JSON.parse(storedKubeconfigs);
      const validConfigs = kubeconfigs.filter((k) => k.status === "valid");

      if (validConfigs.length === 0) {
        setDockerImages([]);
        setImageDetailsMap(new Map());
        return;
      }

      const imageMap = new Map<string, DockerImageSummary>();
      const detailsMap = new Map<string, AggregatedImageDetails>();

      for (const config of validConfigs) {
        try {
          const response = await fetch(
            `http://localhost:8080/api/v1/kubeconfigs/${config.name}/status`,
          );
          if (response.ok) {
            const data: ClusterStatusResponse & { clusterStatuses: any[] } =
              await response.json();

            if (data.valid && data.clusterStatuses) {
              data.clusterStatuses.forEach((cluster: any) => {
                cluster.nodes.forEach((node: any) => {
                  node.containerImages.forEach((container: any) => {
                    const key = container.image as string;
                    // Build summary map
                    if (imageMap.has(key)) {
                      const existing = imageMap.get(key)!;
                      existing.totalInstances++;
                      if (!existing.clusters.includes(cluster.name)) {
                        existing.clusters.push(cluster.name);
                      }
                      if (!existing.nodes.includes(node.name)) {
                        existing.nodes.push(node.name);
                      }
                    } else {
                      imageMap.set(key, {
                        image: container.image,
                        name: container.name,
                        clusters: [cluster.name],
                        nodes: [node.name],
                        totalInstances: 1,
                      });
                    }

                    // Build details map (aggregate vulnerabilities and locations)
                    const existingDetails = detailsMap.get(key);
                    if (!existingDetails) {
                      detailsMap.set(key, {
                        image: container.image,
                        names: [container.name],
                        clusters: [cluster.name],
                        nodes: [node.name],
                        totalInstances: 1,
                        occurrences: [
                          {
                            cluster: cluster.name,
                            node: node.name,
                            containerName: container.name,
                          },
                        ],
                        severityCounts: {
                          Critical: 0,
                          High: 0,
                          Medium: 0,
                          Low: 0,
                        },
                        cves: [],
                      });
                    } else {
                      if (!existingDetails.names.includes(container.name)) {
                        existingDetails.names.push(container.name);
                      }
                      if (!existingDetails.clusters.includes(cluster.name)) {
                        existingDetails.clusters.push(cluster.name);
                      }
                      if (!existingDetails.nodes.includes(node.name)) {
                        existingDetails.nodes.push(node.name);
                      }
                      existingDetails.totalInstances += 1;
                      existingDetails.occurrences.push({
                        cluster: cluster.name,
                        node: node.name,
                        containerName: container.name,
                      });
                    }

                    // Aggregate vulnerabilities by CVE
                    const det = detailsMap.get(key)!;
                    const vulns: Array<{
                      cve: string;
                      severity: Severity;
                    }> = (container.vulnerabilities || []).map((v: any) => ({
                      cve: v.cve as string,
                      severity: v.severity as Severity,
                    }));

                    if (vulns.length > 0) {
                      vulns.forEach((v) => {
                        // update severity counts
                        det.severityCounts[v.severity] += 1;

                        // find existing CVE entry
                        const idx = det.cves.findIndex((c) => c.cve === v.cve);
                        if (idx === -1) {
                          det.cves.push({
                            cve: v.cve,
                            severity: v.severity,
                            count: 1,
                            clusters: [cluster.name],
                            nodes: [node.name],
                            containers: [container.name],
                          });
                        } else {
                          const entry = det.cves[idx];
                          entry.count += 1;
                          if (!entry.clusters.includes(cluster.name))
                            entry.clusters.push(cluster.name);
                          if (!entry.nodes.includes(node.name))
                            entry.nodes.push(node.name);
                          if (!entry.containers.includes(container.name))
                            entry.containers.push(container.name);
                        }
                      });
                    }
                  });
                });
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching images for ${config.name}:`, error);
        }
      }

      const sortedImages = Array.from(imageMap.values()).sort(
        (a, b) => b.totalInstances - a.totalInstances,
      );

      // Sort CVEs in each details entry by severity importance
      const severityOrder: Record<Severity, number> = {
        Critical: 0,
        High: 1,
        Medium: 2,
        Low: 3,
      };
      detailsMap.forEach((det) => {
        // Sort CVEs by severity and count
        det.cves.sort((a, b) => {
          const sa = severityOrder[a.severity];
          const sb = severityOrder[b.severity];
          if (sa !== sb) return sa - sb;
          return b.count - a.count;
        });
        
        // Don't reset severityCounts here - they were already calculated during processing
        // Just ensure all severity levels exist with at least 0
        det.severityCounts = {
          Critical: det.severityCounts.Critical || 0,
          High: det.severityCounts.High || 0,
          Medium: det.severityCounts.Medium || 0,
          Low: det.severityCounts.Low || 0,
        };
      });

      setDockerImages(sortedImages);
      setImageDetailsMap(new Map(detailsMap));
    } catch (error) {
      console.error("Error fetching docker images:", error);
      setError("Failed to load docker images");
    } finally {
      setIsLoading(false);
    }
  };

  // Get unique registries for filter
  const registries = useMemo(
    () =>
      Array.from(
        new Set(
          dockerImages.map((img) => {
            const parts = img.image.split("/");
            return parts.length > 1 ? parts[0] : "docker.io";
          }),
        ),
      ).sort(),
    [dockerImages],
  );

  const clusterOptions = useMemo(
    () =>
      Array.from(new Set(dockerImages.flatMap((img) => img.clusters))).sort(),
    [dockerImages],
  );

  // Calculate metrics
  const totalImages = dockerImages.length;
  const totalInstances = dockerImages.reduce(
    (sum, img) => sum + img.totalInstances,
    0,
  );
  const totalClusters = new Set(dockerImages.flatMap((img) => img.clusters))
    .size;
  const totalNodes = new Set(dockerImages.flatMap((img) => img.nodes)).size;

  const metrics = [
    {
      title: "Unique Images",
      value: totalImages.toString(),
      change: "",
      changeType: "neutral" as const,
      icon: Package,
    },
    {
      title: "Total Instances",
      value: totalInstances.toString(),
      change: "",
      changeType: "neutral" as const,
      icon: Container,
    },
    {
      title: "Across Clusters",
      value: totalClusters.toString(),
      change: "",
      changeType: "neutral" as const,
      icon: Server,
    },
    {
      title: "Across Nodes",
      value: totalNodes.toString(),
      change: "",
      changeType: "neutral" as const,
      icon: Container,
    },
  ];

  const totalPages = Math.max(1, Math.ceil(filteredImages.length / pageSize));
  const fromIndex =
    filteredImages.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const toIndex = Math.min(filteredImages.length, currentPage * pageSize);
  const pageImages = useMemo(
    () =>
      filteredImages.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize,
      ),
    [filteredImages, currentPage, pageSize],
  );

  const parseImage = (image: string) => {
    let registry = "";
    let repoWithTag = image;
    if (image.includes("/")) {
      const first = image.split("/")[0];
      const rest = image.substring(first.length + 1);
      if (first.includes(".") || first.includes(":")) {
        registry = first;
        repoWithTag = rest;
      }
    }
    let repository = repoWithTag;
    let tag = "latest";
    if (repoWithTag.includes("@")) {
      repository = repoWithTag.split("@")[0];
    }
    if (repoWithTag.includes(":")) {
      const idx = repoWithTag.lastIndexOf(":");
      repository = repoWithTag.slice(0, idx);
      tag = repoWithTag.slice(idx + 1);
    }
    return { registry, repository, tag };
  };

  const getSeverityColor = (severity: Severity) => {
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

  const openImageDialog = (image: string) => {
    setSelectedImage(image);
    setIsDialogOpen(true);
  };

  const handleCompareWithLatest = async (image: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    setSelectedImageForResolution(image);
    setResolutionDialogOpen(true);

    // Check if we have cached result
    if (cachedResolutions[image]) {
      // Show cached result
      return;
    }

    // Start new check
    await resolutionHook.startCheck(image);

    // Reload cached resolutions from localStorage
    const cachedRaw = localStorage.getItem("vulnerabilityResolutions");
    if (cachedRaw) {
      setCachedResolutions(JSON.parse(cachedRaw));
    }
  };

  const selectedDetails = useMemo(() => {
    if (!selectedImage) return null;
    return imageDetailsMap.get(selectedImage) || null;
  }, [selectedImage, imageDetailsMap]);

  return (
    <DashboardLayout>
      <div className="col-span-full">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2">
                Docker Images
              </h1>
              <p className="carbon-type-body-02 text-text-02">
                Comprehensive view of all container images across your
                Kubernetes clusters
              </p>
            </div>
            <button
              onClick={fetchDockerImages}
              disabled={isLoading}
              className="flex items-center space-x-2 px-4 py-2 border border-ui-04 text-text-01 rounded carbon-type-body-01 hover:bg-ui-01 transition-colors"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
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

        {/* Filters */}
        <div className="mb-6 bg-layer-01 border border-ui-03 rounded p-6">
          <h3 className="carbon-type-productive-heading-02 text-text-01 mb-4">
            Filters & Search
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* Search */}
            <div>
              <label className="block carbon-type-label-01 text-text-02 mb-2">
                Search Images
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-03" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by image name or container name..."
                  className="w-full pl-10 pr-3 py-2 bg-field-01 border border-ui-04 rounded carbon-type-body-01 text-text-01 placeholder-text-03 focus:outline-none focus:ring-2 focus:ring-interactive-01"
                />
              </div>
            </div>

            {/* Registry Filter */}
            <div>
              <label className="block carbon-type-label-01 text-text-02 mb-2">
                Registry
              </label>
              <Select value={registryFilter} onValueChange={setRegistryFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select registry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Registries</SelectItem>
                  {registries.map((registry) => (
                    <SelectItem key={registry} value={registry}>
                      {registry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cluster Filter */}
            <div>
              <label className="block carbon-type-label-01 text-text-02 mb-2">
                Cluster
              </label>
              <Select value={clusterFilter} onValueChange={setClusterFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select cluster" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clusters</SelectItem>
                  {clusterOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Minimum Severity */}
            <div>
              <label className="block carbon-type-label-01 text-text-02 mb-2">
                Minimum Severity
              </label>
              <Select value={minSeverity} onValueChange={(v) => setMinSeverity(v as any)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Toggles */}
            <div className="flex items-end">
              <div className="flex flex-col gap-2 w-full">
                <label className="inline-flex items-center gap-2 text-sm text-text-02">
                  <Checkbox
                    checked={onlyWithVulns}
                    onCheckedChange={(v) => setOnlyWithVulns(Boolean(v))}
                  />
                  <span>Only with vulnerabilities</span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-text-02">
                  <Checkbox
                    checked={onlyHighCritical}
                    onCheckedChange={(v) => setOnlyHighCritical(Boolean(v))}
                  />
                  <span>Only High or Critical</span>
                </label>
              </div>
            </div>

            {/* Results Count */}
            <div className="flex items-end">
              <div className="bg-ui-03 px-3 py-2 rounded w-full text-center">
                <span className="carbon-type-body-01 text-text-01">
                  {fromIndex}-{toIndex} of {filteredImages.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Images Grid */}
        {isLoading ? (
          <div className="bg-layer-01 border border-ui-03 rounded p-8 text-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin h-8 w-8 border-2 border-interactive-01 border-t-transparent rounded-full" />
              <div>
                <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                  Loading Docker Images
                </h3>
                <p className="carbon-type-body-01 text-text-02">
                  Fetching container images from all connected clusters...
                </p>
              </div>
            </div>
          </div>
        ) : filteredImages.length > 0 ? (
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {pageImages.map((img) => {
                const details = imageDetailsMap.get(img.image);
                const totalVulns = details
                  ? details.cves.reduce((acc, c) => acc + c.count, 0)
                  : 0;
                return (
                  <Card
                    key={img.image}
                    className="bg-layer-01 border border-ui-03 hover:border-interactive-01 transition-colors cursor-pointer flex flex-col"
                    onClick={() => openImageDialog(img.image)}
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-text-01 break-words text-base">
                          {parseImage(img.image).repository}
                        </CardTitle>
                        <span className="carbon-type-label-01 inline-flex items-center rounded bg-ui-03 px-2 py-0.5 text-text-01 border border-ui-04">
                          {parseImage(img.image).tag}
                        </span>
                      </div>
                      <CardDescription className="text-text-02 break-all">
                        {img.image}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 flex-1">
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-text-02">Unique CVEs</span>
                          <span className="text-text-01 font-semibold">
                            {details ? details.cves.length : 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-text-02">High+Critical</span>
                          <span className="text-text-01 font-semibold">
                            {details
                              ? details.severityCounts.High +
                                details.severityCounts.Critical
                              : 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-text-02">Occurrences</span>
                          <span className="text-text-01 font-semibold">
                            {totalVulns}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-text-02">Containers</span>
                          <span className="text-text-01 font-semibold">
                            {details ? details.names.length : 1}
                          </span>
                        </div>
                      </div>
                      {details && details.cves.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {(() => {
                            const total = Object.values(
                              details.severityCounts,
                            ).reduce((a, b) => a + b, 0);
                            const entries = [
                              {
                                key: "Critical" as Severity,
                                color: "bg-support-01",
                              },
                              {
                                key: "High" as Severity,
                                color: "bg-orange-500",
                              },
                              {
                                key: "Medium" as Severity,
                                color: "bg-yellow-500",
                              },
                              { key: "Low" as Severity, color: "bg-sky-400" },
                            ];
                            return total > 0 ? (
                              <div className="space-y-2">
                                <div className="w-full h-2 flex overflow-hidden border border-ui-03 bg-layer-02 rounded">
                                  {entries.map((e) => {
                                    const val = details.severityCounts[e.key];
                                    return (
                                      <div
                                        key={e.key}
                                        className={`${e.color}`}
                                        style={{
                                          width: `${(val / total) * 100}%`,
                                        }}
                                        title={`${e.key}: ${val}`}
                                      />
                                    );
                                  })}
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-xs">
                                  {entries.map((e) => (
                                    <div
                                      key={e.key}
                                      className="flex items-center gap-1"
                                    >
                                      <span
                                        className={`inline-block h-2 w-2 rounded ${e.color}`}
                                      />
                                      <span className="text-text-02">
                                        {e.key === "Critical"
                                          ? "C"
                                          : e.key === "High"
                                            ? "H"
                                            : e.key === "Medium"
                                              ? "M"
                                              : "L"}
                                        :
                                      </span>
                                      <span className="text-text-01 font-medium">
                                        {details.severityCounts[e.key]}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-text-02">
                                No vulnerabilities.
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      {!details || details.cves.length === 0 ? (
                        <div className="mt-3 inline-flex items-center gap-2 text-xs text-text-02">
                          <Shield className="h-3 w-3" /> No vulnerabilities
                        </div>
                      ) : null}
                    </CardContent>
                    <CardFooter className="pt-0 flex-col gap-2 mt-auto">
                      <div className="w-full flex items-center justify-between text-xs text-text-02">
                        <div className="truncate">
                          Containers:{" "}
                          {details
                            ? details.names.slice(0, 2).join(", ")
                            : img.name}
                          {details && details.names.length > 2
                            ? ` +${details.names.length - 2}`
                            : ""}
                        </div>
                        <div className="ml-2 shrink-0">Details →</div>
                      </div>
                      <button
                        onClick={(e) => handleCompareWithLatest(img.image, e)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs transition-colors"
                      >
                        <GitCompare className="h-3 w-3" />
                        Compare with Latest
                      </button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-text-02">
                Showing {fromIndex}–{toIndex} of {filteredImages.length} images
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-ui-04 rounded disabled:opacity-50"
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (n) => (
                    <button
                      key={n}
                      onClick={() => setCurrentPage(n)}
                      className={`px-3 py-1 border rounded ${n === currentPage ? "bg-interactive-01 text-white border-interactive-01" : "border-ui-04 text-text-01 hover:bg-ui-01"}`}
                    >
                      {n}
                    </button>
                  ),
                )}
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-ui-04 rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : dockerImages.length === 0 ? (
          <div className="bg-layer-01 border border-ui-03 rounded p-8 text-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ui-03">
                <Package className="h-6 w-6 text-text-02" />
              </div>
              <div>
                <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                  No Docker Images Found
                </h3>
                <p className="carbon-type-body-01 text-text-02">
                  Connect and validate kubeconfig files to view container
                  images.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-layer-01 border border-ui-03 rounded p-8 text-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ui-03">
                <Search className="h-6 w-6 text-text-02" />
              </div>
              <div>
                <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                  No Results Found
                </h3>
                <p className="carbon-type-body-01 text-text-02">
                  Try adjusting your search terms or filters.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Registry Information */}
        {registries.length > 0 && (
          <div className="mt-8 bg-layer-01 border border-ui-03 rounded p-6">
            <h3 className="carbon-type-productive-heading-02 text-text-01 mb-4">
              Registry Overview
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {registries.map((registry) => {
                const registryImages = dockerImages.filter((img) => {
                  const imgRegistry = img.image.split("/")[0];
                  return (
                    imgRegistry === registry ||
                    (registry === "docker.io" && !img.image.includes("/"))
                  );
                });
                const registryInstances = registryImages.reduce(
                  (sum, img) => sum + img.totalInstances,
                  0,
                );

                return (
                  <div
                    key={registry}
                    className="bg-layer-02 border border-ui-03 rounded p-4"
                  >
                    <div className="flex items-center space-x-2 mb-2">
                      <Package className="h-4 w-4 text-interactive-01" />
                      <span className="carbon-type-body-01 text-text-01 font-medium">
                        {registry}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <p className="carbon-type-label-01 text-text-02">
                        {registryImages.length} unique images
                      </p>
                      <p className="carbon-type-label-01 text-text-02">
                        {registryInstances} total instances
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Vulnerability Resolution Comparison Dialog */}
      <Dialog open={resolutionDialogOpen} onOpenChange={(open) => {
        setResolutionDialogOpen(open);
        if (!open) {
          resolutionHook.reset();
        }
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5" />
              Vulnerability Resolution Analysis
            </DialogTitle>
            <DialogDescription>
              Comparing current image vulnerabilities with the latest available version
            </DialogDescription>
          </DialogHeader>

          {selectedImageForResolution && (
            <div className="space-y-6">
              {/* Image Info */}
              <div className="bg-layer-01 border border-ui-03 rounded p-4">
                <div className="carbon-type-productive-heading-03 text-text-01 mb-2">
                  Image: {selectedImageForResolution}
                </div>
              </div>

              {/* Loading State */}
              {resolutionHook.status === 'loading' && (
                <div className="bg-layer-01 border border-ui-03 rounded p-6 text-center">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="animate-spin h-8 w-8 border-2 border-interactive-01 border-t-transparent rounded-full" />
                    <div>
                      <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                        Analyzing Vulnerabilities
                      </h3>
                      <p className="carbon-type-body-01 text-text-02">
                        {resolutionHook.progress || 'Processing...'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error State */}
              {resolutionHook.status === 'failed' && (
                <div className="bg-support-01 border border-red-700 rounded p-4">
                  <div className="flex items-center gap-2 text-white">
                    <XCircle className="h-5 w-5" />
                    <div>
                      <div className="font-semibold">Error</div>
                      <div className="text-sm">{resolutionHook.error}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Completed State - Show cached or fresh result */}
              {(() => {
                const displayResult = resolutionHook.result || cachedResolutions[selectedImageForResolution]?.result;

                if (!displayResult) return null;

                const getStatusIcon = () => {
                  switch (displayResult.resolution_status) {
                    case 'resolved':
                      return <CheckCircle2 className="h-6 w-6 text-green-500" />;
                    case 'partially_resolved':
                      return <MinusCircle className="h-6 w-6 text-yellow-500" />;
                    case 'unresolvable':
                      return <XCircle className="h-6 w-6 text-red-500" />;
                    case 'no_vulnerabilities':
                      return <Shield className="h-6 w-6 text-green-500" />;
                  }
                };

                const getStatusColor = () => {
                  switch (displayResult.resolution_status) {
                    case 'resolved':
                      return 'bg-green-500/10 border-green-500';
                    case 'partially_resolved':
                      return 'bg-yellow-500/10 border-yellow-500';
                    case 'unresolvable':
                      return 'bg-red-500/10 border-red-500';
                    case 'no_vulnerabilities':
                      return 'bg-green-500/10 border-green-500';
                  }
                };

                return (
                  <div className="space-y-6">
                    {/* Status Summary */}
                    <div className={`border rounded p-4 ${getStatusColor()}`}>
                      <div className="flex items-start gap-3">
                        {getStatusIcon()}
                        <div className="flex-1">
                          <h3 className="carbon-type-productive-heading-03 text-text-01 mb-1">
                            {displayResult.message}
                          </h3>
                          <p className="carbon-type-body-01 text-text-02">
                            {displayResult.recommendation}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Comparison Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Original Image */}
                      <div className="bg-layer-01 border border-ui-03 rounded p-4">
                        <h4 className="carbon-type-productive-heading-03 text-text-01 mb-3 flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Original Image ({displayResult.original_tag})
                        </h4>
                        <div className="space-y-3">
                          <div className="text-sm text-text-02 break-all">
                            {displayResult.image_name}:{displayResult.original_tag}
                          </div>
                          <div className="text-lg font-semibold text-text-01">
                            {displayResult.original_vulnerabilities.total} Total Vulnerabilities
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center justify-between p-2 bg-support-01 rounded">
                              <span className="text-white">Critical</span>
                              <span className="font-semibold text-white">
                                {displayResult.original_vulnerabilities.critical}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-orange-500 rounded">
                              <span className="text-white">High</span>
                              <span className="font-semibold text-white">
                                {displayResult.original_vulnerabilities.high}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-yellow-500 rounded">
                              <span className="text-black">Medium</span>
                              <span className="font-semibold text-black">
                                {displayResult.original_vulnerabilities.medium}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-sky-400 rounded">
                              <span className="text-white">Low</span>
                              <span className="font-semibold text-white">
                                {displayResult.original_vulnerabilities.low}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Latest Image */}
                      <div className="bg-layer-01 border border-ui-03 rounded p-4">
                        <h4 className="carbon-type-productive-heading-03 text-text-01 mb-3 flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Latest Image ({displayResult.latest_tag})
                        </h4>
                        <div className="space-y-3">
                          <div className="text-sm text-text-02 break-all">
                            {displayResult.image_name}:{displayResult.latest_tag}
                          </div>
                          <div className="text-lg font-semibold text-text-01">
                            {displayResult.latest_vulnerabilities.total} Total Vulnerabilities
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center justify-between p-2 bg-support-01 rounded">
                              <span className="text-white">Critical</span>
                              <span className="font-semibold text-white">
                                {displayResult.latest_vulnerabilities.critical}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-orange-500 rounded">
                              <span className="text-white">High</span>
                              <span className="font-semibold text-white">
                                {displayResult.latest_vulnerabilities.high}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-yellow-500 rounded">
                              <span className="text-black">Medium</span>
                              <span className="font-semibold text-black">
                                {displayResult.latest_vulnerabilities.medium}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-sky-400 rounded">
                              <span className="text-white">Low</span>
                              <span className="font-semibold text-white">
                                {displayResult.latest_vulnerabilities.low}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Cached timestamp */}
                    {cachedResolutions[selectedImageForResolution] && (
                      <div className="text-xs text-text-02 text-center">
                        Last checked: {new Date(cachedResolutions[selectedImageForResolution].timestamp).toLocaleString()}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Image Vulnerabilities Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Image Details</DialogTitle>
            <DialogDescription>
              Severity distribution and affected locations for the selected
              image
            </DialogDescription>
          </DialogHeader>
          {selectedDetails ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="carbon-type-productive-heading-02 text-text-01 break-words">
                    {parseImage(selectedDetails.image).repository}
                  </div>
                  <span className="carbon-type-label-01 inline-flex items-center rounded bg-ui-03 px-2 py-0.5 text-text-01 border border-ui-04">
                    {parseImage(selectedDetails.image).tag}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-sm text-text-02">
                  <span>{selectedDetails.totalInstances} instances</span>
                  <span>• {selectedDetails.clusters.length} clusters</span>
                  <span>• {selectedDetails.nodes.length} nodes</span>
                  <span>
                    • {selectedDetails.names.length} container name(s)
                  </span>
                </div>
              </div>

              {/* Severity Bar Chart */}
              <div className="bg-layer-01 border border-ui-03 rounded p-4">
                <div className="carbon-type-productive-heading-03 text-text-01 mb-3">
                  Vulnerability distribution
                </div>
                {(() => {
                  // Ensure all severity levels are present with at least 0 count
                  const severityCounts = {
                    Critical: selectedDetails.severityCounts.Critical || 0,
                    High: selectedDetails.severityCounts.High || 0,
                    Medium: selectedDetails.severityCounts.Medium || 0,
                    Low: selectedDetails.severityCounts.Low || 0,
                  };
                  
                  const total = Object.values(severityCounts).reduce((a, b) => a + b, 0);
                  
                  const entries = [
                    { key: "Critical" as Severity, color: "bg-support-01" },
                    { key: "High" as Severity, color: "bg-orange-500" },
                    { key: "Medium" as Severity, color: "bg-yellow-500" },
                    { key: "Low" as Severity, color: "bg-sky-400" },
                  ];
                  
                  // Check if there are any vulnerabilities at all
                  const hasVulnerabilities = total > 0;
                  
                  if (!hasVulnerabilities) {
                    return (
                      <div className="text-text-02 text-sm">
                        No vulnerabilities found.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      <div className="w-full h-4 flex rounded overflow-hidden border border-ui-03 bg-layer-02">
                        {entries.map((e) => {
                          const val = severityCounts[e.key] || 0;
                          if (val <= 0) return null;
                          return (
                            <div
                              key={e.key}
                              className={`${e.color}`}
                              style={{ width: `${(val / total) * 100}%` }}
                              title={`${e.key}: ${val}`}
                            />
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                        {entries.map((e) => {
                          const val = severityCounts[e.key] || 0;
                          if (val <= 0) return null;
                          return (
                            <div key={e.key} className="flex items-center gap-2">
                              <span className={`inline-block h-3 w-3 rounded ${e.color}`} />
                              <span className="text-text-02">{e.key}:</span>
                              <span className="font-medium">{val}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Locations */}
              <div className="bg-layer-01 border border-ui-03 rounded p-4">
                <div className="carbon-type-productive-heading-03 text-text-01 mb-3">
                  Affected Locations
                </div>
                {selectedDetails.occurrences.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-auto pr-1 text-sm">
                    {selectedDetails.occurrences.map((o, idx) => (
                      <div
                        key={`${o.cluster}-${o.node}-${o.containerName}-${idx}`}
                        className="flex items-center justify-between p-2 bg-layer-02 border border-ui-03 rounded"
                      >
                        <div className="text-text-01 font-medium">
                          {o.cluster}
                        </div>
                        <div className="text-text-02">
                          Node: {o.node} • Container: {o.containerName}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-text-02">No locations found.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-text-02">No data available.</div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
