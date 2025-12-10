import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  artifactoryApi,
  RepositoryInfo,
  ImageDetails,
  Manifest,
  ImageConfig,
  DockerfileResponse,
} from "@/services/artifactoryApi";
import {
  Search,
  Loader2,
  Package,
  Tag,
  Layers,
  Server,
  CheckCircle,
  XCircle,
  FileCode,
  Info,
  ChevronRight,
  Database,
  Clock,
  Cpu,
  HardDrive,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Shield,
} from "lucide-react";

interface RepositoryWithInfo {
  name: string;
  info?: RepositoryInfo;
  isLoading: boolean;
}

interface ScanSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
}

interface Vulnerability {
  id: string;
  cve: string;
  title: string;
  description: string;
  severity: string;
  score?: string;
  category: string;
  solution?: string;
  package?: string;
  version?: string;
}

interface ScanResult {
  image_name: string;
  scan_date: string;
  summary: ScanSummary;
  vulnerabilities: Vulnerability[];
}

export default function ArtifactoryBrowser() {
  const { toast } = useToast();

  // Check connectivity status from Settings
  const [isConnected, setIsConnected] = useState(false);

  // Repository state
  const [repositories, setRepositories] = useState<RepositoryWithInfo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [repoSearchQuery, setRepoSearchQuery] = useState("");

  // Image state
  const [images, setImages] = useState<string[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageSearchQuery, setImageSearchQuery] = useState("");

  // Tag state
  const [tags, setTags] = useState<string[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Details state
  const [imageDetails, setImageDetails] = useState<ImageDetails | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [config, setConfig] = useState<ImageConfig | null>(null);
  const [dockerfile, setDockerfile] = useState<DockerfileResponse | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Scan state
  const [scanningImages, setScanningImages] = useState<Set<string>>(new Set());
  const [scanningRepos, setScanningRepos] = useState<Set<string>>(new Set());
  const [refreshingImages, setRefreshingImages] = useState<Set<string>>(new Set());
  const [scanResults, setScanResults] = useState<Map<string, ScanResult>>(new Map());
  const [selectedScanResult, setSelectedScanResult] = useState<ScanResult | null>(null);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [repoVulnCounts, setRepoVulnCounts] = useState<Map<string, number>>(new Map());

  // Check Artifactory connectivity on mount
  useEffect(() => {
    checkConnectivity();
  }, []);

  // Load repositories when connected
  useEffect(() => {
    if (isConnected) {
      loadRepositories();
    }
  }, [isConnected]);

  // Cache management - 5 minutes TTL by default
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  const CACHE_KEY_PREFIX = 'artifactory_scan_cache_';

  const getCachedScanResult = (scanKey: string): ScanResult | null => {
    try {
      const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${scanKey}`);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();

      // Check if cache is still valid
      if (now - timestamp < CACHE_TTL_MS) {
        return data;
      }

      // Cache expired, remove it
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${scanKey}`);
      return null;
    } catch (error) {
      console.error('Failed to read cache:', error);
      return null;
    }
  };

  const setCachedScanResult = (scanKey: string, scanResult: ScanResult) => {
    try {
      const cacheData = {
        data: scanResult,
        timestamp: Date.now()
      };
      localStorage.setItem(`${CACHE_KEY_PREFIX}${scanKey}`, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Failed to write cache:', error);
    }
  };

  const checkConnectivity = async () => {
    try {
      const artifactoryUrl = localStorage.getItem("artifactory_url") || "artifactory.digikala.com";
      const result = await artifactoryApi.checkConnectivityGet(artifactoryUrl);
      setIsConnected(result.connected);

      if (!result.connected) {
        toast({
          title: "Not Connected",
          description: "Please configure Artifactory credentials in Settings",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      setIsConnected(false);
      toast({
        title: "Connection Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadRepositories = async () => {
    setIsLoadingRepos(true);
    try {
      const result = await artifactoryApi.listRepositories();
      const reposWithInfo: RepositoryWithInfo[] = result.repositories.map(name => ({
        name,
        isLoading: false,
      }));
      setRepositories(reposWithInfo);

      // Load info for each repository in background
      reposWithInfo.forEach(async (repo, index) => {
        try {
          const info = await artifactoryApi.getRepositoryInfo(repo.name);
          setRepositories(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], info, isLoading: false };
            return updated;
          });
        } catch (error) {
          console.error(`Failed to load info for ${repo.name}:`, error);
        }
      });
    } catch (error: any) {
      toast({
        title: "Failed to load repositories",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const fetchLatestScanResult = async (repoKey: string, imageName: string, tag?: string, useCache: boolean = true): Promise<ScanResult | null> => {
    const artifactoryUrl = localStorage.getItem("artifactory_url") || "artifactory.digikala.com";
    const scanKey = `${repoKey}/${imageName}`;

    // Check cache first
    if (useCache) {
      const cached = getCachedScanResult(scanKey);
      if (cached) {
        console.log(`Using cached scan result for ${scanKey}`);
        return cached;
      }
    }

    try {
      // If no tag specified, try to get the first available tag
      let imageTag = tag;
      if (!imageTag) {
        try {
          const tagsResult = await artifactoryApi.listTags(repoKey, imageName, 10);
          if (tagsResult.tags.length > 0) {
            // Use the first tag (most recent)
            imageTag = tagsResult.tags[0];
          } else {
            console.warn(`No tags found for ${repoKey}/${imageName}`);
            return null;
          }
        } catch (error) {
          console.error(`Failed to fetch tags for ${repoKey}/${imageName}:`, error);
          return null;
        }
      }

      const fullImageName = `${artifactoryUrl}/${repoKey}/${imageName}:${imageTag}`;

      const response = await fetch(
        `http://localhost:8080/api/v2/security/image/saved/latest?image=${encodeURIComponent(fullImageName)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" }
        }
      );

      if (response.status === 200) {
        const data = await response.json();

        const scanResult: ScanResult = {
          image_name: data.image_name,
          scan_date: data.scan_time,
          summary: data.summary,
          vulnerabilities: data.vulnerabilities || []
        };

        // Cache the result
        setCachedScanResult(scanKey, scanResult);

        return scanResult;
      }
      return null;
    } catch (error) {
      console.error(`Failed to fetch scan result for ${repoKey}/${imageName}:`, error);
      return null;
    }
  };

  const refreshScanResult = async (repoKey: string, imageName: string) => {
    const scanKey = `${repoKey}/${imageName}`;
    setRefreshingImages(prev => new Set(prev).add(scanKey));

    try {
      // Bypass cache to get fresh data
      const scanResult = await fetchLatestScanResult(repoKey, imageName, undefined, false);
      if (scanResult) {
        setScanResults(prev => {
          const next = new Map(prev);
          next.set(scanKey, scanResult);
          return next;
        });

        toast({
          title: "Scan Result Refreshed",
          description: `Updated scan data for ${imageName}`,
        });
      } else {
        toast({
          title: "No Scan Results",
          description: `No scan results found for ${imageName}`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Refresh Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setRefreshingImages(prev => {
        const next = new Set(prev);
        next.delete(scanKey);
        return next;
      });
    }
  };

  const loadImages = async (repoKey: string) => {
    setSelectedRepo(repoKey);
    setSelectedImage(null);
    setSelectedTag(null);
    setIsLoadingImages(true);
    setScanResults(new Map());

    try {
      const result = await artifactoryApi.listImages(repoKey);
      setImages(result.images);

      let totalVulns = 0;

      // Load scan results for each image in background
      const scanPromises = result.images.map(async (imageName) => {
        // Try to fetch the latest scan result for this image
        const scanResult = await fetchLatestScanResult(repoKey, imageName);
        if (scanResult) {
          totalVulns += scanResult.summary.total;
          setScanResults(prev => {
            const next = new Map(prev);
            next.set(`${repoKey}/${imageName}`, scanResult);
            return next;
          });
        }
      });

      // Wait for all scans to complete and update repo vuln count
      await Promise.all(scanPromises);
      setRepoVulnCounts(prev => {
        const next = new Map(prev);
        next.set(repoKey, totalVulns);
        return next;
      });
    } catch (error: any) {
      toast({
        title: "Failed to load images",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingImages(false);
    }
  };

  const loadTags = async (repoKey: string, imageName: string) => {
    setSelectedImage(imageName);
    setSelectedTag(null);
    setIsLoadingTags(true);
    try {
      const result = await artifactoryApi.listTags(repoKey, imageName, 100);
      setTags(result.tags);
    } catch (error: any) {
      toast({
        title: "Failed to load tags",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingTags(false);
    }
  };

  const loadTagDetails = async (repoKey: string, imageName: string, tag: string) => {
    setSelectedTag(tag);
    setIsLoadingDetails(true);
    setImageDetails(null);
    setManifest(null);
    setConfig(null);
    setDockerfile(null);

    try {
      // Load all details in parallel
      const [details, manifestData] = await Promise.all([
        artifactoryApi.getImageDetails(repoKey, imageName, tag),
        artifactoryApi.getManifest(repoKey, imageName, tag),
      ]);

      setImageDetails(details);
      setManifest(manifestData);

      // Load config and dockerfile
      if (manifestData.config?.digest) {
        try {
          const configData = await artifactoryApi.getImageConfig(repoKey, imageName, manifestData.config.digest);
          setConfig(configData);
        } catch (error) {
          console.error("Failed to load config:", error);
        }
      }

      try {
        const dockerfileData = await artifactoryApi.getDockerfile(repoKey, imageName, tag);
        if (dockerfileData.available) {
          setDockerfile(dockerfileData);
        }
      } catch (error) {
        console.error("Failed to load Dockerfile:", error);
      }
    } catch (error: any) {
      toast({
        title: "Failed to load tag details",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const scanImage = async (repoKey: string, imageName: string) => {
    const scanKey = `${repoKey}/${imageName}`;
    const artifactoryUrl = localStorage.getItem("artifactory_url") || "artifactory.digikala.com";

    setScanningImages(prev => new Set(prev).add(scanKey));

    try {
      // First, get all tags for this image
      const tagsResult = await artifactoryApi.listTags(repoKey, imageName, 1000);

      if (tagsResult.tags.length === 0) {
        throw new Error("No tags found for this image");
      }

      toast({
        title: "Scan Started",
        description: `Scanning ${tagsResult.tags.length} tag(s) for ${imageName}`,
      });

      let completedScans = 0;
      let failedScans = 0;

      // Scan each tag
      for (const tag of tagsResult.tags) {
        const fullImageName = `${artifactoryUrl}/${repoKey}/${imageName}:${tag}`;

        try {
          const response = await fetch("http://localhost:8080/api/v2/security/image/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_name: fullImageName, force_rescan: false }),
          });

          if (response.status !== 202) {
            const errorData = await response.json();
            console.error(`Failed to start scan for ${fullImageName}:`, errorData);
            failedScans++;
            continue;
          }

          const { job_id } = await response.json();

          // Poll for scan completion
          const pollInterval = setInterval(async () => {
            try {
              const statusResponse = await fetch(
                `http://localhost:8080/api/v2/security/image/status/${job_id}`
              );

              if (statusResponse.status === 200) {
                const jobStatus = await statusResponse.json();

                if (jobStatus.status === "completed") {
                  clearInterval(pollInterval);
                  completedScans++;

                  // Fetch the latest scan result after this tag completes (bypass cache for fresh data)
                  fetchLatestScanResult(repoKey, imageName, undefined, false).then(scanResult => {
                    if (scanResult) {
                      setScanResults(prev => {
                        const next = new Map(prev);
                        next.set(scanKey, scanResult);
                        return next;
                      });
                    }
                  });

                  if (completedScans + failedScans === tagsResult.tags.length) {
                    setScanningImages(prev => {
                      const next = new Set(prev);
                      next.delete(scanKey);
                      return next;
                    });

                    // Recalculate repo vulnerability counts
                    const scanResult = await fetchLatestScanResult(repoKey, imageName, undefined, false);
                    if (scanResult) {
                      setRepoVulnCounts(prev => {
                        const next = new Map(prev);
                        const currentCount = next.get(repoKey) || 0;
                        next.set(repoKey, currentCount + scanResult.summary.total);
                        return next;
                      });
                    }

                    toast({
                      title: "Scan Completed",
                      description: `${imageName}: ${completedScans} succeeded, ${failedScans} failed`,
                    });
                  }
                } else if (jobStatus.status === "failed") {
                  clearInterval(pollInterval);
                  failedScans++;

                  if (completedScans + failedScans === tagsResult.tags.length) {
                    setScanningImages(prev => {
                      const next = new Set(prev);
                      next.delete(scanKey);
                      return next;
                    });
                    toast({
                      title: "Scan Completed",
                      description: `${imageName}: ${completedScans} succeeded, ${failedScans} failed`,
                      variant: failedScans > 0 ? "destructive" : "default",
                    });
                  }
                }
              }
            } catch (error) {
              console.error("Failed to poll scan status:", error);
            }
          }, 2000);

          // Timeout after 10 minutes
          setTimeout(() => {
            clearInterval(pollInterval);
          }, 600000);
        } catch (error) {
          console.error(`Failed to scan ${fullImageName}:`, error);
          failedScans++;
        }
      }

      // If all scans failed immediately
      if (failedScans === tagsResult.tags.length) {
        setScanningImages(prev => {
          const next = new Set(prev);
          next.delete(scanKey);
          return next;
        });
        toast({
          title: "Scan Failed",
          description: `Failed to scan all tags for ${imageName}`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      setScanningImages(prev => {
        const next = new Set(prev);
        next.delete(scanKey);
        return next;
      });
      toast({
        title: "Scan Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const scanRepository = async (repoKey: string) => {
    setScanningRepos(prev => new Set(prev).add(repoKey));

    try {
      // Get all images in the repository
      const result = await artifactoryApi.listImages(repoKey);

      toast({
        title: "Repository Scan Started",
        description: `Scanning ${result.images.length} images from ${repoKey}`,
      });

      // Scan each image
      for (const imageName of result.images) {
        await scanImage(repoKey, imageName);
      }

      setScanningRepos(prev => {
        const next = new Set(prev);
        next.delete(repoKey);
        return next;
      });
    } catch (error: any) {
      setScanningRepos(prev => {
        const next = new Set(prev);
        next.delete(repoKey);
        return next;
      });
      toast({
        title: "Repository Scan Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatDate = (dateStr: string): string => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const filteredRepos = repositories.filter(repo =>
    repo.name.toLowerCase().includes(repoSearchQuery.toLowerCase())
  );

  const filteredImages = images.filter(image =>
    image.toLowerCase().includes(imageSearchQuery.toLowerCase())
  );

  if (!isConnected) {
    return (
      <DashboardLayout>
        <div className="col-span-full flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <XCircle className="h-16 w-16 text-red-500" />
          <h2 className="carbon-type-productive-heading-03 text-text-01">
            Not Connected to Artifactory
          </h2>
          <p className="carbon-type-body-02 text-text-02 text-center max-w-md">
            Please configure your Artifactory credentials in the Settings page to browse repositories and images.
          </p>
          <Button onClick={() => window.location.href = "/settings"}>
            Go to Settings
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="col-span-full">
        <div className="mb-6">
          <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2">
            Artifactory Browser
          </h1>
          <p className="carbon-type-body-02 text-text-02">
            Browse Docker repositories, images, and tags from your Artifactory registry
          </p>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* Left Panel - Repository Browser */}
          <div className="col-span-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 carbon-type-productive-heading-02">
                  <Database className="h-5 w-5" />
                  Repositories
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-03" />
                  <Input
                    placeholder="Search repositories..."
                    value={repoSearchQuery}
                    onChange={(e) => setRepoSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {isLoadingRepos ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="p-3 rounded border bg-layer-01 border-ui-03">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 space-y-2">
                              <Skeleton className="h-5 w-2/3" />
                              <div className="flex items-center gap-2">
                                <Skeleton className="h-4 w-16" />
                                <Skeleton className="h-4 w-20" />
                              </div>
                            </div>
                            <Skeleton className="h-7 w-7 rounded" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    filteredRepos.map((repo) => (
                      <div
                        key={repo.name}
                        className={`p-4 rounded-lg border transition-all ${
                          selectedRepo === repo.name
                            ? "bg-ui-03 border-interactive-01 shadow-sm"
                            : "bg-layer-01 border-ui-03 hover:border-ui-04 hover:shadow-sm"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => loadImages(repo.name)}
                          >
                            <div className="carbon-type-body-01 text-text-01 font-semibold truncate mb-2">
                              {repo.name}
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2 text-xs">
                                {repo.info ? (
                                  <>
                                    <Badge variant="outline" className="text-xs font-medium px-2 py-0.5">
                                      {repo.info.type}
                                    </Badge>
                                    <span className="carbon-type-label-01 text-text-03">
                                      {repo.info.image_count} {repo.info.image_count === 1 ? 'image' : 'images'}
                                    </span>
                                  </>
                                ) : (
                                  <Loader2 className="h-3 w-3 animate-spin text-text-03" />
                                )}
                              </div>
                              {repoVulnCounts.has(repo.name) && repoVulnCounts.get(repo.name)! > 0 && (
                                <div className="flex items-center gap-1.5 text-xs">
                                  <AlertTriangle className="h-3 w-3 text-orange-500" />
                                  <span className="carbon-type-label-01 text-text-03">
                                    {repoVulnCounts.get(repo.name)} total {repoVulnCounts.get(repo.name) === 1 ? 'vulnerability' : 'vulnerabilities'}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                scanRepository(repo.name);
                              }}
                              disabled={scanningRepos.has(repo.name)}
                              className="h-7 w-7 p-0"
                              title="Scan all images in repository"
                            >
                              {scanningRepos.has(repo.name) ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Shield className="h-3 w-3" />
                              )}
                            </Button>
                            <ChevronRight className="h-4 w-4 text-text-03 flex-shrink-0" />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Center Panel - Image List */}
          <div className="col-span-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 carbon-type-productive-heading-02">
                  <Package className="h-5 w-5" />
                  Images
                  {selectedRepo && (
                    <span className="carbon-type-label-01 text-text-03">
                      in {selectedRepo}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedRepo && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-03" />
                    <Input
                      placeholder="Search images..."
                      value={imageSearchQuery}
                      onChange={(e) => setImageSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                )}

                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {!selectedRepo ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <Package className="h-12 w-12 text-text-03 mb-3" />
                      <p className="carbon-type-body-02 text-text-02">
                        Select a repository to view images
                      </p>
                    </div>
                  ) : isLoadingImages ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="p-3 rounded border bg-layer-01 border-ui-03">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 space-y-2">
                              <Skeleton className="h-5 w-3/4" />
                              <Skeleton className="h-4 w-1/2" />
                            </div>
                            <div className="flex items-center gap-1">
                              <Skeleton className="h-7 w-7 rounded" />
                              <Skeleton className="h-7 w-7 rounded" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredImages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <Package className="h-12 w-12 text-text-03 mb-3" />
                      <p className="carbon-type-body-02 text-text-02">
                        No images found
                      </p>
                    </div>
                  ) : (
                    filteredImages.map((image) => {
                      const scanKey = `${selectedRepo}/${image}`;
                      const isScanning = scanningImages.has(scanKey);
                      const scanResult = scanResults.get(scanKey);

                      return (
                        <div
                          key={image}
                          className={`p-4 rounded-lg border transition-all ${
                            selectedImage === image
                              ? "bg-ui-03 border-interactive-01 shadow-sm"
                              : "bg-layer-01 border-ui-03 hover:border-ui-04 hover:shadow-sm"
                          }`}
                        >
                          <div className="space-y-3">
                            {/* Image Header */}
                            <div className="flex items-start justify-between gap-3">
                              <div
                                className="flex-1 min-w-0 cursor-pointer"
                                onClick={() => selectedRepo && loadTags(selectedRepo, image)}
                              >
                                <div className="carbon-type-body-01 text-text-01 font-semibold truncate mb-1">
                                  {image}
                                </div>
                                {scanResult && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="carbon-type-label-01 text-text-03">
                                      {scanResult.summary.total} {scanResult.summary.total === 1 ? 'vulnerability' : 'vulnerabilities'}
                                    </span>
                                    <span className="text-text-03">•</span>
                                    <span className="carbon-type-label-01 text-text-03">
                                      {new Date(scanResult.scan_date).toLocaleDateString()}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Action Buttons */}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {scanResult && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      selectedRepo && refreshScanResult(selectedRepo, image);
                                    }}
                                    disabled={refreshingImages.has(scanKey)}
                                    className="h-7 w-7 p-0"
                                    title="Refresh scan results"
                                  >
                                    {refreshingImages.has(scanKey) ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <RefreshCw className="h-3 w-3" />
                                    )}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    selectedRepo && scanImage(selectedRepo, image);
                                  }}
                                  disabled={isScanning}
                                  className="h-7 w-7 p-0"
                                  title="Scan image"
                                >
                                  {isScanning ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Shield className="h-3 w-3" />
                                  )}
                                </Button>
                                <ChevronRight className="h-4 w-4 text-text-03 flex-shrink-0" />
                              </div>
                            </div>

                            {/* Vulnerability Badges */}
                            {scanResult && (
                              <div className="flex flex-wrap items-center gap-2 pl-0">
                                {scanResult.summary.critical > 0 && (
                                  <Badge className="text-xs font-medium bg-red-600 hover:bg-red-600 text-white border-0 px-2.5 py-0.5">
                                    Critical: {scanResult.summary.critical}
                                  </Badge>
                                )}
                                {scanResult.summary.high > 0 && (
                                  <Badge className="text-xs font-medium bg-orange-500 hover:bg-orange-500 text-white border-0 px-2.5 py-0.5">
                                    High: {scanResult.summary.high}
                                  </Badge>
                                )}
                                {scanResult.summary.medium > 0 && (
                                  <Badge className="text-xs font-medium bg-yellow-500 hover:bg-yellow-500 text-white border-0 px-2.5 py-0.5">
                                    Medium: {scanResult.summary.medium}
                                  </Badge>
                                )}
                                {scanResult.summary.low > 0 && (
                                  <Badge className="text-xs font-medium bg-blue-500 hover:bg-blue-500 text-white border-0 px-2.5 py-0.5">
                                    Low: {scanResult.summary.low}
                                  </Badge>
                                )}
                                {scanResult.summary.total > 0 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedScanResult(scanResult);
                                      setShowScanDialog(true);
                                    }}
                                    className="h-6 px-3 text-xs ml-auto"
                                  >
                                    View Details
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Tags & Details */}
          <div className="col-span-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 carbon-type-productive-heading-02">
                  <Tag className="h-5 w-5" />
                  Tags & Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedImage ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Tag className="h-12 w-12 text-text-03 mb-3" />
                    <p className="carbon-type-body-02 text-text-02">
                      Select an image to view tags
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Tags List */}
                    <div className="space-y-2">
                      <h3 className="carbon-type-label-01 text-text-02 uppercase">
                        Available Tags ({tags.length})
                      </h3>
                      <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        {isLoadingTags ? (
                          <div className="space-y-1">
                            {[1, 2, 3, 4].map((i) => (
                              <Skeleton key={i} className="h-10 w-full" />
                            ))}
                          </div>
                        ) : (
                          tags.map((tag) => (
                            <div
                              key={tag}
                              onClick={() => selectedRepo && selectedImage && loadTagDetails(selectedRepo, selectedImage, tag)}
                              className={`px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                                selectedTag === tag
                                  ? "bg-ui-03 border-interactive-01 shadow-sm"
                                  : "bg-layer-01 border-ui-03 hover:border-ui-04 hover:shadow-sm"
                              }`}
                            >
                              <span className="carbon-type-body-01 text-text-01 font-medium">
                                {tag}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Image Details */}
                    {selectedTag && (
                      <div className="border-t border-ui-03 pt-4">
                        {isLoadingDetails ? (
                          <div className="space-y-4">
                            <Skeleton className="h-10 w-full" />
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <Skeleton className="h-16 w-full" />
                                <Skeleton className="h-16 w-full" />
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <Skeleton className="h-16 w-full" />
                                <Skeleton className="h-16 w-full" />
                              </div>
                              <Skeleton className="h-20 w-full" />
                            </div>
                          </div>
                        ) : imageDetails ? (
                          <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsList className="grid w-full grid-cols-5">
                              <TabsTrigger value="overview">Overview</TabsTrigger>
                              <TabsTrigger value="manifest">Manifest</TabsTrigger>
                              <TabsTrigger value="config">Config</TabsTrigger>
                              <TabsTrigger value="layers">Layers</TabsTrigger>
                              <TabsTrigger value="dockerfile">Dockerfile</TabsTrigger>
                            </TabsList>

                            <TabsContent value="overview" className="space-y-3 max-h-[400px] overflow-y-auto">
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="flex items-start gap-2">
                                    <Cpu className="h-4 w-4 text-text-03 mt-0.5" />
                                    <div>
                                      <div className="carbon-type-label-01 text-text-03">Architecture</div>
                                      <div className="carbon-type-body-01 text-text-01">{imageDetails.architecture}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <Server className="h-4 w-4 text-text-03 mt-0.5" />
                                    <div>
                                      <div className="carbon-type-label-01 text-text-03">OS</div>
                                      <div className="carbon-type-body-01 text-text-01">{imageDetails.os}</div>
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="flex items-start gap-2">
                                    <HardDrive className="h-4 w-4 text-text-03 mt-0.5" />
                                    <div>
                                      <div className="carbon-type-label-01 text-text-03">Size</div>
                                      <div className="carbon-type-body-01 text-text-01">{formatBytes(imageDetails.size)}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <Layers className="h-4 w-4 text-text-03 mt-0.5" />
                                    <div>
                                      <div className="carbon-type-label-01 text-text-03">Layers</div>
                                      <div className="carbon-type-body-01 text-text-01">{imageDetails.total_layers}</div>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-start gap-2">
                                  <Calendar className="h-4 w-4 text-text-03 mt-0.5" />
                                  <div>
                                    <div className="carbon-type-label-01 text-text-03">Created</div>
                                    <div className="carbon-type-body-01 text-text-01">{formatDate(imageDetails.created)}</div>
                                  </div>
                                </div>

                                {config?.config?.Labels && Object.keys(config.config.Labels).length > 0 && (
                                  <div>
                                    <div className="carbon-type-label-01 text-text-03 mb-2">Labels</div>
                                    <div className="space-y-1">
                                      {Object.entries(config.config.Labels).map(([key, value]) => (
                                        <div key={key} className="flex items-start gap-2 bg-ui-01 p-2 rounded">
                                          <span className="carbon-type-label-01 text-text-02">{key}:</span>
                                          <span className="carbon-type-body-02 text-text-01 flex-1">{value}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {config?.config?.Env && config.config.Env.length > 0 && (
                                  <div>
                                    <div className="carbon-type-label-01 text-text-03 mb-2">Environment Variables</div>
                                    <div className="space-y-1">
                                      {config.config.Env.map((env, idx) => (
                                        <div key={idx} className="bg-ui-01 p-2 rounded">
                                          <code className="carbon-type-code-01 text-text-01">{env}</code>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {config?.config?.ExposedPorts && Object.keys(config.config.ExposedPorts).length > 0 && (
                                  <div>
                                    <div className="carbon-type-label-01 text-text-03 mb-2">Exposed Ports</div>
                                    <div className="flex flex-wrap gap-2">
                                      {Object.keys(config.config.ExposedPorts).map((port) => (
                                        <Badge key={port} variant="outline">{port}</Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {config?.config?.Entrypoint && (
                                  <div>
                                    <div className="carbon-type-label-01 text-text-03 mb-2">Entrypoint</div>
                                    <div className="bg-ui-01 p-2 rounded">
                                      <code className="carbon-type-code-01 text-text-01">
                                        {config.config.Entrypoint.join(" ")}
                                      </code>
                                    </div>
                                  </div>
                                )}

                                {config?.config?.Cmd && (
                                  <div>
                                    <div className="carbon-type-label-01 text-text-03 mb-2">Command</div>
                                    <div className="bg-ui-01 p-2 rounded">
                                      <code className="carbon-type-code-01 text-text-01">
                                        {config.config.Cmd.join(" ")}
                                      </code>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </TabsContent>

                            <TabsContent value="manifest" className="max-h-[400px] overflow-y-auto">
                              <pre className="bg-ui-01 p-4 rounded overflow-x-auto">
                                <code className="carbon-type-code-01 text-text-01">
                                  {JSON.stringify(manifest, null, 2)}
                                </code>
                              </pre>
                            </TabsContent>

                            <TabsContent value="config" className="max-h-[400px] overflow-y-auto">
                              <pre className="bg-ui-01 p-4 rounded overflow-x-auto">
                                <code className="carbon-type-code-01 text-text-01">
                                  {config ? JSON.stringify(config, null, 2) : "Loading..."}
                                </code>
                              </pre>
                            </TabsContent>

                            <TabsContent value="layers" className="max-h-[400px] overflow-y-auto">
                              <div className="space-y-2">
                                {imageDetails.layers.map((layer, idx) => (
                                  <div key={idx} className="bg-ui-01 p-3 rounded border border-ui-03">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="carbon-type-label-01 text-text-02">
                                        Layer {idx + 1}
                                      </span>
                                      <Badge variant="outline">{formatBytes(layer.size)}</Badge>
                                    </div>
                                    <code className="carbon-type-code-01 text-text-01 text-xs break-all">
                                      {layer.digest}
                                    </code>
                                  </div>
                                ))}
                              </div>
                            </TabsContent>

                            <TabsContent value="dockerfile" className="max-h-[400px] overflow-y-auto">
                              {dockerfile?.available ? (
                                <pre className="bg-ui-01 p-4 rounded overflow-x-auto">
                                  <code className="carbon-type-code-01 text-text-01">
                                    {dockerfile.content}
                                  </code>
                                </pre>
                              ) : (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                  <FileCode className="h-12 w-12 text-text-03 mb-3" />
                                  <p className="carbon-type-body-02 text-text-02">
                                    Dockerfile not available for this image
                                  </p>
                                </div>
                              )}
                            </TabsContent>
                          </Tabs>
                        ) : null}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Scan Details Dialog */}
        <Dialog open={showScanDialog} onOpenChange={setShowScanDialog}>
          <DialogContent className="max-w-6xl w-[90vw] h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-ui-03">
              <DialogTitle className="carbon-type-productive-heading-03">Scan Results</DialogTitle>
              <DialogDescription className="carbon-type-body-02">
                {selectedScanResult?.image_name}
              </DialogDescription>
            </DialogHeader>

            {selectedScanResult && (
              <div className="flex-1 overflow-y-auto px-6 pb-6">
                <div className="space-y-4 pt-4">
                  {/* Summary */}
                  <div className="grid grid-cols-5 gap-3">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-text-01">
                          {selectedScanResult.summary.total}
                        </div>
                        <div className="carbon-type-label-01 text-text-03">Total</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-500">
                          {selectedScanResult.summary.critical}
                        </div>
                        <div className="carbon-type-label-01 text-text-03">Critical</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-500">
                          {selectedScanResult.summary.high}
                        </div>
                        <div className="carbon-type-label-01 text-text-03">High</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-500">
                          {selectedScanResult.summary.medium}
                        </div>
                        <div className="carbon-type-label-01 text-text-03">Medium</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-500">
                          {selectedScanResult.summary.low}
                        </div>
                        <div className="carbon-type-label-01 text-text-03">Low</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Scan Date */}
                <div className="flex items-center gap-2 text-text-02 carbon-type-body-02">
                  <Clock className="h-4 w-4" />
                  <span>Scanned: {formatDate(selectedScanResult.scan_date)}</span>
                </div>

                {/* Vulnerabilities List */}
                <div className="space-y-3">
                  <h3 className="carbon-type-productive-heading-02 text-text-01">
                    Vulnerabilities ({selectedScanResult.vulnerabilities.length})
                  </h3>
                  <div className="space-y-3">
                    {selectedScanResult.vulnerabilities
                      .sort((a, b) => {
                        const severityOrder = {
                          'CRITICAL': 0,
                          'HIGH': 1,
                          'MEDIUM': 2,
                          'LOW': 3,
                          'UNKNOWN': 4,
                          'INFORMATIONAL': 5
                        };
                        const aOrder = severityOrder[a.severity.toUpperCase()] ?? 6;
                        const bOrder = severityOrder[b.severity.toUpperCase()] ?? 6;
                        return aOrder - bOrder;
                      })
                      .map((vuln, idx) => (
                      <Card key={idx} className="border-l-4" style={{
                        borderLeftColor:
                          vuln.severity.toUpperCase() === 'CRITICAL' ? '#dc2626' :
                          vuln.severity.toUpperCase() === 'HIGH' ? '#ea580c' :
                          vuln.severity.toUpperCase() === 'MEDIUM' ? '#ca8a04' :
                          vuln.severity.toUpperCase() === 'LOW' ? '#2563eb' : '#6b7280'
                      }}>
                        <CardContent className="pt-4">
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge className={`text-xs border-0 ${
                                    vuln.severity.toUpperCase() === 'CRITICAL' ? 'bg-red-600 hover:bg-red-600 text-white' :
                                    vuln.severity.toUpperCase() === 'HIGH' ? 'bg-orange-500 hover:bg-orange-500 text-white' :
                                    vuln.severity.toUpperCase() === 'MEDIUM' ? 'bg-yellow-500 hover:bg-yellow-500 text-white' :
                                    vuln.severity.toUpperCase() === 'LOW' ? 'bg-blue-500 hover:bg-blue-500 text-white' :
                                    vuln.severity.toUpperCase() === 'UNKNOWN' ? 'bg-gray-500 hover:bg-gray-500 text-white' :
                                    'bg-purple-500 hover:bg-purple-500 text-white'
                                  }`}>
                                    {vuln.severity}
                                  </Badge>
                                  <span className="carbon-type-body-01 font-medium text-text-01">
                                    {vuln.cve}
                                  </span>
                                  {vuln.score && (
                                    <Badge variant="outline" className="text-xs">
                                      Score: {vuln.score}
                                    </Badge>
                                  )}
                                </div>
                                <h4 className="carbon-type-body-01 text-text-01 mt-2 break-words">
                                  {vuln.title}
                                </h4>
                              </div>
                            </div>

                            {vuln.package && (
                              <div className="carbon-type-label-01 text-text-03">
                                <span className="font-semibold">Package:</span> {vuln.package} {vuln.version && `(${vuln.version})`}
                              </div>
                            )}

                            {vuln.description && (
                              <div className="carbon-type-body-02 text-text-02 break-words">
                                {vuln.description}
                              </div>
                            )}

                            {vuln.solution && (
                              <div className="bg-ui-01 p-3 rounded">
                                <div className="carbon-type-label-01 text-text-03 mb-1 font-semibold">Solution:</div>
                                <div className="carbon-type-body-02 text-text-01 break-words">
                                  {vuln.solution}
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
