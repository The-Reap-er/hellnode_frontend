const BASE_URL = 'http://localhost:8080/api/v2/integrations/artifactory';
const BASE_URL_V1 = 'http://localhost:8080/api/v1/artifactory';

// Helper to get auth token from localStorage
const getAuthToken = (): string | null => {
  return localStorage.getItem('artifactory_token');
};

// Helper to get Artifactory URL from localStorage
const getArtifactoryUrl = (): string => {
  return localStorage.getItem('artifactory_url') || 'artifactory.digikala.com';
};

// Helper to create headers with auth
const createAuthHeaders = (): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export interface ArtifactoryLoginRequest {
  username: string;
  token: string;
  url?: string;
  registry?: string; // backward compatible
}

export interface ArtifactoryLoginResponse {
  success: boolean;
  message: string;
  url: string;
  output?: string;
}

export interface ArtifactoryConnectivityRequest {
  url?: string;
  registry?: string; // backward compatible
}

export interface ArtifactoryConnectivityResponse {
  connected: boolean;
  message: string;
  url: string;
  registry: string;
}

export interface Repository {
  repo_key?: string;
  name?: string;
  type?: string;
  description?: string;
  image_count?: number;
  url?: string;
}

export interface RepositoriesResponse {
  repositories: string[];
  total: number;
}

export interface RepositoryInfo {
  repo_key: string;
  type: string;
  description?: string;
  image_count: number;
  url: string;
}

export interface Image {
  repo_key?: string;
  image_name?: string;
  tags?: string[];
  tag_count?: number;
  updated_at?: string;
}

export interface ImagesResponse {
  repo_key: string;
  images: string[];
  total: number;
}

export interface SearchResult {
  repo_key: string;
  image_name: string;
  tags: string[];
  tag_count: number;
  updated_at: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
}

export interface TagsResponse {
  name: string;
  tags: string[];
}

export interface ManifestLayer {
  mediaType: string;
  size: number;
  digest: string;
}

export interface ManifestConfig {
  mediaType: string;
  size: number;
  digest: string;
}

export interface Manifest {
  schemaVersion: number;
  mediaType: string;
  config: ManifestConfig;
  layers: ManifestLayer[];
  totalSize: number;
}

export interface ImageConfig {
  architecture: string;
  os: string;
  config: {
    User?: string;
    ExposedPorts?: { [key: string]: {} };
    Env?: string[];
    Entrypoint?: string[];
    Cmd?: string[];
    Labels?: { [key: string]: string };
  };
  created: string;
}

export interface ImageDetails {
  repo_key: string;
  image_name: string;
  tag: string;
  digest: string;
  size: number;
  architecture: string;
  os: string;
  labels: Array<{ key: string; value: string }>;
  layers: ManifestLayer[];
  total_layers: number;
  manifest: Manifest;
  created: string;
}

export interface DockerfileResponse {
  repo_key: string;
  image_name: string;
  tag: string;
  content: string;
  available: boolean;
  message: string;
}

