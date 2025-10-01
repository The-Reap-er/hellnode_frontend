import { useState } from "react";
import { Trash2, CheckCircle, AlertTriangle, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { KubeconfigEntry, KubeconfigDeleteResponse } from "@shared/kubeconfig";
import { format } from "date-fns";

interface KubeconfigTableProps {
  kubeconfigs: KubeconfigEntry[];
  onDelete: (name: string) => void;
}

export function KubeconfigTable({
  kubeconfigs,
  onDelete,
}: KubeconfigTableProps) {
  const [deletingNames, setDeletingNames] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const handleDelete = async (name: string) => {
    if (deletingNames.has(name)) return;

    setDeletingNames((prev) => new Set(prev).add(name));
    setError("");

    try {
      const response = await fetch(
        `http://localhost:8080/api/v1/kubeconfigs/${name}`,
        {
          method: "DELETE",
        },
      );

      // Treat 404 as success since the kubeconfig is already gone
      if (!response.ok && response.status !== 404) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Only try to parse JSON if there's content
      if (response.status !== 204 && response.status !== 404) {
        const data: KubeconfigDeleteResponse = await response.json();
        console.log("Delete response:", data);
      }

      // Call onDelete in all cases (success, 404, etc.)
      onDelete(name);
    } catch (error) {
      console.error("Delete error:", error);
      setError(`Failed to delete ${name}. Please try again.`);
    } finally {
      setDeletingNames((prev) => {
        const newSet = new Set(prev);
        newSet.delete(name);
        return newSet;
      });
    }
  };

  const getStatusIcon = (status: string) => {
    return status === "valid" ? (
      <CheckCircle className="h-4 w-4 text-support-02" />
    ) : (
      <AlertTriangle className="h-4 w-4 text-support-01" />
    );
  };

  const getStatusBadge = (status: string) => {
    return (
      <span
        className={cn(
          "inline-flex items-center px-2 py-1 rounded carbon-type-label-01 font-medium",
          status === "valid"
            ? "bg-support-02 text-white"
            : "bg-support-01 text-white",
        )}
      >
        {status}
      </span>
    );
  };

  if (kubeconfigs.length === 0) {
    return (
      <div className="bg-layer-01 border border-ui-03 rounded p-8 text-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ui-03">
            <Calendar className="h-6 w-6 text-text-02" />
          </div>
          <div>
            <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
              No Kubeconfigs Imported
            </h3>
            <p className="carbon-type-body-01 text-text-02">
              Upload your first kubeconfig file to get started with cluster
              management.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-layer-01 border border-ui-03 rounded overflow-hidden">
      <div className="px-6 py-4 border-b border-ui-03 bg-layer-02">
        <h3 className="carbon-type-productive-heading-02 text-text-01">
          Imported Kubeconfigs ({kubeconfigs.length})
        </h3>
      </div>

      {error && (
        <div className="mx-6 mt-4 flex items-center space-x-2 p-3 bg-support-01 text-white rounded">
          <AlertTriangle className="h-4 w-4" />
          <span className="carbon-type-body-01">{error}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-layer-02 border-b border-ui-03">
            <tr>
              <th className="px-6 py-4 text-left carbon-type-productive-heading-01 text-text-01">
                Cluster Name
              </th>
              <th className="px-6 py-4 text-left carbon-type-productive-heading-01 text-text-01">
                Status
              </th>
              <th className="px-6 py-4 text-left carbon-type-productive-heading-01 text-text-01">
                Import Date
              </th>
              <th className="px-6 py-4 text-left carbon-type-productive-heading-01 text-text-01">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ui-03">
            {kubeconfigs.map((kubeconfig) => (
              <tr
                key={kubeconfig.name}
                className="hover:bg-layer-02 transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-interactive-01">
                      <span className="carbon-type-label-01 text-white font-medium">
                        {kubeconfig.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="carbon-type-body-01 text-text-01 font-medium">
                      {kubeconfig.name}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(kubeconfig.status)}
                    {getStatusBadge(kubeconfig.status)}
                  </div>
                </td>
                <td className="px-6 py-4 carbon-type-body-01 text-text-02">
                  {format(
                    new Date(kubeconfig.importDate),
                    "MMM dd, yyyy 'at' HH:mm",
                  )}
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleDelete(kubeconfig.name)}
                    disabled={deletingNames.has(kubeconfig.name)}
                    className={cn(
                      "flex items-center space-x-2 px-3 py-2 rounded carbon-type-body-01 transition-colors",
                      deletingNames.has(kubeconfig.name)
                        ? "bg-ui-03 text-text-03 cursor-not-allowed"
                        : "bg-support-01 text-white hover:bg-red-600",
                    )}
                  >
                    {deletingNames.has(kubeconfig.name) ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        <span>Delete</span>
                      </>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
