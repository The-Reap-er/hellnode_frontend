import { useState, useEffect, useMemo } from "react";
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
  const PAGE_SIZE = 12;
  const [currentPage, setCurrentPage] = useState(1);

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
        const total = Object.values(det.severityCounts).reduce((a, b) => a + b, 0);
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
      const order: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      const threshold = order[minSeverity as Severity];
      filtered = filtered.filter((img) => {
        const det = imageDetailsMap.get(img.image);
        if (!det) return false;
        return (Object.entries(det.severityCounts) as Array<[Severity, number]>).some(
          ([sev, count]) => count > 0 && order[sev] <= threshold,
        );
      });
    }

    setFilteredImages(filtered);
  }, [dockerImages, searchTerm, registryFilter, clusterFilter, onlyWithVulns, onlyHighCritical, minSeverity, imageDetailsMap]);

  // Clamp current page when results change
  useEffect(() => {
    const tp = Math.max(1, Math.ceil(filteredImages.length / PAGE_SIZE));
    if (currentPage > tp) setCurrentPage(tp);
  }, [filteredImages, currentPage]);

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
        det.cves.sort((a, b) => {
          const sa = severityOrder[a.severity];
          const sb = severityOrder[b.severity];
          if (sa !== sb) return sa - sb;
          return b.count - a.count;
        });
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

  const totalPages = Math.max(1, Math.ceil(filteredImages.length / PAGE_SIZE));
  const fromIndex =
    filteredImages.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const toIndex = Math.min(filteredImages.length, currentPage * PAGE_SIZE);
  const pageImages = useMemo(
    () =>
      filteredImages.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
      ),
    [filteredImages, currentPage],
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
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-03" />
                <select
                  value={registryFilter}
                  onChange={(e) => setRegistryFilter(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-field-01 border border-ui-04 rounded carbon-type-body-01 text-text-01 focus:outline-none focus:ring-2 focus:ring-interactive-01 appearance-none"
                >
                  <option value="all">All Registries</option>
                  {registries.map((registry) => (
                    <option key={registry} value={registry}>
                      {registry}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Cluster Filter */}
            <div>
              <label className="block carbon-type-label-01 text-text-02 mb-2">
                Cluster
              </label>
              <select
                value={clusterFilter}
                onChange={(e) => setClusterFilter(e.target.value)}
                className="w-full px-3 py-2 bg-field-01 border border-ui-04 rounded carbon-type-body-01 text-text-01 focus:outline-none focus:ring-2 focus:ring-interactive-01 appearance-none"
              >
                <option value="all">All Clusters</option>
                {clusterOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Minimum Severity */}
            <div>
              <label className="block carbon-type-label-01 text-text-02 mb-2">
                Minimum Severity
              </label>
              <select
                value={minSeverity}
                onChange={(e) => setMinSeverity(e.target.value as any)}
                className="w-full px-3 py-2 bg-field-01 border border-ui-04 rounded carbon-type-body-01 text-text-01 focus:outline-none focus:ring-2 focus:ring-interactive-01 appearance-none"
              >
                <option value="all">All</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
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
                    className="bg-layer-01 border border-ui-03 hover:border-interactive-01 transition-colors cursor-pointer"
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
                    <CardContent className="pt-0">
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-text-02">CVEs</span>
                          <span className="text-text-01 font-semibold">
                            {details ? details.cves.length : 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-text-02">High+Critical</span>
                          <span className="text-text-01 font-semibold">
                            {details
                              ? details.severityCounts.High + details.severityCounts.Critical
                              : 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-text-02">Vulns</span>
                          <span className="text-text-01 font-semibold">{totalVulns}</span>
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
                            const total = Object.values(details.severityCounts).reduce((a, b) => a + b, 0);
                            const entries = [
                              { key: "Critical" as Severity, color: "bg-support-01" },
                              { key: "High" as Severity, color: "bg-orange-500" },
                              { key: "Medium" as Severity, color: "bg-yellow-500" },
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
                                        style={{ width: `${(val / total) * 100}%` }}
                                        title={`${e.key}: ${val}`}
                                      />
                                    );
                                  })}
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-xs">
                                  {entries.map((e) => (
                                    <div key={e.key} className="flex items-center gap-1">
                                      <span className={`inline-block h-2 w-2 rounded ${e.color}`} />
                                      <span className="text-text-02">{e.key === "Critical" ? "C" : e.key === "High" ? "H" : e.key === "Medium" ? "M" : "L"}:</span>
                                      <span className="text-text-01 font-medium">
                                        {details.severityCounts[e.key]}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-text-02">No vulnerabilities.</div>
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
                    <CardFooter className="pt-0">
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
                  const total = Object.values(
                    selectedDetails.severityCounts,
                  ).reduce((a, b) => a + b, 0);
                  const entries = [
                    { key: "Critical" as Severity, color: "bg-support-01" },
                    { key: "High" as Severity, color: "bg-orange-500" },
                    { key: "Medium" as Severity, color: "bg-yellow-500" },
                    { key: "Low" as Severity, color: "bg-sky-400" },
                  ];
                  return total > 0 ? (
                    <div className="space-y-3">
                      <div className="w-full h-4 flex rounded overflow-hidden border border-ui-03 bg-layer-02">
                        {entries.map((e) => {
                          const val = selectedDetails.severityCounts[e.key];
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
                        {entries.map((e) => (
                          <div key={e.key} className="flex items-center gap-2">
                            <span
                              className={`inline-block h-3 w-3 rounded ${e.color}`}
                            />
                            <span className="text-text-02">{e.key}:</span>
                            <span className="text-text-01 font-medium">
                              {selectedDetails.severityCounts[e.key]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-text-02">
                      No vulnerabilities.
                    </div>
                  );
                })()}
                <div className="mt-4">
                  <Link
                    to={`/vulnerabilities?image=${encodeURIComponent(selectedDetails.image)}`}
                    className="inline-flex items-center px-3 py-2 border border-ui-04 text-text-01 rounded carbon-type-body-01 hover:bg-ui-01 transition-colors text-sm"
                  >
                    View in Vulnerabilities →
                  </Link>
                </div>
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
                  <div className="text-sm text-text-02">No locations.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-text-02">No data.</div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
