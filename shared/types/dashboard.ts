export interface VulnerabilitySummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
}

export interface VulnerabilityChange {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
  total: number;
}

export interface TagVulnerabilityMetrics {
  tag: string;
  last_scan: string;
  vulnerabilities: VulnerabilitySummary;
  scan_status: "success" | "failed" | "pending" | "not_found";
  scan_duration?: string;
  cache_hit: boolean;
  digest?: string;
  trend_direction: "improving" | "worsening" | "stable" | "new";
  compared_to_prev?: VulnerabilityChange;
}

export interface ImageSearchResult {
  image_name: string;
  total_tags: number;
  last_scan: string;
  latest_vuln_count: VulnerabilitySummary;
  risk_level: "critical" | "high" | "medium" | "low" | "clean";
  popular_tags?: string[];
}

export interface TagComparisonResponse {
  image_name: string;
  comparison: TagVulnerabilityMetrics[];
  summary: {
    most_secure_tag: string;
    least_secure_tag: string;
    recommended_tag: string;
    total_vuln_range: string;
    critical_vuln_range: string;
    recommendation: string;
  };
  generated_at: string;
}

export interface DashboardMetrics {
  total_images: number;
  total_scans: number;
  total_vulnerabilities: number;
  critical_images: number;
  high_risk_images: number;
  clean_images: number;
  recent_activity?: Array<{
    image_name: string;
    tag: string;
    action: string;
    timestamp: string;
    details: string;
  }>;
  top_vulnerable_images?: Array<{
    image_name: string;
    most_vulnerable_tag: string;
    vulnerabilities: VulnerabilitySummary;
    risk_score: number;
    last_scan: string;
  }>;
  generated_at?: string;
}

export interface RecentActivity {
  image_name: string;
  tag: string;
  scan_time: string;
  vulnerabilities: VulnerabilitySummary;
  risk_level: "critical" | "high" | "medium" | "low" | "clean";
}

export interface TimelineDataPoint {
  tag: string;
  scan_time: string;
  date?: string;
  vulnerabilities: VulnerabilitySummary;
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
  informational?: number;
  total?: number;
  change_from_prev?: {
    total_change: number;
    critical_change: number;
    high_change: number;
    medium_change: number;
    low_change: number;
    informational_change: number;
  } | null;
}

export interface TrendData {
  image_name: string;
  trends?: {
    improving_tags: string[];
    worsening_tags: string[];
    stable_tags: string[];
    new_tags: string[];
    timeline: TimelineDataPoint[];
    overall_trend: string;
    risk_score: number;
  };
  timeline?: TimelineDataPoint[];
}
