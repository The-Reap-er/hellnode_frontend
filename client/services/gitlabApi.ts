const BASE_URL = 'http://localhost:8080/api/v2/integrations/gitlab';

export interface GitLabLoginRequest {
  username?: string;
  token: string;
  url?: string;
}

export interface GitLabLoginResponse {
  success: boolean;
  message: string;
  url: string;
}

export interface GitLabConnectivityRequest {
  url?: string;
}

export interface GitLabConnectivityResponse {
  connected: boolean;
  message: string;
  url: string;
}

export interface GitLabProject {
  id: number;
  name: string;
  name_with_namespace: string;
  path: string;
  path_with_namespace: string;
  description: string;
  web_url: string;
  http_url_to_repo: string;
  ssh_url_to_repo: string;
  default_branch: string;
  visibility: string;
  created_at: string;
  last_activity_at: string;
  star_count: number;
  forks_count: number;
}

export interface GitLabProjectsResponse {
  projects: GitLabProject[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  total_count: number;
}

export interface GitLabTreeNode {
  id: string;
  name: string;
  type: 'blob' | 'tree';
  path: string;
  mode: string;
}

export interface GitLabTreeResponse {
  project_id: number;
  tree: GitLabTreeNode[];
  total: number;
  branch: string;
  recursive: boolean;
}

export interface GitLabFileResponse {
  file_name: string;
  file_path: string;
  size: number;
  encoding: string;
  content: string;
  content_sha256: string;
  ref: string;
  blob_id: string;
  commit_id: string;
  last_commit_id: string;
}

export const gitlabApi = {
  // Login to GitLab
  async login(request: GitLabLoginRequest): Promise<GitLabLoginResponse> {
    const response = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to login' }));
      throw new Error(error.error || error.message || 'Failed to login to GitLab');
    }
    return response.json();
  },

  // Check connectivity (POST)
  async checkConnectivityPost(request: GitLabConnectivityRequest): Promise<GitLabConnectivityResponse> {
    const response = await fetch(`${BASE_URL}/connectivity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to check connectivity' }));
      throw new Error(error.error || error.message || 'Failed to check connectivity');
    }
    return response.json();
  },

  // Check connectivity (GET)
  async checkConnectivityGet(url?: string): Promise<GitLabConnectivityResponse> {
    const queryParam = url ? `?url=${encodeURIComponent(url)}` : '';
    const response = await fetch(`${BASE_URL}/connectivity${queryParam}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to check connectivity' }));
      throw new Error(error.error || error.message || 'Failed to check connectivity');
    }
    return response.json();
  },

