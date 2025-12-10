// GitLab CI/CD Pipeline Tracking API Service
const API_BASE_URL = "http://localhost:8080/api/v2/integrations/gitlab/ci";

export interface Pipeline {
  pipeline_id: string;
  project_id: string;
  project_name: string;
  project_path: string;
  project_url: string;
  ref: string;
  branch?: string;
  sha: string;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

export interface Job {
  job_id: string;
  job_name: string;
  pipeline_id: string;
  status: "started" | "finished" | "failed";
  started_at?: string; // ISO 8601
  finished_at?: string; // ISO 8601
  failed_at?: string; // ISO 8601
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

export interface PipelineResponse {
  success: boolean;
  message?: string;
  pipeline?: Pipeline;
}

export interface PipelineListResponse {
  pipelines: Pipeline[];
  total: number;
  project_id?: string;
}

export interface JobResponse {
  success: boolean;
  message?: string;
  job?: Job;
}

export interface JobListResponse {
  jobs: Job[];
  total: number;
  pipeline_id?: string;
}

export interface PipelineWithJobs extends Pipeline {
  jobs?: Job[];
}

class GitLabCIService {
  // Fetch all pipelines with pagination
  async getPipelines(
    limit: number = 50,
    offset: number = 0,
    projectId?: string
  ): Promise<PipelineListResponse> {
    const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
    if (projectId) params.append("project_id", projectId);

    const response = await fetch(`${API_BASE_URL}/pipelines?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch pipelines: ${response.statusText}`);
    }
    return response.json();
  }

  // Fetch specific pipeline
  async getPipeline(pipelineId: string): Promise<Pipeline> {
    const response = await fetch(`${API_BASE_URL}/pipelines/${pipelineId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch pipeline: ${response.statusText}`);
    }
    const data: PipelineResponse = await response.json();
    if (!data.success || !data.pipeline) {
      throw new Error(data.message || "Pipeline not found");
    }
    return data.pipeline;
  }

  // Fetch jobs for a pipeline
  async getJobsForPipeline(pipelineId: string): Promise<Job[]> {
    const response = await fetch(`${API_BASE_URL}/jobs?pipeline_id=${pipelineId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch jobs: ${response.statusText}`);
    }
    const data: JobListResponse = await response.json();
    return data.jobs;
  }

  // Fetch all jobs with pagination
  async getJobs(limit: number = 50, offset: number = 0): Promise<JobListResponse> {
    const response = await fetch(`${API_BASE_URL}/jobs?limit=${limit}&offset=${offset}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch jobs: ${response.statusText}`);
    }
    return response.json();
  }

  // Fetch specific job
  async getJob(jobId: string): Promise<Job> {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch job: ${response.statusText}`);
    }
    const data: JobResponse = await response.json();
    if (!data.success || !data.job) {
      throw new Error(data.message || "Job not found");
    }
    return data.job;
  }

  // Fetch pipeline with all its jobs
  async getPipelineWithJobs(pipelineId: string): Promise<PipelineWithJobs> {
    const [pipeline, jobs] = await Promise.all([
      this.getPipeline(pipelineId),
      this.getJobsForPipeline(pipelineId),
    ]);
    return { ...pipeline, jobs };
  }
}

export const gitlabCIService = new GitLabCIService();

// Helper Functions

// Calculate job duration
export function calculateDuration(job: Job): string {
  if (!job.started_at) return "N/A";

  const start = new Date(job.started_at);
  const end = job.finished_at
    ? new Date(job.finished_at)
    : job.failed_at
    ? new Date(job.failed_at)
    : new Date();

  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffSecs = Math.floor((diffMs % 60000) / 1000);

  if (diffMins === 0) {
    return `${diffSecs}s`;
  }
  return `${diffMins}m ${diffSecs}s`;
}

// Get status color
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    started: "#FFA500", // Orange
    finished: "#28a745", // Green
    failed: "#dc3545", // Red
  };
  return colors[status] || "#6c757d"; // Gray default
}

// Get status badge variant
export function getStatusBadgeVariant(status: string): "default" | "destructive" | "secondary" | "outline" {
  switch (status) {
    case "finished":
      return "outline"; // Use outline for success (will style with green)
    case "failed":
      return "destructive"; // Red for failures
    case "started":
      return "secondary"; // Gray/Orange for running
    default:
      return "secondary";
  }
}

// Format timestamp
export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Format timestamp - detailed
export function formatTimestampDetailed(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Get relative time
export function getRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatTimestamp(isoString);
}

// Extract stage from job name
export function extractStage(jobName: string): string {
  const parts = jobName.split(":");
  return parts.length > 1 ? parts[0] : "default";
}

// Group jobs by stage
export function groupJobsByStage(jobs: Job[]): Record<string, Job[]> {
  return jobs.reduce((acc, job) => {
    const stage = extractStage(job.job_name);
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(job);
    return acc;
  }, {} as Record<string, Job[]>);
}

// Calculate pipeline statistics
export function calculatePipelineStats(jobs: Job[]) {
  const total = jobs.length;
  const finished = jobs.filter((j) => j.status === "finished").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  const running = jobs.filter((j) => j.status === "started").length;

  return {
    total,
    finished,
    failed,
    running,
    successRate: total > 0 ? ((finished / total) * 100).toFixed(1) : "0",
  };
}

// Get short SHA
export function getShortSHA(sha: string): string {
  return sha.substring(0, 8);
}
