import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Shield,
  Copy,
  Package,
  TrendingUp,
  Filter,
  X,
  ExternalLink,
  FileCode,
  Layers,
  CheckCircle,
  Check,
} from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ImageMetadata {
  description: string;
  tags: string[];
  maintainer: string;
  use_case: string;
}

interface BuildInfo {
  status: "success" | "failed" | "pending";
  built_at?: string;
  build_duration?: string;
  image_id?: string;
  image_size?: number;
  build_logs?: string;
}

interface ScanResults {
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  score?: number;
}

interface HardenedImage {
  id: string;
  name: string;
  version: string;
  dockerfile_content: string;
  metadata: ImageMetadata;
  build_info: BuildInfo;
  scan_results: ScanResults;
  created_at: string;
  pull_command?: string;
}

interface RegistryStats {
  total_images: number;
  total_builds: number;
  successful_builds: number;
  failed_builds: number;
  total_vulnerabilities: number;
  critical_images: number;
  clean_images: number;
  last_build_time?: string;
  total_storage_size?: number;
}

interface SelectedImage extends HardenedImage {
  versions: Array<{
    version: string;
    size?: string;
    score?: number;
    vulnerabilities: ScanResults["summary"];
  }>;
}

export default function HardenedImagesRegistry() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [images, setImages] = useState<HardenedImage[]>([]);
  const [filteredImages, setFilteredImages] = useState<HardenedImage[]>([]);
  const [stats, setStats] = useState<RegistryStats | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filterTag, setFilterTag] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDockerfile, setShowDockerfile] = useState(false);
  const [showBuildLogs, setShowBuildLogs] = useState(false);

  console.log("Render - selectedImage:", selectedImage ? selectedImage.name : "null");

  useEffect(() => {
    fetchRegistryData();
  }, []);

  useEffect(() => {
    filterAndSortImages();
  }, [searchQuery, images, filterTag, filterStatus, sortBy]);

  const fetchRegistryData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch registry statistics
      const statsResponse = await fetch("http://localhost:8080/api/v2/registry/stats");
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        console.log("Registry stats:", statsData);
        setStats(statsData);
      } else {
        console.warn("Stats API returned:", statsResponse.status);
      }

      // Fetch all images
      const imagesResponse = await fetch("http://localhost:8080/api/v2/registry/dockerfiles");
      if (imagesResponse.ok) {
        const imagesData = await imagesResponse.json();
        console.log("Registry images:", imagesData);
        setImages(imagesData.images || []);
      } else {
        console.warn("Images API returned:", imagesResponse.status);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("Failed to fetch registry data:", err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const filterAndSortImages = () => {
    let filtered = [...images];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (img) =>
          img.name.toLowerCase().includes(query) ||
          img.metadata?.description?.toLowerCase().includes(query) ||
          img.metadata?.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Apply tag filter
    if (filterTag !== "all") {
      filtered = filtered.filter((img) =>
        img.metadata?.tags?.some((tag) => tag.toLowerCase() === filterTag.toLowerCase())
      );
    }

    // Apply build status filter
    if (filterStatus !== "all") {
      filtered = filtered.filter((img) => {
        if (filterStatus === "scanned") {
          return img.scan_results?.summary?.total !== -1;
        } else if (filterStatus === "not-scanned") {
          return img.scan_results?.summary?.total === -1;
        } else if (filterStatus === "clean") {
          return img.scan_results?.summary?.total === 0;
        } else if (filterStatus === "vulnerable") {
          return img.scan_results?.summary?.total > 0;
        }
        return true;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "score":
          return (b.scan_results?.score || 0) - (a.scan_results?.score || 0);
        case "vulnerabilities":
          return (a.scan_results?.summary?.total || 0) - (b.scan_results?.summary?.total || 0);
        case "date":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return 0;
      }
    });

    setFilteredImages(filtered);
  };

  const handleImageClick = async (image: HardenedImage) => {
    console.log("Image clicked:", image);
    try {
      // Fetch versions for this image
      const versionsResponse = await fetch(
        `http://localhost:8080/api/v2/registry/by-name/${encodeURIComponent(image.name)}/versions`
      );

      let versions = [];
      if (versionsResponse.ok) {
        const versionsData = await versionsResponse.json();
        console.log("Versions data:", versionsData);

        // Map the API response to our interface format
        versions = (versionsData.versions || []).map((v: any) => ({
          version: v.version,
          size: v.build_info?.image_size,
          score: v.scan_results?.score,
          vulnerabilities: {
            total: v.scan_results?.summary?.total ?? -1,
            critical: v.scan_results?.summary?.critical ?? 0,
            high: v.scan_results?.summary?.high ?? 0,
            medium: v.scan_results?.summary?.medium ?? 0,
            low: v.scan_results?.summary?.low ?? 0,
          }
        }));
      }

      // Fetch pull command
      const pullResponse = await fetch(
        `http://localhost:8080/api/v2/registry/by-name/${encodeURIComponent(image.name)}/version/${encodeURIComponent(image.version)}/pull`
      );

      let pullCommand = "";
      if (pullResponse.ok) {
        const pullData = await pullResponse.json();
        console.log("Pull data:", pullData);
        pullCommand = pullData.pull_command || "";
      }

      const selectedImg = {
        ...image,
        pull_command: pullCommand,
        versions,
      };
      console.log("Setting selected image:", selectedImg);
      setSelectedImage(selectedImg);
    } catch (error) {
      console.error("Failed to fetch image details:", error);
      // Still show the modal with basic info
      setSelectedImage({
        ...image,
        versions: [],
      });
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const isScanned = (vulnCount: number): boolean => {
    return vulnCount !== -1;
  };

  const getScoreColor = (score: number): string => {
    if (score >= 95) return "text-green-500 bg-green-500/10";
    if (score >= 85) return "text-blue-500 bg-blue-500/10";
    if (score >= 70) return "text-yellow-500 bg-yellow-500/10";
    return "text-orange-500 bg-orange-500/10";
  };

  const formatBytes = (bytes?: number): string => {
    if (!bytes) return "N/A";
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(0)}MB`;
    return `${(mb / 1024).toFixed(1)}GB`;
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    } catch {
      return "N/A";
    }
  };

  // Get unique tags from all images
  const uniqueTags = Array.from(
    new Set(
      images.flatMap((img) => img.metadata?.tags || [])
    )
  ).sort();

  const metricCards = stats
    ? [
        {
          title: "Total Images",
          value: (stats.total_images ?? 0).toString(),
          change: `${stats.successful_builds ?? 0} successful builds`,
          changeType: "positive" as const,
          icon: Package,
        },
        {
          title: "Clean Images",
          value: (stats.clean_images ?? 0).toString(),
          change: "No vulnerabilities",
          changeType: "positive" as const,
          icon: CheckCircle,
        },
        {
          title: "Avg Score",
          value: (stats.total_images ?? 0) > 0
            ? Math.round(((stats.clean_images ?? 0) / (stats.total_images ?? 1)) * 100).toString()
            : "0",
          change: "Security rating",
          changeType: "neutral" as const,
          icon: Shield,
        },
        {
          title: "Total Storage",
          value: formatBytes(stats.total_storage_size),
          change: "Registry size",
          changeType: "neutral" as const,
          icon: TrendingUp,
        },
      ]
    : [];

  return (
    <DashboardLayout>
      <div className="col-span-full">
        {/* Header */}
        <div className="mb-8">
          <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2">
            Hardened Images Registry
          </h1>
          <p className="carbon-type-body-02 text-text-02">
            Secure, minimal, production-ready container images
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500 rounded p-4">
            <p className="text-red-500">Error loading registry data: {error}</p>
          </div>
        )}

        {/* Metrics */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {metricCards.map((metric, index) => (
              <MetricCard key={index} {...metric} />
            ))}
          </div>
        )}

        {/* Search and Filters */}
        <div className="mb-6 bg-layer-01 border border-ui-03 rounded p-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-text-03" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search images..."
                className="w-full pl-12 pr-4 py-2 bg-field-01 border border-ui-04 rounded carbon-type-body-01 text-text-01 focus:outline-none focus:ring-2 focus:ring-interactive-01"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-3">
              {/* Tag Filter */}
              <div className="min-w-[180px]">
                <Select value={filterTag} onValueChange={setFilterTag}>
                  <SelectTrigger className="bg-field-01 border-ui-04 text-text-01 carbon-type-body-01">
                    <SelectValue placeholder="All Tags" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tags</SelectItem>
                    {uniqueTags.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status Filter */}
              <div className="min-w-[180px]">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="bg-field-01 border-ui-04 text-text-01 carbon-type-body-01">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="scanned">Scanned</SelectItem>
                    <SelectItem value="not-scanned">Not Scanned</SelectItem>
                    <SelectItem value="clean">Clean</SelectItem>
                    <SelectItem value="vulnerable">Has Vulnerabilities</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort */}
              <div className="min-w-[200px]">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="bg-field-01 border-ui-04 text-text-01 carbon-type-body-01">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name (A-Z)</SelectItem>
                    <SelectItem value="vulnerabilities">Vulnerabilities</SelectItem>
                    <SelectItem value="date">Date (Newest)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Images Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {(filteredImages || []).map((image) => {
              if (!image || !image.id) return null;

              return (
                <div
                  key={image.id}
                  onClick={() => handleImageClick(image)}
                  className="bg-layer-01 border border-ui-03 rounded p-6 hover:border-interactive-01 cursor-pointer transition-all hover:shadow-lg"
                >
                  {/* Image Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 bg-ui-03 rounded flex items-center justify-center">
                        <Package className="h-6 w-6 text-interactive-01" />
                      </div>
                      <div>
                        <h3 className="carbon-type-productive-heading-01 text-text-01 truncate">
                          {image.name || "Unknown"}
                        </h3>
                        <p className="text-xs text-text-03">{image.version || "latest"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-text-02 mb-4 line-clamp-2">
                    {image.metadata?.description || "No description"}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(image.metadata?.tags || []).slice(0, 3).map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-ui-03 text-text-02 rounded text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between pt-4 border-t border-ui-03">
                    <div className="flex items-center gap-2">
                      {image.scan_results?.score && image.scan_results.score > 0 && (
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${getScoreColor(
                            image.scan_results.score
                          )}`}
                        >
                          Score: {image.scan_results.score}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-03">
                      {isScanned(image.scan_results?.summary?.total ?? -1)
                        ? `${image.scan_results?.summary?.total ?? 0} vulns`
                        : "Not scanned"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredImages.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <Package className="h-16 w-16 text-text-03 mx-auto mb-4" />
            <p className="carbon-type-body-01 text-text-02">No images found</p>
          </div>
        )}
      </div>

      {/* Image Detail Modal - Portal to body to ensure proper z-index */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
          style={{ zIndex: 9999 }}
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-layer-01 border border-ui-03 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between p-6 border-b border-ui-03">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 bg-ui-03 rounded flex items-center justify-center">
                  <Package className="h-8 w-8 text-interactive-01" />
                </div>
                <div>
                  <h2 className="carbon-type-productive-heading-03 text-text-01">
                    {selectedImage.name}
                  </h2>
                  <p className="text-sm text-text-03">
                    by {selectedImage.metadata?.maintainer || "Unknown"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-2 hover:bg-ui-03 rounded transition-colors"
              >
                <X className="h-5 w-5 text-text-02" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Description */}
              <div>
                <h3 className="carbon-type-productive-heading-01 text-text-01 mb-2">
                  Description
                </h3>
                <p className="text-sm text-text-02">
                  {selectedImage.metadata?.description || "No description available"}
                </p>
              </div>

              {/* Pull Command */}
              {selectedImage.pull_command && (
                <div>
                  <h3 className="carbon-type-productive-heading-01 text-text-01 mb-2">
                    Pull Command
                  </h3>
                  <div className="flex items-center gap-2 bg-field-01 border border-ui-04 rounded p-3">
                    <code className="flex-1 text-sm text-text-01 font-mono">
                      {selectedImage.pull_command}
                    </code>
                    <button
                      onClick={() => copyToClipboard(selectedImage.pull_command!)}
                      className="p-2 hover:bg-ui-03 rounded transition-colors relative"
                      title="Copy to clipboard"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4 text-text-02" />
                      )}
                    </button>
                  </div>
                  {copied && (
                    <p className="text-xs text-green-500 mt-1">Copied to clipboard!</p>
                  )}
                </div>
              )}

              {/* Available Versions */}
              {selectedImage.versions && selectedImage.versions.length > 0 && (
                <div>
                  <h3 className="carbon-type-productive-heading-01 text-text-01 mb-3">
                    Available Versions
                  </h3>
                  <div className="border border-ui-03 rounded overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-ui-03">
                        <tr>
                          <th className="text-left p-3 text-sm font-medium text-text-01">
                            Version
                          </th>
                          <th className="text-left p-3 text-sm font-medium text-text-01">
                            Vulnerabilities
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedImage.versions || []).map((version, idx) => {
                          if (!version) return null;

                          const vulns = version.vulnerabilities || {
                            total: -1,
                            critical: 0,
                            high: 0,
                            medium: 0,
                            low: 0,
                          };

                          return (
                            <tr key={idx} className="border-t border-ui-03">
                              <td className="p-3 text-sm text-text-01">
                                {version.version || "Unknown"}
                              </td>
                              <td className="p-3 text-sm text-text-02">
                                {isScanned(vulns.total) ? (
                                  <>
                                    {vulns.critical > 0 && (
                                      <span className="text-red-500 mr-2">
                                        {vulns.critical}C
                                      </span>
                                    )}
                                    {vulns.high > 0 && (
                                      <span className="text-orange-500 mr-2">
                                        {vulns.high}H
                                      </span>
                                    )}
                                    {vulns.medium > 0 && (
                                      <span className="text-yellow-500 mr-2">
                                        {vulns.medium}M
                                      </span>
                                    )}
                                    {vulns.low > 0 && (
                                      <span className="text-blue-500">
                                        {vulns.low}L
                                      </span>
                                    )}
                                    {vulns.total === 0 && (
                                      <span className="text-green-500">Clean</span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-xs text-text-03">Not scanned</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Dockerfile */}
              {selectedImage.dockerfile_content && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="carbon-type-productive-heading-01 text-text-01">
                      Dockerfile
                    </h3>
                    <button
                      onClick={() => setShowDockerfile(!showDockerfile)}
                      className="text-xs text-interactive-01 hover:underline"
                    >
                      {showDockerfile ? "Hide" : "Show"}
                    </button>
                  </div>
                  {showDockerfile && (
                    <div className="bg-field-01 border border-ui-04 rounded p-4 overflow-x-auto">
                      <pre className="text-xs text-text-01 font-mono whitespace-pre-wrap">
                        {selectedImage.dockerfile_content}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Build Logs */}
              {selectedImage.build_info?.build_logs && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="carbon-type-productive-heading-01 text-text-01">
                      Build Logs
                    </h3>
                    <button
                      onClick={() => setShowBuildLogs(!showBuildLogs)}
                      className="text-xs text-interactive-01 hover:underline"
                    >
                      {showBuildLogs ? "Hide" : "Show"}
                    </button>
                  </div>
                  {showBuildLogs && (
                    <div className="bg-field-01 border border-ui-04 rounded p-4 overflow-x-auto max-h-96 overflow-y-auto">
                      <pre className="text-xs text-text-01 font-mono whitespace-pre-wrap">
                        {selectedImage.build_info.build_logs}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Build Info */}
              {selectedImage.build_info && (
                <div>
                  <h3 className="carbon-type-productive-heading-01 text-text-01 mb-2">
                    Build Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {selectedImage.build_info.built_at && (
                      <div>
                        <span className="text-text-03">Built:</span>
                        <span className="text-text-01 ml-2">
                          {new Date(selectedImage.build_info.built_at).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {selectedImage.build_info.build_duration && (
                      <div>
                        <span className="text-text-03">Duration:</span>
                        <span className="text-text-01 ml-2">
                          {selectedImage.build_info.build_duration}
                        </span>
                      </div>
                    )}
                    {selectedImage.build_info.image_size && (
                      <div>
                        <span className="text-text-03">Size:</span>
                        <span className="text-text-01 ml-2">
                          {formatBytes(selectedImage.build_info.image_size)}
                        </span>
                      </div>
                    )}
                    {selectedImage.build_info.status && (
                      <div>
                        <span className="text-text-03">Status:</span>
                        <span
                          className={`ml-2 px-2 py-0.5 rounded text-xs ${
                            selectedImage.build_info.status === "success"
                              ? "bg-green-500/10 text-green-500"
                              : selectedImage.build_info.status === "failed"
                              ? "bg-red-500/10 text-red-500"
                              : "bg-yellow-500/10 text-yellow-500"
                          }`}
                        >
                          {selectedImage.build_info.status}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Features/Tags */}
              {selectedImage.metadata?.tags && selectedImage.metadata.tags.length > 0 && (
                <div>
                  <h3 className="carbon-type-productive-heading-01 text-text-01 mb-2">
                    Features
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(selectedImage.metadata.tags || []).map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-ui-03 text-text-01 rounded text-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-ui-03">
                <button
                  onClick={() => navigate("/security/layers")}
                  className="flex items-center gap-2 px-4 py-2 bg-interactive-01 text-white rounded hover:bg-interactive-02 transition-colors"
                >
                  <Layers className="h-4 w-4" />
                  Layer Analysis
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
