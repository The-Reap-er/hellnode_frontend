import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Home,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Package,
  GitCompare,
} from "lucide-react";
import {
  TagVulnerabilityMetrics,
  TagComparisonResponse,
  TrendData,
} from "@shared/types/dashboard";
import { CarbonCheckbox } from "@/components/ui/carbon-checkbox";

type TabType = "overview" | "timeline" | "comparison";

export default function ImageDashboard() {
  const { "*": splatPath } = useParams<{ "*": string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [tags, setTags] = useState<TagVulnerabilityMetrics[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comparison, setComparison] = useState<TagComparisonResponse | null>(null);
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<"tag" | "total" | "critical">("total");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Get image name from splat route (everything after /dashboard/image/)
  // Handle both URL-encoded slashes (%2F) and actual slashes in the path
  const decodedImageName = splatPath
    ? decodeURIComponent(splatPath)
    : "";

  console.log("ImageDashboard - Raw splatPath:", splatPath);
  console.log("ImageDashboard - Decoded imageName:", decodedImageName);

  useEffect(() => {
    if (decodedImageName) {
      fetchTags();
      fetchTrends();
    }
  }, [decodedImageName]);

  useEffect(() => {
    if (selectedTags.length >= 2 && activeTab === "comparison") {
      fetchComparison();
    }
  }, [selectedTags, activeTab]);

  const fetchTags = async () => {
    setLoading(true);
    try {
      // Use query parameter endpoint which handles slashes correctly
      const response = await fetch(
        `http://localhost:8080/api/v1/dashboard/image/tags?image=${encodeURIComponent(
          decodedImageName
        )}`
      );

      if (response.ok) {
        const data = await response.json();
        const fetchedTags = data.tags || [];

        // If no tags returned, try fetching from search API
        if (fetchedTags.length === 0) {
          console.log("No tags from /tags endpoint, trying search fallback");
          await fetchTagsFromSearch();
        } else {
          setTags(fetchedTags);
        }
      } else {
        // API returned error, try fallback
        await fetchTagsFromSearch();
      }
    } catch (error) {
      console.error("Failed to fetch tags:", error);
      // Try fallback
      await fetchTagsFromSearch();
    } finally {
      setLoading(false);
    }
  };

  const fetchTagsFromSearch = async () => {
    try {
      // First, try the main vulnerabilities endpoint with query param
      const mainResponse = await fetch(
        `http://localhost:8080/api/v1/dashboard/image/vulnerabilities?image=${encodeURIComponent(
          decodedImageName
        )}`
      );

      if (mainResponse.ok) {
        const mainData = await mainResponse.json();
        if (mainData.tags && mainData.tags.length > 0) {
          setTags(mainData.tags);
          return;
        }
      }

      // Fallback: use search API which now includes per-tag data!
      const searchResponse = await fetch(
        `http://localhost:8080/api/v1/dashboard/search?q=${encodeURIComponent(
          decodedImageName
        )}&limit=1`
      );

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.images && searchData.images.length > 0) {
          const imageData = searchData.images[0];

          // Check if search API includes per-tag data (new backend feature!)
          if (imageData.tags && Array.isArray(imageData.tags) && imageData.tags.length > 0) {
            console.log("Using per-tag data from search API");
            setTags(imageData.tags);
            return;
          }

          // Old fallback: try to fetch individual tag data from timeline
          const tagNames = imageData.popular_tags || [];
          console.log("Falling back to timeline API for individual tags");

          const tagPromises = tagNames.map(async (tagName: string) => {
            try {
              // Try timeline API to get tag-specific data
              const timelineResponse = await fetch(
                `http://localhost:8080/api/v1/dashboard/vulnerabilities/${encodeURIComponent(
                  decodedImageName
                )}/timeline?tag=${encodeURIComponent(tagName)}&since=30d`
              );

              if (timelineResponse.ok) {
                const timelineData = await timelineResponse.json();
                if (timelineData.timeline && timelineData.timeline.length > 0) {
                  const latest = timelineData.timeline[0];
                  return {
                    tag: tagName,
                    last_scan: latest.scan_time,
                    vulnerabilities: latest.vulnerabilities,
                    scan_status: "success" as const,
                    scan_duration: "N/A",
                    cache_hit: false,
                    digest: "",
                    trend_direction: "new" as const,
                  };
                }
              }
            } catch (e) {
              console.error(`Failed to fetch data for tag ${tagName}:`, e);
            }

            // Last resort: use image-level data for this tag
            return {
              tag: tagName,
              last_scan: imageData.last_scan,
              vulnerabilities: imageData.latest_vuln_count,
              scan_status: "success" as const,
              scan_duration: "N/A",
              cache_hit: false,
              digest: "",
              trend_direction: "new" as const,
            };
          });

          const fetchedTags = await Promise.all(tagPromises);
          setTags(fetchedTags);
        }
      }
    } catch (error) {
      console.error("Failed to fetch tags from search:", error);
    }
  };

  const fetchComparison = async () => {
    if (selectedTags.length < 2) return;

    try {
      const tagList = selectedTags.join(",");
      // Use query parameter endpoint which handles slashes correctly
      const response = await fetch(
        `http://localhost:8080/api/v1/dashboard/image/comparison?image=${encodeURIComponent(
          decodedImageName
        )}&tags=${encodeURIComponent(tagList)}`
      );

      if (response.ok) {
        const data = await response.json();
        setComparison(data);
      } else {
        // API failed, build from local data
        buildComparisonFromTags();
      }
    } catch (error) {
      console.error("Failed to fetch comparison:", error);
      buildComparisonFromTags();
    }
  };

  const buildComparisonFromTags = () => {
    // Build comparison data from tags we already have
    const selectedTagData = tags.filter(tag => selectedTags.includes(tag.tag));

    if (selectedTagData.length < 2) return;

    // Find most and least secure
    const sortedByTotal = [...selectedTagData].sort((a, b) =>
      a.vulnerabilities.total - b.vulnerabilities.total
    );
    const mostSecure = sortedByTotal[0];
    const leastSecure = sortedByTotal[sortedByTotal.length - 1];

    // Build comparison response
    const comparisonData: TagComparisonResponse = {
      image_name: decodedImageName,
      comparison: selectedTagData,
      summary: {
        most_secure_tag: mostSecure.tag,
        least_secure_tag: leastSecure.tag,
        recommended_tag: mostSecure.tag,
        total_vuln_range: `${mostSecure.vulnerabilities.total}-${leastSecure.vulnerabilities.total} vulnerabilities`,
        critical_vuln_range: `${mostSecure.vulnerabilities.critical}-${leastSecure.vulnerabilities.critical} critical vulnerabilities`,
        recommendation: mostSecure.vulnerabilities.total === 0
          ? `Use ${mostSecure.tag} tag as it has no known vulnerabilities`
          : `Use ${mostSecure.tag} tag as it has the fewest vulnerabilities (${mostSecure.vulnerabilities.total} total)`
      },
      generated_at: new Date().toISOString()
    };

    setComparison(comparisonData);
  };

  const fetchTrends = async () => {
    try {
      // Use query parameter endpoint which handles slashes correctly
      // This endpoint returns both tags and trends data
      const response = await fetch(
        `http://localhost:8080/api/v1/dashboard/image/vulnerabilities?image=${encodeURIComponent(
          decodedImageName
        )}`
      );

      if (response.ok) {
        const data = await response.json();
        console.log("Vulnerabilities response (with trends):", data);

        if (data.trends && data.trends.timeline && data.trends.timeline.length > 0) {
          setTrends({
            image_name: data.image_name,
            timeline: data.trends.timeline,
            trends: data.trends,
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch trends:", error);
    }
  };

  const toggleTagSelection = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSort = (field: "tag" | "total" | "critical") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedTags = [...tags].sort((a, b) => {
    let compareValue = 0;
    if (sortField === "tag") {
      compareValue = a.tag.localeCompare(b.tag);
    } else if (sortField === "total") {
      compareValue = a.vulnerabilities.total - b.vulnerabilities.total;
    } else if (sortField === "critical") {
      compareValue = a.vulnerabilities.critical - b.vulnerabilities.critical;
    }
    return sortDirection === "asc" ? compareValue : -compareValue;
  });

  // Check if all tags have the same vulnerability counts (indicates backend issue)
  const hasDuplicateData = tags.length > 1 && tags.every((tag, _, arr) =>
    tag.vulnerabilities.total === arr[0].vulnerabilities.total &&
    tag.vulnerabilities.critical === arr[0].vulnerabilities.critical &&
    tag.vulnerabilities.high === arr[0].vulnerabilities.high &&
    tag.vulnerabilities.medium === arr[0].vulnerabilities.medium &&
    tag.vulnerabilities.low === arr[0].vulnerabilities.low
  );

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case "improving":
        return <TrendingDown className="h-4 w-4 text-green-500" />;
      case "worsening":
        return <TrendingUp className="h-4 w-4 text-red-500" />;
      case "stable":
        return <Minus className="h-4 w-4 text-gray-500" />;
      default:
        return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (count: number, severity: string) => {
    if (count === 0) return "text-text-03";
    switch (severity) {
      case "critical":
        return "text-red-500 font-bold";
      case "high":
        return "text-orange-500 font-bold";
      case "medium":
        return "text-yellow-600 font-bold";
      case "low":
        return "text-blue-500";
      default:
        return "text-text-02";
    }
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      // Check if date is invalid or is the zero date (0001-01-01 or year < 1900)
      if (isNaN(date.getTime()) || date.getFullYear() < 1900) {
        return "Not scanned";
      }
      return date.toLocaleString();
    } catch {
      return "Not scanned";
    }
  };

  return (
    <DashboardLayout>
      <div className="col-span-full">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm text-text-02">
          <button
            onClick={() => navigate("/dashboard")}
            className="hover:text-text-01 transition-colors flex items-center gap-1"
          >
            <Home className="h-4 w-4" />
            Dashboard
          </button>
          <ChevronRight className="h-4 w-4" />
          <span className="text-text-01 font-mono">{decodedImageName}</span>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Package className="h-8 w-8 text-purple-500" />
            <h1 className="carbon-type-productive-heading-04 text-text-01">
              {decodedImageName}
            </h1>
          </div>
          <p className="carbon-type-body-02 text-text-02">
            Vulnerability analysis across all tags
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-ui-03">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-6 py-3 carbon-type-body-01 border-b-2 transition-colors ${
                activeTab === "overview"
                  ? "border-interactive-01 text-text-01 bg-layer-01"
                  : "border-transparent text-text-02 hover:text-text-01 hover:bg-layer-hover-01"
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Overview
              </div>
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={`px-6 py-3 carbon-type-body-01 border-b-2 transition-colors ${
                activeTab === "timeline"
                  ? "border-interactive-01 text-text-01 bg-layer-01"
                  : "border-transparent text-text-02 hover:text-text-01 hover:bg-layer-hover-01"
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Timeline
              </div>
            </button>
            <button
              onClick={() => setActiveTab("comparison")}
              className={`px-6 py-3 carbon-type-body-01 border-b-2 transition-colors ${
                activeTab === "comparison"
                  ? "border-interactive-01 text-text-01 bg-layer-01"
                  : "border-transparent text-text-02 hover:text-text-01 hover:bg-layer-hover-01"
              }`}
            >
              <div className="flex items-center gap-2">
                <GitCompare className="h-4 w-4" />
                Comparison {selectedTags.length > 0 && `(${selectedTags.length})`}
              </div>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {loading ? (
          <div className="bg-layer-01 border border-ui-03 rounded p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-text-02">Loading data...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="bg-layer-01 border border-ui-03 rounded">
                <div className="p-6 border-b border-ui-03">
                  <h2 className="carbon-type-productive-heading-02 text-text-01">
                    All Tags ({tags.length})
                  </h2>
                  <p className="carbon-type-body-01 text-text-02 mt-1">
                    Click on column headers to sort
                  </p>
                  {hasDuplicateData && (
                    <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="carbon-type-body-01 text-text-01 font-medium mb-1">
                          Data Quality Issue
                        </p>
                        <p className="carbon-type-label-01 text-text-02">
                          All tags are showing identical vulnerability counts. This may indicate that the backend hasn't scanned individual tags yet, or is returning cached/placeholder data.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-layer-02 border-b border-ui-03">
                      <tr>
                        <th className="px-6 py-3 text-left">
                          <CarbonCheckbox
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTags(tags.map((t) => t.tag));
                              } else {
                                setSelectedTags([]);
                              }
                            }}
                            checked={
                              selectedTags.length === tags.length && tags.length > 0
                            }
                          />
                        </th>
                        <th
                          onClick={() => handleSort("tag")}
                          className="px-6 py-3 text-left text-xs font-medium text-text-02 uppercase tracking-wider cursor-pointer hover:text-text-01"
                        >
                          Tag {sortField === "tag" && (sortDirection === "asc" ? "↑" : "↓")}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-02 uppercase tracking-wider">
                          Status
                        </th>
                        <th
                          onClick={() => handleSort("critical")}
                          className="px-6 py-3 text-center text-xs font-medium text-text-02 uppercase tracking-wider cursor-pointer hover:text-text-01"
                        >
                          Critical{" "}
                          {sortField === "critical" && (sortDirection === "asc" ? "↑" : "↓")}
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-text-02 uppercase tracking-wider">
                          High
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-text-02 uppercase tracking-wider">
                          Medium
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-text-02 uppercase tracking-wider">
                          Low
                        </th>
                        <th
                          onClick={() => handleSort("total")}
                          className="px-6 py-3 text-center text-xs font-medium text-text-02 uppercase tracking-wider cursor-pointer hover:text-text-01"
                        >
                          Total {sortField === "total" && (sortDirection === "asc" ? "↑" : "↓")}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-02 uppercase tracking-wider">
                          Trend
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-02 uppercase tracking-wider">
                          Last Scan
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ui-03">
                      {sortedTags.map((tag) => (
                        <tr
                          key={tag.tag}
                          className={`hover:bg-layer-hover-01 transition-colors ${
                            selectedTags.includes(tag.tag) ? "bg-purple-500/5" : ""
                          }`}
                        >
                          <td className="px-6 py-4">
                            <CarbonCheckbox
                              checked={selectedTags.includes(tag.tag)}
                              onChange={() => toggleTagSelection(tag.tag)}
                            />
                          </td>
                          <td className="px-6 py-4 text-sm font-mono text-text-01 font-medium">
                            {tag.tag}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                tag.scan_status === "success"
                                  ? "bg-green-500/10 text-green-500"
                                  : tag.scan_status === "failed"
                                    ? "bg-red-500/10 text-red-500"
                                    : "bg-gray-500/10 text-gray-500"
                              }`}
                            >
                              {tag.scan_status}
                            </span>
                          </td>
                          <td
                            className={`px-6 py-4 text-center text-sm ${getSeverityColor(
                              tag.vulnerabilities.critical,
                              "critical"
                            )}`}
                          >
                            {tag.vulnerabilities.critical}
                          </td>
                          <td
                            className={`px-6 py-4 text-center text-sm ${getSeverityColor(
                              tag.vulnerabilities.high,
                              "high"
                            )}`}
                          >
                            {tag.vulnerabilities.high}
                          </td>
                          <td
                            className={`px-6 py-4 text-center text-sm ${getSeverityColor(
                              tag.vulnerabilities.medium,
                              "medium"
                            )}`}
                          >
                            {tag.vulnerabilities.medium}
                          </td>
                          <td
                            className={`px-6 py-4 text-center text-sm ${getSeverityColor(
                              tag.vulnerabilities.low,
                              "low"
                            )}`}
                          >
                            {tag.vulnerabilities.low}
                          </td>
                          <td className="px-6 py-4 text-center text-sm font-bold text-text-01">
                            {tag.vulnerabilities.total}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1">
                              {getTrendIcon(tag.trend_direction)}
                              <span className="text-xs text-text-02 capitalize">
                                {tag.trend_direction}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs text-text-02">
                            {formatDate(tag.last_scan)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {tags.length === 0 && (
                    <div className="p-12 text-center">
                      <Package className="h-16 w-16 text-text-03 mx-auto mb-4" />
                      <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                        No tags found for this image
                      </h3>
                      <p className="carbon-type-body-01 text-text-02 mb-4">
                        This image hasn't been scanned yet or the scan data is unavailable.
                      </p>
                      <button
                        onClick={() => {
                          fetchTags();
                          fetchTrends();
                        }}
                        className="px-4 py-2 bg-interactive-01 text-white rounded carbon-type-body-01 hover:bg-interactive-03 transition-colors"
                      >
                        Retry Loading
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Timeline Tab */}
            {activeTab === "timeline" && (
              <div className="bg-layer-01 border border-ui-03 rounded p-6">
                <h2 className="carbon-type-productive-heading-02 text-text-01 mb-6">
                  Vulnerability Trends Over Time
                </h2>

                {trends && trends.timeline && trends.timeline.length > 0 ? (
                  <div className="space-y-6">
                    {/* Trend Summary */}
                    {trends.trends && (
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="p-4 bg-layer-02 border border-ui-03 rounded">
                          <div className="text-sm text-text-02 mb-1">Risk Score</div>
                          <div className="text-2xl font-bold text-text-01">
                            {trends.trends.risk_score}
                          </div>
                        </div>
                        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded">
                          <div className="text-sm text-text-02 mb-1">Improving</div>
                          <div className="text-2xl font-bold text-green-500">
                            {trends.trends.improving_tags?.length || 0}
                          </div>
                        </div>
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded">
                          <div className="text-sm text-text-02 mb-1">Worsening</div>
                          <div className="text-2xl font-bold text-red-500">
                            {trends.trends.worsening_tags?.length || 0}
                          </div>
                        </div>
                        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded">
                          <div className="text-sm text-text-02 mb-1">Total Tags</div>
                          <div className="text-2xl font-bold text-blue-500">
                            {trends.timeline.length}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Visual Bar Chart */}
                    <div className="space-y-4">
                      <h3 className="carbon-type-productive-heading-02 text-text-01">
                        Vulnerability Distribution by Tag
                      </h3>
                      {trends.timeline.map((point, idx) => {
                        const vuln = point.vulnerabilities || {
                          critical: point.critical || 0,
                          high: point.high || 0,
                          medium: point.medium || 0,
                          low: point.low || 0,
                          informational: point.informational || 0,
                          total: point.total || 0,
                        };

                        const maxTotal = Math.max(...trends.timeline.map(p =>
                          (p.vulnerabilities?.total || p.total || 0)
                        ));
                        const widthPercent = maxTotal > 0 ? (vuln.total / maxTotal) * 100 : 0;

                        return (
                          <div key={idx} className="space-y-2">
                            {/* Tag header */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-sm text-text-01 font-medium min-w-[120px]">
                                  {point.tag}
                                </span>
                                <span className="text-xs text-text-03">
                                  {formatDate(point.scan_time || point.date || "")}
                                </span>
                              </div>
                              <span className="text-sm font-bold text-text-01">
                                {vuln.total} total
                              </span>
                            </div>

                            {/* Stacked bar chart */}
                            <div className="relative h-8 bg-layer-02 border border-ui-03 rounded overflow-hidden">
                              <div className="absolute inset-0 flex" style={{ width: `${widthPercent}%` }}>
                                {vuln.critical > 0 && (
                                  <div
                                    className="bg-red-500 flex items-center justify-center text-white text-xs font-medium"
                                    style={{ width: `${(vuln.critical / vuln.total) * 100}%` }}
                                    title={`${vuln.critical} Critical`}
                                  >
                                    {vuln.critical > 0 && <span className="px-1">{vuln.critical}</span>}
                                  </div>
                                )}
                                {vuln.high > 0 && (
                                  <div
                                    className="bg-orange-500 flex items-center justify-center text-white text-xs font-medium"
                                    style={{ width: `${(vuln.high / vuln.total) * 100}%` }}
                                    title={`${vuln.high} High`}
                                  >
                                    {vuln.high > 0 && <span className="px-1">{vuln.high}</span>}
                                  </div>
                                )}
                                {vuln.medium > 0 && (
                                  <div
                                    className="bg-yellow-500 flex items-center justify-center text-gray-900 text-xs font-medium"
                                    style={{ width: `${(vuln.medium / vuln.total) * 100}%` }}
                                    title={`${vuln.medium} Medium`}
                                  >
                                    {vuln.medium > 0 && <span className="px-1">{vuln.medium}</span>}
                                  </div>
                                )}
                                {vuln.low > 0 && (
                                  <div
                                    className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium"
                                    style={{ width: `${(vuln.low / vuln.total) * 100}%` }}
                                    title={`${vuln.low} Low`}
                                  >
                                    {vuln.low > 0 && <span className="px-1">{vuln.low}</span>}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Legend */}
                            <div className="flex items-center gap-4 text-xs">
                              {vuln.critical > 0 && (
                                <div className="flex items-center gap-1">
                                  <div className="w-3 h-3 bg-red-500 rounded" />
                                  <span className="text-text-02">{vuln.critical} Critical</span>
                                </div>
                              )}
                              {vuln.high > 0 && (
                                <div className="flex items-center gap-1">
                                  <div className="w-3 h-3 bg-orange-500 rounded" />
                                  <span className="text-text-02">{vuln.high} High</span>
                                </div>
                              )}
                              {vuln.medium > 0 && (
                                <div className="flex items-center gap-1">
                                  <div className="w-3 h-3 bg-yellow-500 rounded" />
                                  <span className="text-text-02">{vuln.medium} Medium</span>
                                </div>
                              )}
                              {vuln.low > 0 && (
                                <div className="flex items-center gap-1">
                                  <div className="w-3 h-3 bg-blue-500 rounded" />
                                  <span className="text-text-02">{vuln.low} Low</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center">
                    <Clock className="h-16 w-16 text-text-03 mx-auto mb-4" />
                    <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                      No timeline data available
                    </h3>
                    <p className="carbon-type-body-01 text-text-02 mb-4">
                      Timeline data will appear here once the image has multiple scans over time.
                    </p>
                    <button
                      onClick={fetchTrends}
                      className="px-4 py-2 bg-interactive-01 text-white rounded carbon-type-body-01 hover:bg-interactive-03 transition-colors"
                    >
                      Retry Loading
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Comparison Tab */}
            {activeTab === "comparison" && (
              <div className="space-y-6">
                {selectedTags.length < 2 ? (
                  <div className="bg-layer-01 border border-ui-03 rounded p-12 text-center">
                    <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                    <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                      Select Tags to Compare
                    </h3>
                    <p className="carbon-type-body-01 text-text-02">
                      Go to the Overview tab and select at least 2 tags to compare
                    </p>
                  </div>
                ) : comparison ? (
                  <>
                    {/* Comparison Summary */}
                    <div className="bg-layer-01 border border-ui-03 rounded p-6">
                      <h2 className="carbon-type-productive-heading-02 text-text-01 mb-4">
                        Comparison Summary
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded">
                          <div className="text-sm text-text-02 mb-1">Most Secure</div>
                          <div className="font-mono font-bold text-green-500">
                            {comparison.summary.most_secure_tag}
                          </div>
                        </div>
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded">
                          <div className="text-sm text-text-02 mb-1">Least Secure</div>
                          <div className="font-mono font-bold text-red-500">
                            {comparison.summary.least_secure_tag}
                          </div>
                        </div>
                        <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded">
                          <div className="text-sm text-text-02 mb-1">Recommended</div>
                          <div className="font-mono font-bold text-purple-500">
                            {comparison.summary.recommended_tag}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 p-4 bg-layer-02 border border-ui-03 rounded">
                        <p className="text-sm text-text-01">
                          {comparison.summary.recommendation}
                        </p>
                      </div>
                    </div>

                    {/* Comparison Table */}
                    <div className="bg-layer-01 border border-ui-03 rounded">
                      <div className="p-6 border-b border-ui-03">
                        <h2 className="carbon-type-productive-heading-02 text-text-01">
                          Side-by-Side Comparison
                        </h2>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-layer-02 border-b border-ui-03">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-text-02 uppercase tracking-wider">
                                Tag
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-text-02 uppercase tracking-wider">
                                Critical
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-text-02 uppercase tracking-wider">
                                High
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-text-02 uppercase tracking-wider">
                                Medium
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-text-02 uppercase tracking-wider">
                                Low
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-text-02 uppercase tracking-wider">
                                Total
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-text-02 uppercase tracking-wider">
                                Trend
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ui-03">
                            {comparison.comparison.map((tag) => (
                              <tr key={tag.tag} className="hover:bg-layer-hover-01">
                                <td className="px-6 py-4 text-sm font-mono text-text-01 font-medium">
                                  {tag.tag}
                                </td>
                                <td
                                  className={`px-6 py-4 text-center text-sm ${getSeverityColor(
                                    tag.vulnerabilities.critical,
                                    "critical"
                                  )}`}
                                >
                                  {tag.vulnerabilities.critical}
                                </td>
                                <td
                                  className={`px-6 py-4 text-center text-sm ${getSeverityColor(
                                    tag.vulnerabilities.high,
                                    "high"
                                  )}`}
                                >
                                  {tag.vulnerabilities.high}
                                </td>
                                <td
                                  className={`px-6 py-4 text-center text-sm ${getSeverityColor(
                                    tag.vulnerabilities.medium,
                                    "medium"
                                  )}`}
                                >
                                  {tag.vulnerabilities.medium}
                                </td>
                                <td
                                  className={`px-6 py-4 text-center text-sm ${getSeverityColor(
                                    tag.vulnerabilities.low,
                                    "low"
                                  )}`}
                                >
                                  {tag.vulnerabilities.low}
                                </td>
                                <td className="px-6 py-4 text-center text-sm font-bold text-text-01">
                                  {tag.vulnerabilities.total}
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-1">
                                    {getTrendIcon(tag.trend_direction)}
                                    <span className="text-xs text-text-02 capitalize">
                                      {tag.trend_direction}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-layer-01 border border-ui-03 rounded p-12 text-center">
                    <div className="h-12 w-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-text-02">Loading comparison data...</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
