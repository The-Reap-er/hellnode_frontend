export interface FileChange {
  path: string;
  size: number;
  size_human: string;
  change_type: 'added' | 'removed' | 'modified';
  permission: string;
}

export interface DiveLayer {
  index: number;
  id: string;
  digest?: string;
  command: string;
  size: number;
  size_human: string;
  files_added: FileChange[];
  files_removed: FileChange[];
  files_modified: FileChange[];
  total_files: number;
  added_size: number;
  removed_size?: number;
  modified_size?: number;
}

export interface DiveEfficiency {
  score: number;
  total_wasted_bytes: number;
  total_wasted_human: string;
  user_wasted_percent: number;
  total_image_size: number;
  total_image_size_human: string;
}

export interface DiveAnalysisResult {
  id: string;
  image_name: string;
  digest: string;
  analyzed_at: string;
  layers: DiveLayer[];
  efficiency: DiveEfficiency;
  total_size: number;
  wasted_space: number;
  base_image?: string;
  architecture?: string;
  os?: string;
  created?: string;
}

export interface DiveJobStatus {
  id: string;
  image_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  start_time?: string;
  end_time?: string;
  progress?: number;
  error?: string;
  result?: DiveAnalysisResult;
}

export interface DiveAnalyzeRequest {
  image_name: string;
  force_rescan?: boolean;
}

export interface DiveAnalyzeResponse {
  job_id: string;
  image_name: string;
  status: string;
  message: string;
}

export interface DiveAnalysisListResponse {
  total: number;
  limit: number;
  offset: number;
  analyses: DiveAnalysisResult[];
}

export interface LayerDifference {
  layer_id: string;
  in_image_1: boolean;
  in_image_2: boolean;
  size_diff: number;
  description: string;
}

export interface DiveCompareResponse {
  image_1: string;
  image_2: string;
  image_1_analysis: DiveAnalysisResult;
  image_2_analysis: DiveAnalysisResult;
  size_difference: number;
  efficiency_diff: number;
  layer_differences: LayerDifference[];
}
