export interface ScanError {
  message: string;
  code?: string;
  details?: Record<string, any>;
}

export interface CauseMetadata {
  StartLine: number;
  EndLine: number;
  Code?: {
    Lines: Array<{
      Number: number;
      Content: string;
      IsCause: boolean;
      FirstCause?: boolean;
      LastCause?: boolean;
      Annotation?: string;
    }>;
  };
}

export interface Misconfiguration {
  ID: string;
  Title: string;
  Description: string;
  Severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  PrimaryURL: string;
  Resolution: string;
  CauseMetadata?: CauseMetadata;
  Message?: string;
  Query?: string;
  References?: string[];
  Status?: string;
  ResourceType?: string;
  ResourceName?: string;
  ResourceNamespace?: string;
}

export interface MisconfSummary {
  Successes: number;
  Failures: number;
  Exceptions: number;
}

export interface ManifestfileScanResult {
  CreatedAt: string;
  Results: Array<{
    Target: string;
    Class: string;
    Type: string;
    Misconfigurations: Misconfiguration[];
    MisconfSummary: MisconfSummary;
  }>;
}
