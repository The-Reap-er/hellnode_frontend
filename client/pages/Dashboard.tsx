import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/ui/metric-card";
import { DataTable } from "@/components/ui/data-table";
import { Link } from "react-router-dom";
import {
  Shield,
  Container,
  AlertTriangle,
  CheckCircle,
  Activity,
  TrendingUp,
  Clock,
  Search,
  Server,
  Loader2,
} from "lucide-react";
import { VulnerabilityResponse, ScanRecord, Vulnerability } from "@shared/api";
import { KubeconfigEntry } from "@shared/kubeconfig";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  // Mock data for the dashboard
  const metrics = [
    {
      title: "Total Scans",
      value: "1,247",
      change: "+12%",
      changeType: "positive" as const,
      icon: Activity,
    },
    {
      title: "Critical Vulnerabilities",
      value: "23",
      change: "-8%",
      changeType: "positive" as const,
      icon: AlertTriangle,
    },
    {
      title: "Docker Images",
      value: "456",
      change: "+5%",
      changeType: "positive" as const,
      icon: Container,
    },
    {
      title: "K8s Clusters",
      value: "18",
      change: "0%",
      changeType: "neutral" as const,
      icon: Shield,
    },
  ];

  const recentScans = [
    {
      name: "nginx:1.21-alpine",
      type: "Docker Image",
      status: "Completed",
      severity: "Medium",
      vulnerabilities: "3",
      lastScan: "2 hours ago",
    },
    {
      name: "production-cluster",
      type: "Kubernetes",
      status: "Running",
      severity: "High",
      vulnerabilities: "12",
      lastScan: "Currently scanning",
    },
    {
      name: "postgres:14",
      type: "Docker Image",
      status: "Completed",
      severity: "Critical",
      vulnerabilities: "7",
      lastScan: "4 hours ago",
    },
    {
      name: "dev-cluster",
      type: "Kubernetes",
      status: "Failed",
      severity: "Low",
      vulnerabilities: "1",
      lastScan: "6 hours ago",
    },
    {
      name: "redis:7-alpine",
      type: "Docker Image",
      status: "Completed",
      severity: "Low",
      vulnerabilities: "0",
      lastScan: "8 hours ago",
    },
  ];

  const tableColumns = [
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "severity", label: "Severity" },
    { key: "vulnerabilities", label: "Vulnerabilities" },
    { key: "lastScan", label: "Last Scan" },
  ];

  const criticalVulnerabilities = [
    {
      cve: "CVE-2023-38545",
      severity: "Critical",
      component: "curl",
      description: "SOCKS5 heap buffer overflow",
      affected: "nginx:1.21, postgres:14",
    },
    {
      cve: "CVE-2023-4911",
      severity: "High",
      component: "glibc",
      description: "Buffer overflow in ld.so",
      affected: "production-cluster",
    },
    {
      cve: "CVE-2023-39325",
      severity: "High",
      component: "golang",
      description: "HTTP/2 rapid reset",
      affected: "multiple containers",
    },
  ];

  const vulnerabilityColumns = [
    { key: "cve", label: "CVE ID" },
    { key: "severity", label: "Severity" },
    { key: "component", label: "Component" },
    { key: "description", label: "Description" },
    { key: "affected", label: "Affected Assets" },
  ];

  return (
    <DashboardLayout>
      <div className="col-span-full">
        {/* Header */}
        <div className="mb-8">
          <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2">
            Security Dashboard
          </h1>
          <p className="carbon-type-body-02 text-text-02">
            Monitor and manage security vulnerabilities across your Kubernetes
            clusters and Docker images
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {metrics.map((metric, index) => (
            <MetricCard key={index} {...metric} />
          ))}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Scans */}
          <div className="lg:col-span-2">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="carbon-type-productive-heading-03 text-text-01">
                  Recent Scans
                </h2>
                <button className="flex items-center space-x-2 px-4 py-2 bg-interactive-01 text-white rounded carbon-type-body-01 hover:bg-interactive-03 transition-colors">
                  <Search className="h-4 w-4" />
                  <span>New Scan</span>
                </button>
              </div>
              <DataTable columns={tableColumns} data={recentScans} />
            </div>
          </div>

          {/* Quick Actions & Stats */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-layer-01 border border-ui-03 rounded p-6">
              <h3 className="carbon-type-productive-heading-02 text-text-01 mb-4">
                Quick Actions
              </h3>
              <div className="space-y-3">
                <Link
                  to="/docker"
                  className="w-full flex items-center space-x-3 p-3 bg-ui-01 hover:bg-ui-03 rounded transition-colors text-left"
                >
                  <Container className="h-5 w-5 text-interactive-01" />
                  <div>
                    <p className="carbon-type-body-01 text-text-01">
                      View Docker Images
                    </p>
                    <p className="carbon-type-label-01 text-text-02">
                      Browse container images across clusters
                    </p>
                  </div>
                </Link>
                <Link
                  to="/kubernetes"
                  className="w-full flex items-center space-x-3 p-3 bg-ui-01 hover:bg-ui-03 rounded transition-colors text-left"
                >
                  <Shield className="h-5 w-5 text-interactive-01" />
                  <div>
                    <p className="carbon-type-body-01 text-text-01">
                      Manage Kubeconfigs
                    </p>
                    <p className="carbon-type-label-01 text-text-02">
                      Upload and manage cluster configurations
                    </p>
                  </div>
                </Link>
                <button className="w-full flex items-center space-x-3 p-3 bg-ui-01 hover:bg-ui-03 rounded transition-colors text-left">
                  <TrendingUp className="h-5 w-5 text-interactive-01" />
                  <div>
                    <p className="carbon-type-body-01 text-text-01">
                      View Trends
                    </p>
                    <p className="carbon-type-label-01 text-text-02">
                      Security analytics & reports
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Scan Status */}
            <div className="bg-layer-01 border border-ui-03 rounded p-6">
              <h3 className="carbon-type-productive-heading-02 text-text-01 mb-4">
                Active Scans
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-support-04" />
                    <span className="carbon-type-body-01 text-text-01">
                      production-cluster
                    </span>
                  </div>
                  <span className="carbon-type-label-01 text-text-02">67%</span>
                </div>
                <div className="w-full bg-ui-03 rounded-full h-2">
                  <div
                    className="bg-support-04 h-2 rounded-full"
                    style={{ width: "67%" }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Critical Vulnerabilities */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="carbon-type-productive-heading-03 text-text-01">
              Critical Vulnerabilities
            </h2>
            <button className="carbon-type-body-01 text-interactive-01 hover:text-interactive-03">
              View all vulnerabilities →
            </button>
          </div>
          <DataTable
            columns={vulnerabilityColumns}
            data={criticalVulnerabilities}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
