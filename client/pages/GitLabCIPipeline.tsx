import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  gitlabCIService,
  Pipeline,
  Job,
  PipelineWithJobs,
  getStatusBadgeVariant,
  formatTimestamp,
  formatTimestampDetailed,
  getRelativeTime,
  groupJobsByStage,
  calculatePipelineStats,
  getShortSHA,
} from "@/services/gitlabCIApi";
import {
  Search,
  GitBranch,
  Loader2,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  ChevronRight,
  Copy,
  CheckCircle,
  XCircle,
  PlayCircle,
  Clock,
  TrendingUp,
  Activity,
  Filter,
  Calendar,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function GitLabCIPipeline() {
  const { toast } = useToast();

  // State
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [isLoadingPipelines, setIsLoadingPipelines] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage] = useState(50);
  const [totalPipelines, setTotalPipelines] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("__all__");
  const [selectedBranch, setSelectedBranch] = useState<string>("__all__");
  const [selectedPipeline, setSelectedPipeline] = useState<PipelineWithJobs | null>(null);
  const [isLoadingPipelineDetails, setIsLoadingPipelineDetails] = useState(false);
  const [isPipelineDialogOpen, setIsPipelineDialogOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [copiedSHA, setCopiedSHA] = useState<string | null>(null);
  const [pipelineJobs, setPipelineJobs] = useState<Map<string, Job[]>>(new Map());

  // Derived state - get unique projects and branches
  const uniqueProjects = Array.from(new Set(pipelines.map((p) => p.project_name))).sort();
  const uniqueBranches = Array.from(
    new Set(pipelines.map((p) => p.branch || p.ref))
  ).sort();

  // Load pipelines on mount and when page changes
  useEffect(() => {
    loadPipelines();
  }, [currentPage]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadPipelines(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, currentPage, selectedProject]);

  const loadPipelines = async (silent = false) => {
    if (!silent) setIsLoadingPipelines(true);
    try {
      const result = await gitlabCIService.getPipelines(
        itemsPerPage,
        currentPage * itemsPerPage,
        selectedProject === "__all__" ? undefined : selectedProject
      );
      setPipelines(result.pipelines);
      setTotalPipelines(result.total);

      // Load jobs for each pipeline
      loadJobsForPipelines(result.pipelines);
    } catch (error: any) {
      if (!silent) {
        toast({
          title: "Failed to load pipelines",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      if (!silent) setIsLoadingPipelines(false);
    }
  };

  const loadJobsForPipelines = async (pipelineList: Pipeline[]) => {
    const jobsMap = new Map<string, Job[]>();

    // Load jobs for each pipeline in parallel
    await Promise.all(
      pipelineList.map(async (pipeline) => {
        try {
          const jobs = await gitlabCIService.getJobsForPipeline(pipeline.pipeline_id);
          jobsMap.set(pipeline.pipeline_id, jobs);
        } catch (error) {
          // Silently fail for individual pipeline job fetches
          jobsMap.set(pipeline.pipeline_id, []);
        }
      })
    );

    setPipelineJobs(jobsMap);
  };

  const handlePipelineClick = async (pipelineId: string) => {
    setIsLoadingPipelineDetails(true);
    setIsPipelineDialogOpen(true);
    try {
      const pipeline = await gitlabCIService.getPipelineWithJobs(pipelineId);
      setSelectedPipeline(pipeline);
    } catch (error: any) {
      toast({
        title: "Failed to load pipeline details",
        description: error.message,
        variant: "destructive",
      });
      setIsPipelineDialogOpen(false);
    } finally {
      setIsLoadingPipelineDetails(false);
    }
  };

  const copySHA = (sha: string) => {
    navigator.clipboard.writeText(sha);
    setCopiedSHA(sha);
    setTimeout(() => setCopiedSHA(null), 2000);
    toast({
      title: "Copied!",
      description: "SHA copied to clipboard",
    });
  };

  const filteredPipelines = pipelines.filter((pipeline) => {
    const matchesSearch =
      searchQuery === "" ||
      pipeline.project_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pipeline.sha.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (pipeline.branch || pipeline.ref).toLowerCase().includes(searchQuery.toLowerCase());

    const matchesProject = selectedProject === "__all__" || pipeline.project_name === selectedProject;
    const matchesBranch =
      selectedBranch === "__all__" || (pipeline.branch || pipeline.ref) === selectedBranch;

    return matchesSearch && matchesProject && matchesBranch;
  });

  const totalPages = Math.ceil(totalPipelines / itemsPerPage);

  // Calculate dashboard statistics (from current page of pipelines)
  const dashboardStats = {
    totalToday: pipelines.filter((p) => {
      const pipelineDate = new Date(p.created_at);
      const today = new Date();
      return (
        pipelineDate.getDate() === today.getDate() &&
        pipelineDate.getMonth() === today.getMonth() &&
        pipelineDate.getFullYear() === today.getFullYear()
      );
    }).length,
    totalPipelines: totalPipelines,
  };

  const renderJobStatusIcon = (status: string) => {
    switch (status) {
      case "started":
        return <PlayCircle className="h-4 w-4 text-orange-500" />;
      case "finished":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const handleJobClick = (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Get GitLab URL from localStorage
    const gitlabUrl = localStorage.getItem("gitlab_url") || "gitlab.com";

    // Get the project path from the selected pipeline
    if (selectedPipeline) {
      const projectPath = selectedPipeline.project_path;
      // Construct GitLab job URL: https://git.digikala.com/Alireza.Dehnavi/test-sast/-/jobs/849750
      const jobUrl = `https://${gitlabUrl}/${projectPath}/-/jobs/${jobId}`;
      window.open(jobUrl, "_blank");
    }
  };

  const renderJobTimeline = (jobs: Job[]) => {
    const stages = groupJobsByStage(jobs);
    const stageNames = Object.keys(stages);

    return (
      <div className="space-y-6">
        {stageNames.map((stageName) => (
          <div key={stageName} className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-semibold">
                {stageName.toUpperCase()}
              </Badge>
              <div className="h-px flex-1 bg-ui-04" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {stages[stageName].map((job) => (
                <Card
                  key={job.job_id}
                  className="bg-layer-01 border-ui-04 hover:bg-ui-01 transition-colors cursor-pointer"
                  onClick={(e) => handleJobClick(job.job_id, e)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {renderJobStatusIcon(job.status)}
                        <span className="text-sm font-medium text-text-01 truncate">
                          {job.job_name.split(":")[1] || job.job_name}
                        </span>
                      </div>
                      <Badge
                        variant={getStatusBadgeVariant(job.status)}
                        className={`text-xs ${
                          job.status === "finished"
                            ? "bg-green-500 text-white hover:bg-green-600"
                            : job.status === "started"
                            ? "bg-orange-500 text-white hover:bg-orange-600"
                            : ""
                        }`}
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs text-text-03">
                      {job.started_at && (
                        <div>Started: {formatTimestamp(job.started_at)}</div>
                      )}
                      {job.finished_at && job.status === "finished" && (
                        <div>Finished: {formatTimestamp(job.finished_at)}</div>
                      )}
                      {job.status === "failed" && job.failed_at && job.failed_at !== "0001-01-01T00:00:00Z" && (
                        <div className="text-red-500">Failed: {formatTimestamp(job.failed_at)}</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="col-span-full space-y-6">
        {/* Header */}
        <div>
          <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2">
            GitLab CI/CD Pipeline Tracking
          </h1>
          <p className="carbon-type-body-02 text-text-02">
            Monitor and track GitLab CI/CD pipelines and job executions in real-time
          </p>
        </div>

        {/* Dashboard Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-text-02">
                Pipelines Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-text-01">
                {dashboardStats.totalToday}
              </div>
              <p className="text-xs text-text-03 mt-1">
                <TrendingUp className="h-3 w-3 inline mr-1" />
                Active today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-text-02">
                Total Pipelines
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-text-01">
                {dashboardStats.totalPipelines}
              </div>
              <p className="text-xs text-text-03 mt-1">
                <Activity className="h-3 w-3 inline mr-1" />
                All tracked
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-text-02">Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-text-01">{uniqueProjects.length}</div>
              <p className="text-xs text-text-03 mt-1">
                <GitBranch className="h-3 w-3 inline mr-1" />
                Unique projects
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-text-02">
                Auto Refresh
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant={autoRefresh ? "default" : "outline"}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className="w-full"
              >
                {autoRefresh ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                    Enabled
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-2" />
                    Disabled
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-03" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search pipelines..."
                  className="pl-9"
                />
              </div>

              {/* Project Filter */}
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger>
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Projects</SelectItem>
                  {uniqueProjects.map((project) => (
                    <SelectItem key={project} value={project}>
                      {project}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Branch Filter */}
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger>
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Branches</SelectItem>
                  {uniqueBranches.map((branch) => (
                    <SelectItem key={branch} value={branch}>
                      {branch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Refresh Button */}
              <Button onClick={() => loadPipelines()} disabled={isLoadingPipelines}>
                {isLoadingPipelines ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Pipelines List */}
        <Card>
          <CardHeader>
            <CardTitle>Pipelines</CardTitle>
            <CardDescription>
              {filteredPipelines.length} of {totalPipelines} pipelines
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingPipelines ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-text-03" />
              </div>
            ) : filteredPipelines.length === 0 ? (
              <div className="text-center py-12 text-text-03">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="carbon-type-body-02">No pipelines found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPipelines.map((pipeline) => {
                  const jobs = pipelineJobs.get(pipeline.pipeline_id) || [];
                  const stats = calculatePipelineStats(jobs);

                  return (
                    <button
                      key={pipeline.pipeline_id}
                      onClick={() => handlePipelineClick(pipeline.pipeline_id)}
                      className="w-full text-left p-4 rounded border border-ui-04 bg-layer-01 hover:bg-ui-01 transition-colors"
                    >
                      <div className="space-y-3">
                        {/* Header Row */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-3">
                              <Badge variant="secondary" className="font-mono text-xs">
                                #{pipeline.pipeline_id}
                              </Badge>
                              <span className="font-medium text-text-01">
                                {pipeline.project_name}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                <GitBranch className="h-3 w-3 mr-1" />
                                {pipeline.branch || pipeline.ref}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-text-03">
                              <div className="flex items-center gap-2">
                                <span className="font-mono">
                                  {getShortSHA(pipeline.sha)}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copySHA(pipeline.sha);
                                  }}
                                  className="p-1 hover:bg-ui-03 rounded"
                                >
                                  {copiedSHA === pipeline.sha ? (
                                    <CheckCircle className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {getRelativeTime(pipeline.created_at)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {pipeline.project_url && (
                              <a
                                href={pipeline.project_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 hover:bg-ui-03 rounded"
                              >
                                <ExternalLink className="h-4 w-4 text-text-02" />
                              </a>
                            )}
                            <ChevronRight className="h-5 w-5 text-text-03" />
                          </div>
                        </div>

                        {/* Job Statistics & Timeline */}
                        {jobs.length > 0 && (
                          <div className="flex items-center justify-between gap-4 pt-2 border-t border-ui-04">
                            {/* Statistics */}
                            <div className="flex items-center gap-4 text-xs">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-green-500" />
                                <span className="text-text-02">{stats.finished}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-red-500" />
                                <span className="text-text-02">{stats.failed}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-orange-500" />
                                <span className="text-text-02">{stats.running}</span>
                              </div>
                              <span className="text-text-03">|</span>
                              <span className="text-text-02">{stats.successRate}% success</span>
                            </div>

                            {/* Minimal Job Timeline */}
                            <div className="flex items-center gap-1">
                              {jobs.slice(0, 8).map((job) => (
                                <div
                                  key={job.job_id}
                                  className={`w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-medium ${
                                    job.status === "finished"
                                      ? "bg-green-500"
                                      : job.status === "started"
                                      ? "bg-orange-500"
                                      : "bg-red-500"
                                  }`}
                                  title={`${job.job_name}: ${job.status}`}
                                >
                                  {job.status === "finished" ? "✓" : job.status === "started" ? "•" : "✗"}
                                </div>
                              ))}
                              {jobs.length > 8 && (
                                <span className="text-xs text-text-03 ml-1">+{jobs.length - 8}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-6 border-t border-ui-03 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0 || isLoadingPipelines}
                >
                  Previous
                </Button>
                <span className="carbon-type-label-01 text-text-02">
                  Page {currentPage + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage === totalPages - 1 || isLoadingPipelines}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Details Dialog */}
      <Dialog open={isPipelineDialogOpen} onOpenChange={setIsPipelineDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedPipeline ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span>Pipeline #{selectedPipeline.pipeline_id}</span>
                    <Badge variant="secondary">{selectedPipeline.project_name}</Badge>
                  </div>
                  <div className="text-sm font-normal text-text-03">
                    {selectedPipeline.project_path}
                  </div>
                </div>
              ) : (
                "Loading Pipeline Details..."
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedPipeline && (
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4" />
                    <span>{selectedPipeline.branch || selectedPipeline.ref}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{getShortSHA(selectedPipeline.sha)}</span>
                    <button
                      onClick={() => copySHA(selectedPipeline.sha)}
                      className="p-1 hover:bg-ui-03 rounded"
                    >
                      {copiedSHA === selectedPipeline.sha ? (
                        <CheckCircle className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                  <div>Created: {formatTimestampDetailed(selectedPipeline.created_at)}</div>
                  {selectedPipeline.project_url && (
                    <a
                      href={selectedPipeline.project_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-interactive-01 hover:underline"
                    >
                      View on GitLab
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          {isLoadingPipelineDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-text-03" />
            </div>
          ) : selectedPipeline && selectedPipeline.jobs ? (
            <div className="space-y-6 mt-6">
              {/* Job Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Job Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const stats = calculatePipelineStats(selectedPipeline.jobs);
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-text-01">{stats.total}</div>
                          <div className="text-xs text-text-03">Total Jobs</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-500">
                            {stats.finished}
                          </div>
                          <div className="text-xs text-text-03">Finished</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-red-500">{stats.failed}</div>
                          <div className="text-xs text-text-03">Failed</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-orange-500">
                            {stats.running}
                          </div>
                          <div className="text-xs text-text-03">Running</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-text-01">
                            {stats.successRate}%
                          </div>
                          <div className="text-xs text-text-03">Success Rate</div>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Jobs Timeline */}
              <div>
                <h3 className="carbon-type-productive-heading-03 text-text-01 mb-4">
                  Jobs Timeline
                </h3>
                {renderJobTimeline(selectedPipeline.jobs)}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-text-03">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="carbon-type-body-02">No jobs found for this pipeline</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
