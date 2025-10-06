import {
  DiveAnalyzeRequest,
  DiveAnalyzeResponse,
  DiveJobStatus,
  DiveAnalysisResult,
  DiveAnalysisListResponse,
  DiveCompareResponse,
  DiveLayer,
  DiveEfficiency,
} from '../types/dive';

const BASE_URL = 'http://localhost:8080/api/v1/dive';

export const diveApi = {
  // Start image analysis
  async analyzeImage(request: DiveAnalyzeRequest): Promise<DiveAnalyzeResponse> {
    const response = await fetch(`${BASE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to analyze image' }));
      throw new Error(error.error || 'Failed to analyze image');
    }
    return response.json();
  },

  // Check job status
  async getJobStatus(jobId: string): Promise<DiveJobStatus> {
    const response = await fetch(`${BASE_URL}/job/${jobId}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get job status' }));
      throw new Error(error.error || 'Failed to get job status');
    }
    return response.json();
  },

  // Get latest analysis by image name
  async getAnalysisByImageName(imageName: string): Promise<DiveAnalysisResult> {
    const response = await fetch(`${BASE_URL}/image/${encodeURIComponent(imageName)}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'No analysis found' }));
      throw new Error(error.error || 'No analysis found for this image');
    }
    return response.json();
  },

  // Get analysis by ID
  async getAnalysisById(analysisId: string): Promise<DiveAnalysisResult> {
    const response = await fetch(`${BASE_URL}/analysis/${analysisId}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Analysis not found' }));
      throw new Error(error.error || 'Analysis not found');
    }
    return response.json();
  },

  // List all analyses (paginated)
  async listAnalyses(params?: {
    limit?: number;
    offset?: number;
    image_name?: string;
  }): Promise<DiveAnalysisListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.image_name) queryParams.append('image_name', params.image_name);

    const response = await fetch(`${BASE_URL}/analyses?${queryParams.toString()}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to list analyses' }));
      throw new Error(error.error || 'Failed to list analyses');
    }
    return response.json();
  },

  // Delete analysis
  async deleteAnalysis(analysisId: string): Promise<{ message: string }> {
    const response = await fetch(`${BASE_URL}/analysis/${analysisId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete analysis' }));
      throw new Error(error.error || 'Failed to delete analysis');
    }
    return response.json();
  },

  // Compare two images
  async compareImages(imageName1: string, imageName2: string): Promise<DiveCompareResponse> {
    const response = await fetch(`${BASE_URL}/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_name_1: imageName1,
        image_name_2: imageName2,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to compare images' }));
      throw new Error(error.error || 'Failed to compare images');
    }
    return response.json();
  },

  // Get layer details
  async getLayerDetails(imageName: string, layerId: string): Promise<{ image_name: string; layer: DiveLayer }> {
    const response = await fetch(
      `${BASE_URL}/layer?image_name=${encodeURIComponent(imageName)}&layer_id=${encodeURIComponent(layerId)}`
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get layer details' }));
      throw new Error(error.error || 'Failed to get layer details');
    }
    return response.json();
  },

  // Get efficiency metrics
  async getEfficiency(imageName: string): Promise<{ image_name: string; efficiency: DiveEfficiency; total_size: number; wasted_space: number }> {
    const response = await fetch(`${BASE_URL}/efficiency/${encodeURIComponent(imageName)}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get efficiency metrics' }));
      throw new Error(error.error || 'Failed to get efficiency metrics');
    }
    return response.json();
  },
};