export const artifactoryApi = {
  // Login to Artifactory (v1 for backward compatibility)
  async login(request: ArtifactoryLoginRequest): Promise<ArtifactoryLoginResponse> {
    const response = await fetch(`${BASE_URL_V1}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to login' }));
      throw new Error(error.error || error.message || 'Failed to login to Artifactory');
    }
    return response.json();
  },

  // Check connectivity (POST) (v1)
  async checkConnectivityPost(request: ArtifactoryConnectivityRequest): Promise<ArtifactoryConnectivityResponse> {
    const response = await fetch(`${BASE_URL_V1}/connectivity`, {
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

  // Check connectivity (GET) (v1)
  async checkConnectivityGet(urlOrRegistry: string): Promise<ArtifactoryConnectivityResponse> {
    const queryParam = urlOrRegistry.includes('://') ? `url=${encodeURIComponent(urlOrRegistry)}` : `registry=${encodeURIComponent(urlOrRegistry)}`;
    const response = await fetch(`${BASE_URL_V1}/connectivity?${queryParam}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to check connectivity' }));
      throw new Error(error.error || error.message || 'Failed to check connectivity');
    }
    return response.json();
  },

  // Logout from Artifactory (v1)
  async logout(urlOrRegistry: string): Promise<{ success: boolean; message: string; url: string }> {
    const queryParam = urlOrRegistry.includes('://') ? `url=${encodeURIComponent(urlOrRegistry)}` : `registry=${encodeURIComponent(urlOrRegistry)}`;
    const response = await fetch(`${BASE_URL_V1}/logout?${queryParam}`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to logout' }));
      throw new Error(error.error || error.message || 'Failed to logout from Artifactory');
    }
    return response.json();
  },

  // V2 API - Repository Operations
  async listRepositories(): Promise<RepositoriesResponse> {
    const response = await fetch(`${BASE_URL}/repositories`, {
      headers: createAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to list repositories' }));
      throw new Error(error.error || error.message || 'Failed to list repositories');
    }
    return response.json();
  },

  async getRepositoryInfo(repoKey: string): Promise<RepositoryInfo> {
    const response = await fetch(`${BASE_URL}/repositories/${encodeURIComponent(repoKey)}/info`, {
      headers: createAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get repository info' }));
      throw new Error(error.error || error.message || 'Failed to get repository info');
    }
    return response.json();
  },

  // V2 API - Image Operations
  async listImages(repoKey: string): Promise<ImagesResponse> {
    const response = await fetch(`${BASE_URL}/repositories/${encodeURIComponent(repoKey)}/images`, {
      headers: createAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to list images' }));
      throw new Error(error.error || error.message || 'Failed to list images');
    }
    return response.json();
  },

  async searchImages(repoKey: string, query: string): Promise<SearchResponse> {
    const response = await fetch(`${BASE_URL}/repositories/${encodeURIComponent(repoKey)}/search?q=${encodeURIComponent(query)}`, {
      headers: createAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to search images' }));
      throw new Error(error.error || error.message || 'Failed to search images');
    }
    return response.json();
  },

  // V2 API - Tag Operations
  async listTags(repoKey: string, imageName: string, n?: number, last?: string): Promise<TagsResponse> {
    let url = `${BASE_URL}/repositories/${encodeURIComponent(repoKey)}/images/${encodeURIComponent(imageName)}/tags`;
    const params = new URLSearchParams();
    if (n) params.append('n', n.toString());
    if (last) params.append('last', last);
    if (params.toString()) url += `?${params.toString()}`;

    const response = await fetch(url, {
      headers: createAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to list tags' }));
      throw new Error(error.error || error.message || 'Failed to list tags');
    }
    return response.json();
  },

  // V2 API - Manifest & Details
  async getManifest(repoKey: string, imageName: string, tag: string): Promise<Manifest> {
    const response = await fetch(
      `${BASE_URL}/repositories/${encodeURIComponent(repoKey)}/images/${encodeURIComponent(imageName)}/tags/${encodeURIComponent(tag)}/manifest`,
      {
        headers: createAuthHeaders(),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get manifest' }));
      throw new Error(error.error || error.message || 'Failed to get manifest');
    }
    return response.json();
  },

  async getImageConfig(repoKey: string, imageName: string, digest: string): Promise<ImageConfig> {
    const response = await fetch(
      `${BASE_URL}/repositories/${encodeURIComponent(repoKey)}/images/${encodeURIComponent(imageName)}/config/${encodeURIComponent(digest)}`,
      {
        headers: createAuthHeaders(),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get image config' }));
      throw new Error(error.error || error.message || 'Failed to get image config');
    }
    return response.json();
  },

  async getImageDetails(repoKey: string, imageName: string, tag: string): Promise<ImageDetails> {
    const response = await fetch(
      `${BASE_URL}/repositories/${encodeURIComponent(repoKey)}/images/${encodeURIComponent(imageName)}/tags/${encodeURIComponent(tag)}/details`,
      {
        headers: createAuthHeaders(),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get image details' }));
      throw new Error(error.error || error.message || 'Failed to get image details');
    }
    return response.json();
  },

  async getDockerfile(repoKey: string, imageName: string, tag: string): Promise<DockerfileResponse> {
    const response = await fetch(
      `${BASE_URL}/repositories/${encodeURIComponent(repoKey)}/images/${encodeURIComponent(imageName)}/tags/${encodeURIComponent(tag)}/dockerfile`,
      {
        headers: createAuthHeaders(),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get Dockerfile' }));
      throw new Error(error.error || error.message || 'Failed to get Dockerfile');
    }
    return response.json();
  },
};
