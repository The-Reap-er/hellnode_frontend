import { useState, useEffect } from "react";
import { ScanRecord } from "@shared/api";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, XCircle, Loader2, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ScanHistoryProps {
  kubeconfigName: string;
  contextName: string;
}

export function ScanHistory({ kubeconfigName, contextName }: ScanHistoryProps) {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScanHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `http://localhost:8080/api/v1/kubeconfigs/${kubeconfigName}/contexts/${contextName}/scans`,
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch scan history: ${response.status}`);
      }

      const data = await response.json();
      setScans(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch scan history",
      );
      setScans([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchScanHistory();
  }, [kubeconfigName, contextName]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-500 text-white">
            <CheckCircle className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case "running":
        return (
          <Badge className="bg-blue-500 text-white">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Running
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-500 text-white">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-500 text-white">
            <Clock className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  const formatDuration = (duration: string) => {
    // Handle different duration formats
    if (duration.includes("ns")) {
      return "< 1s";
    }
    if (duration.includes("ms")) {
      const ms = parseInt(duration);
      return `${ms}ms`;
    }
    if (duration.includes("s")) {
      const s = parseInt(duration);
      return `${s}s`;
    }
    return duration;
  };

  if (isLoading) {
    return (
      <div className="bg-layer-01 border border-ui-03 rounded p-6">
        <div className="flex items-center justify-center space-x-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="carbon-type-body-01 text-text-02">
            Loading scan history...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-layer-01 border border-ui-03 rounded p-6">
        <div className="flex items-center space-x-2 text-support-01">
          <XCircle className="h-4 w-4" />
          <span className="carbon-type-body-01">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-layer-01 border border-ui-03 rounded">
      <div className="p-6 border-b border-ui-03">
        <div className="flex items-center justify-between">
          <h3 className="carbon-type-productive-heading-02 text-text-01">
            Scan History
          </h3>
          <div className="flex items-center space-x-2 text-text-02">
            <Activity className="h-4 w-4" />
            <span className="carbon-type-label-01">
              {scans.length} total scans
            </span>
          </div>
        </div>
        <p className="carbon-type-body-01 text-text-02 mt-1">
          {contextName} • {kubeconfigName}
        </p>
      </div>

      {scans.length === 0 ? (
        <div className="p-6 text-center">
          <div className="flex flex-col items-center space-y-2">
            <Clock className="h-8 w-8 text-text-03" />
            <h4 className="carbon-type-productive-heading-01 text-text-02">
              No scans found
            </h4>
            <p className="carbon-type-body-01 text-text-03">
              Start your first scan to see history here
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-ui-02">
              <tr>
                <th className="px-6 py-3 text-left carbon-type-label-01 text-text-02 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left carbon-type-label-01 text-text-02 uppercase tracking-wider">
                  Started
                </th>
                <th className="px-6 py-3 text-left carbon-type-label-01 text-text-02 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left carbon-type-label-01 text-text-02 uppercase tracking-wider">
                  Images Scanned
                </th>
                <th className="px-6 py-3 text-left carbon-type-label-01 text-text-02 uppercase tracking-wider">
                  Total Scans
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-03">
              {scans.map((scan) => (
                <tr key={scan.id} className="hover:bg-ui-01">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(scan.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="carbon-type-body-01 text-text-01">
                        {formatDistanceToNow(new Date(scan.started_at), {
                          addSuffix: true,
                        })}
                      </span>
                      <span className="carbon-type-label-01 text-text-03">
                        {new Date(scan.started_at).toLocaleString()}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="carbon-type-body-01 text-text-01 font-mono">
                      {formatDuration(scan.metadata.duration)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="carbon-type-body-01 text-text-01">
                      {scan.metadata.images_scanned}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="carbon-type-body-01 text-text-01 font-semibold">
                      {scan.total_scans}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