  // Logout from GitLab
  async logout(url?: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${BASE_URL}/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to logout' }));
      throw new Error(error.error || error.message || 'Failed to logout from GitLab');
    }
    return response.json();
  },

  // List projects
  async listProjects(params?: {
    url?: string;
    page?: number;
    per_page?: number;
    token?: string;
  }): Promise<GitLabProjectsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.url) queryParams.append('url', params.url);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.per_page) queryParams.append('per_page', params.per_page.toString());

    const headers: Record<string, string> = {};
    if (params?.token) {
      headers['Authorization'] = `Bearer ${params.token}`;
    }

    const response = await fetch(
      `${BASE_URL}/projects${queryParams.toString() ? `?${queryParams.toString()}` : ''}`,
      { headers }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to fetch projects' }));
      throw new Error(error.error || error.message || 'Failed to fetch projects');
    }
    return response.json();
  },

  // Get project details
  async getProject(projectId: number, params?: {
    url?: string;
    token?: string;
  }): Promise<GitLabProject> {
    const queryParams = new URLSearchParams();
    if (params?.url) queryParams.append('url', params.url);

    const headers: Record<string, string> = {};
    if (params?.token) {
      headers['Authorization'] = `Bearer ${params.token}`;
    }

    const response = await fetch(
      `${BASE_URL}/projects/${projectId}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`,
      { headers }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to fetch project' }));
      throw new Error(error.error || error.message || 'Failed to fetch project');
    }
    return response.json();
  },

  // Get repository tree
  async getTree(projectId: number, params?: {
    url?: string;
    path?: string;
    ref?: string;
    recursive?: boolean;
    per_page?: number;
    page?: number;
    token?: string;
  }): Promise<GitLabTreeResponse> {
    const queryParams = new URLSearchParams();
    if (params?.url) queryParams.append('url', params.url);
    if (params?.path) queryParams.append('path', params.path);
    if (params?.ref) queryParams.append('ref', params.ref);
    if (params?.recursive !== undefined) queryParams.append('recursive', params.recursive.toString());
    if (params?.per_page) queryParams.append('per_page', params.per_page.toString());
    if (params?.page) queryParams.append('page', params.page.toString());

    const headers: Record<string, string> = {};
    if (params?.token) {
      headers['Authorization'] = `Bearer ${params.token}`;
    }

    const response = await fetch(
      `${BASE_URL}/projects/${projectId}/tree${queryParams.toString() ? `?${queryParams.toString()}` : ''}`,
      { headers }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to fetch repository tree' }));
      throw new Error(error.error || error.message || 'Failed to fetch repository tree');
    }
    return response.json();
  },

  // Get file content
  async getFile(projectId: number, filePath: string, params?: {
    url?: string;
    ref?: string;
    token?: string;
  }): Promise<GitLabFileResponse> {
    const queryParams = new URLSearchParams();
    if (params?.url) queryParams.append('url', params.url);
    if (params?.ref) queryParams.append('ref', params.ref);

    const headers: Record<string, string> = {};
    if (params?.token) {
      headers['Authorization'] = `Bearer ${params.token}`;
    }

    const response = await fetch(
      `${BASE_URL}/projects/${projectId}/files/${filePath}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`,
      { headers }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to fetch file' }));
      throw new Error(error.error || error.message || 'Failed to fetch file');
    }
    return response.json();
  },

  // Helper: Decode base64 content
  decodeFileContent(content: string): string {
    try {
      return atob(content);
    } catch (error) {
      console.error('Failed to decode file content:', error);
      return content;
    }
  },

  // Helper: Find all Dockerfiles in a project
  async findDockerfiles(projectId: number, params?: {
    url?: string;
    ref?: string;
    token?: string;
  }): Promise<GitLabTreeNode[]> {
    const tree = await this.getTree(projectId, {
      ...params,
      recursive: true,
    });

    return tree.tree.filter(
      (node) =>
        node.type === 'blob' &&
        (node.name.toLowerCase() === 'dockerfile' ||
          node.name.toLowerCase().startsWith('dockerfile.'))
    );
  },

  // Security Fix Job endpoints
  async createSecurityFixJob(projectId: number, params: {
    file_path: string;
    source_branch?: string;
    target_branch?: string;
    file_type?: 'dockerfile' | 'manifest';
    options?: {
      preserve_comments?: boolean;
      explain_changes?: boolean;
    };
    assignee_ids?: number[];
    labels?: string[];
    url?: string;
  }): Promise<SecurityFixJobResponse> {
    const queryParams = params.url ? `?url=${encodeURIComponent(params.url)}` : '';
    const response = await fetch(
      `${BASE_URL}/projects/${projectId}/security-fix-job${queryParams}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: params.file_path,
          source_branch: params.source_branch,
          target_branch: params.target_branch,
          file_type: params.file_type,
          options: params.options,
          assignee_ids: params.assignee_ids,
          labels: params.labels,
        }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create security fix job' }));
      throw new Error(error.error || error.message || 'Failed to create security fix job');
    }
    return response.json();
  },

  async getSecurityFixJob(jobId: string): Promise<SecurityFixJobStatusResponse> {
    const response = await fetch(`${BASE_URL}/security-fix-jobs/${jobId}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get job status' }));
      throw new Error(error.error || error.message || 'Failed to get job status');
    }
    return response.json();
  },

  async approveSecurityFixJob(jobId: string, params: {
    approved: boolean;
    mr_title?: string;
    mr_description?: string;
    url?: string;
  }): Promise<SecurityFixJobApprovalResponse> {
    const queryParams = params.url ? `?url=${encodeURIComponent(params.url)}` : '';
    const response = await fetch(
      `${BASE_URL}/security-fix-jobs/${jobId}/approve${queryParams}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved: params.approved,
          mr_title: params.mr_title,
          mr_description: params.mr_description,
        }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to approve job' }));
      throw new Error(error.error || error.message || 'Failed to approve job');
    }
    return response.json();
  },

  async cancelSecurityFixJob(jobId: string): Promise<{ job_id: string; message: string }> {
    const response = await fetch(`${BASE_URL}/security-fix-jobs/${jobId}/cancel`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to cancel job' }));
      throw new Error(error.error || error.message || 'Failed to cancel job');
    }
    return response.json();
  },

  async listSecurityFixJobs(params?: {
    limit?: number;
    offset?: number;
    status?: JobStatus;
    project_id?: number;
  }): Promise<SecurityFixJobsListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.project_id) queryParams.append('project_id', params.project_id.toString());

    const response = await fetch(
      `${BASE_URL}/security-fix-jobs${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to list jobs' }));
      throw new Error(error.error || error.message || 'Failed to list jobs');
    }
    return response.json();
  },
};

// TypeScript interfaces for security fix jobs
export interface SecurityFixJobResponse {
  job_id: string;
  status: string;
  message: string;
  created_at: string;
}

export interface SecurityFixJob {
  id: string;
  project_id: number;
  file_path: string;
  file_type: string;
  gitlab_url: string;
  status: JobStatus;
  current_step: string;
  progress: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  request: any;
  original_content?: string;
  scan_result?: {
    total_vulnerabilities: number;
    critical_count: number;
    high_count: number;
    medium_count: number;
    low_count: number;
  };
  fixed_content?: string;
  changes?: string[];
  error?: string;
  branch_name?: string;
  commit_sha?: string;
  commit_web_url?: string;
  merge_request?: {
    id: number;
    iid: number;
    project_id: number;
    title: string;
    description: string;
    state: string;
    merged_at: string;
    created_at: string;
    updated_at: string;
    target_branch: string;
    source_branch: string;
    web_url: string;
    sha: string;
  };
}

export interface SecurityFixJobStatusResponse {
  job: SecurityFixJob;
  can_approve: boolean;
  can_cancel: boolean;
  is_complete: boolean;
}

export interface SecurityFixJobsListResponse {
  jobs: SecurityFixJob[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface SecurityFixJobApprovalResponse {
  job_id: string;
  approved: boolean;
  status: string;
  message: string;
}

export type JobStatus =
  | 'pending'
  | 'fetching_file'
  | 'scanning'
  | 'generating_fixes'
  | 'awaiting_approval'
  | 'approved'
  | 'creating_branch'
  | 'committing_changes'
  | 'creating_mr'
  | 'completed'
  | 'failed'
  | 'cancelled';
