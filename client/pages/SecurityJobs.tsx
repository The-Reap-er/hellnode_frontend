import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { gitlabApi, SecurityFixJob } from "@/services/gitlabApi";
import {
  Shield,
  CheckCircle,
  X,
  Loader2,
  ExternalLink,
  Clock,
  AlertCircle,
  RefreshCw,
  Search,
  FileCode,
  GitBranch,
  Calendar,
  TrendingUp,
  AlertTriangle,
  XCircle,
  Sparkles,
  Code,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SecurityJobs() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<SecurityFixJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState<SecurityFixJob | null>(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const perPage = 20;

  const fetchJobs = async () => {
    setIsLoading(true);
    try {
      const response = await gitlabApi.listSecurityFixJobs({
        limit: perPage,
        offset: (currentPage - 1) * perPage,
      });
      setJobs(response.jobs || []);
      setTotalJobs(response.total);
      setTotalPages(response.total_pages);
    } catch (error: any) {
      toast({
        title: "Failed to fetch jobs",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [currentPage]);

  const filteredJobs = jobs.filter((job) => {
    if (!searchQuery && statusFilter === "all") return true;

    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      job.file_path.toLowerCase().includes(query) ||
      job.status.toLowerCase().includes(query) ||
      job.branch_name?.toLowerCase().includes(query);

    const matchesStatus =
      statusFilter === "all" || job.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (status === "failed") return <XCircle className="h-5 w-5 text-red-500" />;
    if (status === "cancelled") return <X className="h-5 w-5 text-gray-500" />;
    if (status === "awaiting_approval") return <Clock className="h-5 w-5 text-yellow-500" />;
    return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      completed: "bg-green-500",
      failed: "bg-red-500",
      cancelled: "bg-gray-500",
      awaiting_approval: "bg-yellow-500",
      pending: "bg-blue-400",
      fetching_file: "bg-blue-500",
      scanning: "bg-purple-500",
      generating_fixes: "bg-indigo-500",
      approved: "bg-teal-500",
      creating_branch: "bg-cyan-500",
      committing_changes: "bg-sky-500",
      creating_mr: "bg-emerald-500",
    };
    return statusMap[status] || "bg-blue-500";
  };

  const handleJobClick = (job: SecurityFixJob) => {
    setSelectedJob(job);
    setShowJobModal(true);
  };

  const handleApprove = async (job: SecurityFixJob) => {
    try {
      await gitlabApi.approveSecurityFixJob(job.id, {
        approved: true,
        url: job.gitlab_url,
      });
      toast({
        title: "Approved",
        description: "Creating merge request...",
      });
      setShowJobModal(false);
      fetchJobs();
    } catch (error: any) {
      toast({
        title: "Failed to approve",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleReject = async (job: SecurityFixJob) => {
    try {
      await gitlabApi.approveSecurityFixJob(job.id, {
        approved: false,
        url: job.gitlab_url,
      });
      toast({
        title: "Rejected",
        description: "Security fix cancelled",
      });
      setShowJobModal(false);
      fetchJobs();
    } catch (error: any) {
      toast({
        title: "Failed to reject",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const decodeContent = (content: string): string => {
    try {
      if (/^[A-Za-z0-9+/=]+$/.test(content?.trim() || "") && content.length % 4 === 0) {
        return atob(content);
      }
      return content;
    } catch {
      return content;
    }
  };

  interface ParsedChange {
    category: string;
    lineNumber: string;
    description: string;
  }

  const parseProposedChanges = (changes: string[]): ParsedChange[] => {
    return changes.map((change) => {
      const match = change.match(/^(\w+)\s+\(Line\s+(\d+)\):\s+(.+)$/);
      if (match) {
        return {
          category: match[1],
          lineNumber: match[2],
          description: match[3],
        };
      }
      return {
        category: "other",
        lineNumber: "N/A",
        description: change,
      };
    });
  };

  const groupChangesByCategory = (parsedChanges: ParsedChange[]) => {
    const groups: Record<string, ParsedChange[]> = {};
    parsedChanges.forEach((change) => {
      if (!groups[change.category]) {
        groups[change.category] = [];
      }
      groups[change.category].push(change);
    });
    return groups;
  };

  const getCategoryColor = (category: string): string => {
    const categoryMap: Record<string, string> = {
      base_image: "bg-purple-500",
      packages: "bg-blue-500",
      secrets: "bg-red-500",
      user: "bg-green-500",
      permissions: "bg-yellow-500",
      other: "bg-gray-500",
    };
    return categoryMap[category.toLowerCase()] || "bg-gray-500";
  };

  const getCategoryLabel = (category: string): string => {
    return category.replace(/_/g, " ").toUpperCase();
  };

  // Statistics
  const stats = {
    total: totalJobs,
    completed: jobs.filter((j) => j.status === "completed").length,
    pending: jobs.filter((j) =>
      ["pending", "fetching_file", "scanning", "generating_fixes"].includes(j.status)
    ).length,
    awaitingApproval: jobs.filter((j) => j.status === "awaiting_approval").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  };

  return (
    <DashboardLayout>
      <div className="col-span-full space-y-6">
        {/* Header */}
        <div>
          <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2">
            Security Fix Jobs
          </h1>
          <p className="carbon-type-body-02 text-text-02">
            AI-powered Dockerfile security scans and automated fixes
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-03">Total Jobs</p>
                  <p className="text-2xl font-bold text-text-01">{stats.total}</p>
                </div>
                <Shield className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-03">Completed</p>
                  <p className="text-2xl font-bold text-green-500">{stats.completed}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-03">In Progress</p>
                  <p className="text-2xl font-bold text-blue-500">{stats.pending}</p>
                </div>
                <Loader2 className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-03">Awaiting Approval</p>
                  <p className="text-2xl font-bold text-yellow-500">{stats.awaitingApproval}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-03">Failed</p>
                  <p className="text-2xl font-bold text-red-500">{stats.failed}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Jobs List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>All Jobs ({filteredJobs.length})</CardTitle>
                <CardDescription>Auto-refreshing every 10 seconds</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchJobs} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-03" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by file path, status, or branch..."
                  className="pl-9"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-ui-04 rounded bg-field-01 text-text-01 text-sm"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="awaiting_approval">Awaiting Approval</option>
                <option value="failed">Failed</option>
                <option value="scanning">Scanning</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            {/* Jobs List */}
            {isLoading && jobs.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="text-center py-12">
                <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-text-03">No jobs found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredJobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => handleJobClick(job)}
                    className="w-full border border-ui-04 rounded p-4 hover:bg-layer-01 transition-all hover:shadow-md text-left"
                  >
                    <div className="flex items-start gap-4">
                      {/* Status Icon */}
                      <div className="flex-shrink-0 mt-1">
                        {getStatusIcon(job.status)}
                      </div>

                      {/* Main Content */}
                      <div className="flex-1 min-w-0 space-y-3">
                        {/* Header Row */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <FileCode className="h-4 w-4 text-blue-500 flex-shrink-0" />
                              <span className="font-mono text-sm font-medium text-text-01 truncate">
                                {job.file_path}
                              </span>
                            </div>
                            <p className="text-sm text-text-03">{job.current_step}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge
                              className={`${getStatusBadge(job.status)} text-white border-0 text-xs`}
                            >
                              {job.status.replace(/_/g, " ").toUpperCase()}
                            </Badge>
                          </div>
                        </div>

                        {/* Vulnerability Counts */}
                        {job.scan_result && (
                          <div className="flex gap-2 flex-wrap">
                            {job.scan_result.critical_count > 0 && (
                              <Badge className="bg-red-600 text-white text-xs">
                                Critical: {job.scan_result.critical_count}
                              </Badge>
                            )}
                            {job.scan_result.high_count > 0 && (
                              <Badge className="bg-orange-500 text-white text-xs">
                                High: {job.scan_result.high_count}
                              </Badge>
                            )}
                            {job.scan_result.medium_count > 0 && (
                              <Badge className="bg-yellow-500 text-white text-xs">
                                Medium: {job.scan_result.medium_count}
                              </Badge>
                            )}
                            {job.scan_result.low_count > 0 && (
                              <Badge className="bg-blue-500 text-white text-xs">
                                Low: {job.scan_result.low_count}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs">
                              Total: {job.scan_result.total_vulnerabilities}
                            </Badge>
                          </div>
                        )}

                        {/* Progress Bar */}
                        {job.status !== "completed" &&
                          job.status !== "failed" &&
                          job.status !== "cancelled" && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs text-text-03">
                                <span>Progress</span>
                                <span>{job.progress}%</span>
                              </div>
                              <Progress value={job.progress} className="h-2" />
                            </div>
                          )}

                        {/* Metadata Row */}
                        <div className="flex items-center gap-4 text-xs text-text-03 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(job.created_at).toLocaleString()}</span>
                          </div>
                          {job.branch_name && (
                            <div className="flex items-center gap-1">
                              <GitBranch className="h-3 w-3" />
                              <span className="font-mono">{job.branch_name}</span>
                            </div>
                          )}
                          {job.merge_request && (
                            <a
                              href={job.merge_request.web_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-blue-500 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              MR #{job.merge_request.iid} ({job.merge_request.state})
                            </a>
                          )}
                          {job.changes && (
                            <div className="flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" />
                              <span>{job.changes.length} improvements</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-ui-03">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || isLoading}
                >
                  Previous
                </Button>
                <span className="text-sm text-text-02">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || isLoading}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <Dialog open={showJobModal} onOpenChange={setShowJobModal}>
          <DialogContent className="max-w-7xl w-[95vw] h-[90vh] p-0 flex flex-col">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-ui-04">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="h-6 w-6 text-blue-500" />
                  <div>
                    <DialogTitle className="text-xl">Security Job Details</DialogTitle>
                    <DialogDescription className="mt-1">
                      <span className="font-mono text-sm">{selectedJob.file_path}</span>
                    </DialogDescription>
                  </div>
                </div>
                {selectedJob.scan_result && (
                  <div className="flex gap-2">
                    <Badge className="bg-red-600 hover:bg-red-700 text-white border-0">
                      Critical: {selectedJob.scan_result.critical_count}
                    </Badge>
                    <Badge className="bg-orange-500 hover:bg-orange-600 text-white border-0">
                      High: {selectedJob.scan_result.high_count}
                    </Badge>
                    <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white border-0">
                      Medium: {selectedJob.scan_result.medium_count}
                    </Badge>
                    <Badge className="bg-blue-500 hover:bg-blue-600 text-white border-0">
                      Low: {selectedJob.scan_result.low_count}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Job Metadata */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-ui-04">
                <div>
                  <p className="text-xs text-text-03 mb-1">Status</p>
                  <Badge className={`${getStatusBadge(selectedJob.status)} text-white border-0`}>
                    {selectedJob.status.replace(/_/g, " ").toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-text-03 mb-1">Created</p>
                  <p className="text-sm text-text-01">
                    {new Date(selectedJob.created_at).toLocaleString()}
                  </p>
                </div>
                {selectedJob.completed_at && selectedJob.completed_at !== "0001-01-01T00:00:00Z" && (
                  <div>
                    <p className="text-xs text-text-03 mb-1">Completed</p>
                    <p className="text-sm text-text-01">
                      {new Date(selectedJob.completed_at).toLocaleString()}
                    </p>
                  </div>
                )}
                {selectedJob.merge_request && (
                  <div>
                    <p className="text-xs text-text-03 mb-1">Merge Request</p>
                    <a
                      href={selectedJob.merge_request.web_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-500 hover:underline inline-flex items-center gap-1"
                    >
                      MR #{selectedJob.merge_request.iid}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-hidden">
              <div className="grid grid-cols-2 gap-0 h-full">
                {/* Left Panel - Proposed Changes */}
                <div className="border-r border-ui-04 flex flex-col overflow-hidden">
                  <div className="bg-layer-01 border-b border-ui-04 px-6 py-3 flex-shrink-0">
                    <h3 className="carbon-type-heading-03 font-semibold text-text-01">
                      Proposed Changes
                    </h3>
                    {selectedJob.changes && (
                      <p className="carbon-type-body-02 text-text-03 mt-1">
                        {selectedJob.changes.length} security improvements identified
                      </p>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-6">
                      {selectedJob.changes && selectedJob.changes.length > 0 ? (
                        (() => {
                          const parsedChanges = parseProposedChanges(selectedJob.changes);
                          const groupedChanges = groupChangesByCategory(parsedChanges);

                          return Object.entries(groupedChanges).map(([category, changes]) => (
                            <div key={category} className="space-y-3">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-2 h-2 rounded-full ${getCategoryColor(category)}`}
                                />
                                <h4 className="carbon-type-heading-04 font-semibold text-text-01">
                                  {getCategoryLabel(category)}
                                </h4>
                                <Badge variant="outline" className="text-xs">
                                  {changes.length}
                                </Badge>
                              </div>

                              <div className="space-y-2 pl-4 border-l-2 border-ui-03">
                                {changes.map((change, idx) => (
                                  <div
                                    key={idx}
                                    className="bg-layer-01 border border-ui-04 rounded p-3"
                                  >
                                    <div className="flex items-start gap-2 mb-2">
                                      <Badge variant="outline" className="text-xs font-mono">
                                        Line {change.lineNumber}
                                      </Badge>
                                    </div>
                                    <p className="carbon-type-body-02 text-text-02 leading-relaxed">
                                      {change.description}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ));
                        })()
                      ) : (
                        <div className="text-center py-12 text-text-03">
                          <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No changes available</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Panel - File Comparison */}
                <div className="flex flex-col overflow-hidden">
                  <div className="bg-layer-01 border-b border-ui-04 px-6 py-3 flex-shrink-0">
                    <h3 className="carbon-type-heading-03 font-semibold text-text-01">
                      File Comparison
                    </h3>
                    <p className="carbon-type-body-02 text-text-03 mt-1">
                      Compare original and fixed Dockerfile
                    </p>
                  </div>

                  {selectedJob.original_content && selectedJob.fixed_content ? (
                    <Tabs defaultValue="split" className="flex-1 flex flex-col overflow-hidden">
                      <div className="border-b border-ui-04 px-6 flex-shrink-0">
                        <TabsList className="bg-transparent border-0">
                          <TabsTrigger
                            value="split"
                            className="data-[state=active]:bg-layer-01"
                          >
                            Split View
                          </TabsTrigger>
                          <TabsTrigger
                            value="original"
                            className="data-[state=active]:bg-layer-01"
                          >
                            Original
                          </TabsTrigger>
                          <TabsTrigger
                            value="fixed"
                            className="data-[state=active]:bg-layer-01"
                          >
                            Fixed
                          </TabsTrigger>
                        </TabsList>
                      </div>

                      <TabsContent
                        value="split"
                        className="flex-1 overflow-y-auto m-0 data-[state=active]:flex data-[state=active]:flex-col"
                      >
                        <div className="grid grid-cols-2 divide-x divide-ui-04 h-full">
                          {/* Original */}
                          <div className="flex flex-col overflow-hidden">
                            <div className="bg-red-500/10 px-4 py-2 border-b border-ui-04 flex-shrink-0">
                              <span className="carbon-type-label-01 text-red-500 font-medium">
                                Original
                              </span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 bg-field-01">
                              <pre className="font-mono text-xs text-text-01 leading-relaxed whitespace-pre-wrap break-words">
                                {decodeContent(selectedJob.original_content)}
                              </pre>
                            </div>
                          </div>

                          {/* Fixed */}
                          <div className="flex flex-col overflow-hidden">
                            <div className="bg-green-500/10 px-4 py-2 border-b border-ui-04 flex-shrink-0">
                              <span className="carbon-type-label-01 text-green-500 font-medium">
                                Fixed
                              </span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 bg-field-01">
                              <pre className="font-mono text-xs text-text-01 leading-relaxed whitespace-pre-wrap break-words">
                                {selectedJob.fixed_content}
                              </pre>
                            </div>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent
                        value="original"
                        className="flex-1 overflow-y-auto m-0 data-[state=active]:block"
                      >
                        <div className="p-6 bg-field-01 min-h-full">
                          <pre className="font-mono text-xs text-text-01 leading-relaxed whitespace-pre-wrap break-words">
                            {decodeContent(selectedJob.original_content)}
                          </pre>
                        </div>
                      </TabsContent>

                      <TabsContent
                        value="fixed"
                        className="flex-1 overflow-y-auto m-0 data-[state=active]:block"
                      >
                        <div className="p-6 bg-field-01 min-h-full">
                          <pre className="font-mono text-xs text-text-01 leading-relaxed whitespace-pre-wrap break-words">
                            {selectedJob.fixed_content}
                          </pre>
                        </div>
                      </TabsContent>
                    </Tabs>
                  ) : (
                    <div className="flex items-center justify-center h-full text-text-03">
                      <div className="text-center">
                        <FileCode className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No file content available</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="px-6 py-4 border-t border-ui-04 bg-layer-01">
              <div className="flex justify-between w-full items-center">
                <div className="flex items-center gap-2 text-text-03">
                  <Sparkles className="h-4 w-4" />
                  <span className="carbon-type-label-01">AI-powered security improvements</span>
                </div>
                <div className="flex gap-3">
                  {selectedJob.status === "awaiting_approval" ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => handleReject(selectedJob)}
                        className="border-red-500 text-red-500 hover:bg-red-500/10"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Reject Changes
                      </Button>
                      <Button
                        onClick={() => handleApprove(selectedJob)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve & Create MR
                      </Button>
                    </>
                  ) : selectedJob.status === "completed" && selectedJob.merge_request ? (
                    <Button
                      onClick={() => window.open(selectedJob.merge_request!.web_url, "_blank")}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Merge Request
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => setShowJobModal(false)}>
                      Close
                    </Button>
                  )}
                </div>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
