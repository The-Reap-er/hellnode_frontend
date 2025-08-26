/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

/**
 * Vulnerability data types
 */
export interface Vulnerability {
  id: string;
  category: string;
  message: string;
  description: string;
  cve: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  solution: string;
}

export interface ContainerImage {
  name: string;
  image: string;
  vulnerabilities?: Vulnerability[];
}

export interface Node {
  name: string;
  kubeletVersion: string;
  containerImages: ContainerImage[];
}

export interface ClusterVulnerabilityStatus {
  name: string;
  server: string;
  reachable: boolean;
  nodes: Node[];
  apiVersions: string[];
  permissions: {
    canListNodes: boolean;
    canListPods: boolean;
    canGetMetrics: boolean;
  };
}

export interface VulnerabilityResponse {
  valid: boolean;
  message: string;
  clusterStatuses: ClusterVulnerabilityStatus[];
}

/**
 * Scan history types
 */
export interface ScanRecord {
  id: string;
  kubeconfig: string;
  context: string;
  status: "completed" | "running" | "failed";
  total_scans: number;
  started_at: string;
  completed_at: string;
  metadata: {
    duration: string;
    images_scanned: number;
  };
}

export interface ScanHistoryResponse {
  scans: ScanRecord[];
}
