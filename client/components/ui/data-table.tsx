import * as React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";

interface TableColumn {
  key: string;
  label: string;
  className?: string;
  render?: (value: any, row: TableRow) => React.ReactNode;
}

interface TableRow {
  [key: string]: any;
}

interface DataTableProps {
  columns: TableColumn[];
  data: TableRow[];
  className?: string;
  onRowClick?: (row: TableRow, index: number) => void;
}

function getSeverityIcon(severity: string) {
  switch (severity?.toLowerCase()) {
    case "critical":
      return <XCircle className="h-4 w-4 text-support-01" />;
    case "high":
      return <AlertTriangle className="h-4 w-4 text-support-01" />;
    case "medium":
      return <AlertTriangle className="h-4 w-4 text-support-03" />;
    case "low":
      return <CheckCircle className="h-4 w-4 text-support-02" />;
    case "info":
      return <CheckCircle className="h-4 w-4 text-support-04" />;
    default:
      return <Clock className="h-4 w-4 text-text-03" />;
  }
}

function getSeverityBadge(severity: string) {
  const baseClasses =
    "inline-flex items-center px-2 py-1 rounded carbon-type-label-01 font-medium";

  switch (severity?.toLowerCase()) {
    case "critical":
      return `${baseClasses} bg-support-01 text-white`;
    case "high":
      return `${baseClasses} bg-support-01 text-white`;
    case "medium":
      return `${baseClasses} bg-support-03 text-text-01`;
    case "low":
      return `${baseClasses} bg-support-02 text-white`;
    case "info":
      return `${baseClasses} bg-support-04 text-white`;
    default:
      return `${baseClasses} bg-ui-03 text-text-02`;
  }
}

export function DataTable({
  columns,
  data,
  className,
  onRowClick,
}: DataTableProps) {
  return (
    <div
      className={cn(
        "bg-layer-01 border border-ui-03 rounded overflow-hidden",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-layer-02 border-b border-ui-03">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "px-6 py-4 text-left carbon-type-productive-heading-01 text-text-01",
                    column.className,
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ui-03">
            {data.map((row, index) => (
              <tr
                key={index}
                className={cn(
                  "hover:bg-layer-02 transition-colors",
                  onRowClick && "cursor-pointer",
                )}
                onClick={() => onRowClick?.(row, index)}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-6 py-4 carbon-type-body-01 text-text-01",
                      column.className,
                    )}
                  >
                    {column.render ? (
                      column.render(row[column.key], row)
                    ) : column.key === "severity" ? (
                      <div className="flex items-center space-x-2">
                        {getSeverityIcon(row[column.key])}
                        <span className={getSeverityBadge(row[column.key])}>
                          {row[column.key]}
                        </span>
                      </div>
                    ) : column.key === "status" ? (
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-1 rounded carbon-type-label-01 font-medium",
                          row[column.key] === "Completed" &&
                            "bg-support-02 text-white",
                          row[column.key] === "Running" &&
                            "bg-support-04 text-white",
                          row[column.key] === "Failed" &&
                            "bg-support-01 text-white",
                          row[column.key] === "Pending" &&
                            "bg-ui-03 text-text-02",
                        )}
                      >
                        {row[column.key]}
                      </span>
                    ) : (
                      row[column.key]
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
