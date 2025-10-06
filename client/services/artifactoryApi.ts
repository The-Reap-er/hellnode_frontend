const BASE_URL = 'http://localhost:8080/api/v1/artifactory';

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

export const artifactoryApi = {
  // Login to Artifactory
  async login(request: ArtifactoryLoginRequest): Promise<ArtifactoryLoginResponse> {
    const response = await fetch(`${BASE_URL}/login`, {
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

  // Check connectivity (POST)
  async checkConnectivityPost(request: ArtifactoryConnectivityRequest): Promise<ArtifactoryConnectivityResponse> {
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
  async checkConnectivityGet(urlOrRegistry: string): Promise<ArtifactoryConnectivityResponse> {
    const queryParam = urlOrRegistry.includes('://') ? `url=${encodeURIComponent(urlOrRegistry)}` : `registry=${encodeURIComponent(urlOrRegistry)}`;
    const response = await fetch(`${BASE_URL}/connectivity?${queryParam}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to check connectivity' }));
      throw new Error(error.error || error.message || 'Failed to check connectivity');
    }
    return response.json();
  },

  // Logout from Artifactory
  async logout(urlOrRegistry: string): Promise<{ success: boolean; message: string; url: string }> {
    const queryParam = urlOrRegistry.includes('://') ? `url=${encodeURIComponent(urlOrRegistry)}` : `registry=${encodeURIComponent(urlOrRegistry)}`;
    const response = await fetch(`${BASE_URL}/logout?${queryParam}`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to logout' }));
      throw new Error(error.error || error.message || 'Failed to logout from Artifactory');
    }
    return response.json();
  },
};
