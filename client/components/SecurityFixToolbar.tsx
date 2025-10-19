import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { gitlabApi, SecurityFixJobStatusResponse, SecurityFixJob } from "@/services/gitlabApi";
import { Sparkles, AlertTriangle, CheckCircle, X, Loader2, Shield, FileCode } from "lucide-react";

export type { SecurityFixJob };

interface SecurityFixToolbarProps {
  projectId: number;
  filePath: string;
  gitlabUrl: string;
  defaultBranch?: string;
  fileContent?: string;
  allDockerfiles?: string[];
}

export function SecurityFixToolbar({
  projectId,
  filePath,
  gitlabUrl,
  defaultBranch = "main",
  fileContent,
  allDockerfiles = [],
}: SecurityFixToolbarProps) {
  const { toast } = useToast();
  const [showSecretWarning, setShowSecretWarning] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<SecurityFixJobStatusResponse | null>(null);
  const [secretsDetected, setSecretsDetected] = useState<string[]>([]);
  const [selectedDockerfile, setSelectedDockerfile] = useState<string>(filePath);
  const [showDockerfileSelector, setShowDockerfileSelector] = useState(false);

  // Cleanup when file changes or component unmounts
  useEffect(() => {
    return () => {
      // Cancel any ongoing jobs when switching files
      if (currentJobId && isProcessing) {
        gitlabApi.cancelSecurityFixJob(currentJobId).catch(console.error);
      }
    };
  }, [filePath, projectId]); // Trigger cleanup when file or project changes

  // Reset state when file changes
  useEffect(() => {
    setIsProcessing(false);
    setCurrentJobId(null);
    setJobStatus(null);
    setShowApprovalDialog(false);
    setShowSecretWarning(false);
  }, [filePath, projectId]);

  // Poll job status
  useEffect(() => {
    if (!currentJobId || !isProcessing) return;

    const interval = setInterval(async () => {
      try {
        const status = await gitlabApi.getSecurityFixJob(currentJobId);
        setJobStatus(status);

        if (status.job.status === "awaiting_approval") {
          setIsProcessing(false);
          setShowApprovalDialog(true);
        } else if (status.job.status === "completed") {
          setIsProcessing(false);
          toast({
            title: "Success!",
            description: status.job.current_step,
          });
          setCurrentJobId(null);
          setJobStatus(null);
        } else if (status.job.status === "failed" || status.job.status === "cancelled") {
          setIsProcessing(false);
          toast({
            title: status.job.status === "failed" ? "Job Failed" : "Job Cancelled",
            description: status.job.error || status.job.current_step,
            variant: "destructive",
          });
          setCurrentJobId(null);
          setJobStatus(null);
        }
      } catch (error: any) {
        console.error("Failed to poll job status:", error);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [currentJobId, isProcessing, toast]);

  const detectSecrets = (content: string): string[] => {
    const secrets: string[] = [];
    const patterns = [
      { name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/gi },
      { name: "Private Key", regex: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/gi },
      { name: "API Key Pattern", regex: /[aA]pi[_-]?[kK]ey['\"]?\s*[:=]\s*['"]?[\w\-]{20,}/gi },
      { name: "Password", regex: /[pP]assword['\"]?\s*[:=]\s*['"][^'"]{3,}/gi },
      { name: "Token", regex: /[tT]oken['\"]?\s*[:=]\s*['"][\w\-]{20,}/gi },
      { name: "Secret", regex: /[sS]ecret['\"]?\s*[:=]\s*['"][^'"]{3,}/gi },
    ];

    patterns.forEach(pattern => {
      const matches = content.match(pattern.regex);
      if (matches) {
        secrets.push(pattern.name);
      }
    });

    return [...new Set(secrets)];
  };

  // Decode base64 content if needed
  const decodeContent = (content: string): string => {
    try {
      // Check if content looks like base64
      if (/^[A-Za-z0-9+/=]+$/.test(content.trim()) && content.length % 4 === 0) {
        return atob(content);
      }
      return content;
    } catch {
      return content;
    }
  };

  // Parse proposed changes from backend format
  interface ParsedChange {
    category: string;
    lineNumber: string;
    description: string;
  }

  const parseProposedChanges = (changes: string[]): ParsedChange[] => {
    const parsed: ParsedChange[] = [];

    changes.forEach((change) => {
      // Extract category and line number: "category (Line X): description"
      const match = change.match(/^(\w+)\s+\(Line\s+(\d+)\):\s+(.+)$/);
      if (match) {
        parsed.push({
          category: match[1],
          lineNumber: match[2],
          description: match[3],
        });
      } else {
        // Fallback if format doesn't match
        parsed.push({
          category: "other",
          lineNumber: "N/A",
          description: change,
        });
      }
    });

    return parsed;
  };

  // Group changes by category
  const groupChangesByCategory = (parsedChanges: ParsedChange[]) => {
    const groups: Record<string, ParsedChange[]> = {};

    parsedChanges.forEach((change) => {
      if (!groups[change.category]) {
        groups[change.category] = [];
      }
      groups[change.category].push(change);
    });

    return groups;
  };

  // Get badge color for category
  const getCategoryColor = (category: string): string => {
    const categoryMap: Record<string, string> = {
      base_image: "bg-purple-500",
      packages: "bg-blue-500",
      secrets: "bg-red-500",
      user: "bg-green-500",
      permissions: "bg-yellow-500",
      other: "bg-gray-500",
    };
    return categoryMap[category.toLowerCase()] || "bg-gray-500";
  };

  const getCategoryLabel = (category: string): string => {
    return category.replace(/_/g, " ").toUpperCase();
  };

  const handleFixWithAI = () => {
    // If multiple Dockerfiles, show selector
    if (allDockerfiles.length > 1 && !showDockerfileSelector) {
      setShowDockerfileSelector(true);
      return;
    }

    // If we have file content (user is viewing a Dockerfile), check for secrets
    if (fileContent && selectedDockerfile) {
      const detected = detectSecrets(fileContent);
      setSecretsDetected(detected);

      if (detected.length > 0) {
        setShowSecretWarning(true);
        return;
      }
    }

    startSecurityFixJob();
  };

  const startSecurityFixJob = async () => {
    setShowSecretWarning(false);
    setShowDockerfileSelector(false);
    setIsProcessing(true);

    try {
      const result = await gitlabApi.createSecurityFixJob(projectId, {
        file_path: selectedDockerfile,
        source_branch: defaultBranch,
        file_type: "dockerfile",
        options: {
          preserve_comments: true,
          explain_changes: true,
        },
        labels: ["security", "automated-ai-scan"],
        url: gitlabUrl,
      });

      setCurrentJobId(result.job_id);
      toast({
        title: "Dockerfile Scan Started",
        description: `Scanning ${selectedDockerfile} with AI for security issues. Track progress in the toolbar below.`,
      });
    } catch (error: any) {
      setIsProcessing(false);
      toast({
        title: "Failed to start scan",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleApprove = async () => {
    if (!currentJobId) return;

    try {
      await gitlabApi.approveSecurityFixJob(currentJobId, {
        approved: true,
        url: gitlabUrl,
      });

      setShowApprovalDialog(false);
      setIsProcessing(true);
      toast({
        title: "Approved",
        description: "Creating merge request...",
      });
    } catch (error: any) {
      toast({
        title: "Failed to approve",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleReject = async () => {
    if (!currentJobId) return;

    try {
      await gitlabApi.approveSecurityFixJob(currentJobId, {
        approved: false,
        url: gitlabUrl,
      });

      setShowApprovalDialog(false);
      setCurrentJobId(null);
      setJobStatus(null);
      toast({
        title: "Rejected",
        description: "Security fix cancelled",
      });
    } catch (error: any) {
      toast({
        title: "Failed to reject",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCancelJob = async () => {
    if (!currentJobId) return;

    try {
      await gitlabApi.cancelSecurityFixJob(currentJobId);
      setIsProcessing(false);
      setCurrentJobId(null);
      setJobStatus(null);
      toast({
        title: "Job Cancelled",
        description: "Security fix job has been cancelled",
      });
    } catch (error: any) {
      toast({
        title: "Failed to cancel",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-layer-01 border border-ui-04 rounded">
        <Sparkles className="h-4 w-4 text-blue-500" />
        <span className="carbon-type-label-01 text-text-01 font-medium">Dockerfile Scan with AI</span>
        <span className="carbon-type-label-01 text-text-03">
          ({allDockerfiles.length} file{allDockerfiles.length > 1 ? "s" : ""})
        </span>

        <Button
          onClick={handleFixWithAI}
          disabled={isProcessing}
          size="sm"
          className="flex items-center gap-2 ml-auto"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {jobStatus?.job.current_step || "Scanning..."}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {allDockerfiles.length > 1 ? "Scan Dockerfiles" : "Scan Dockerfile"}
            </>
          )}
        </Button>

        {isProcessing && jobStatus && (
          <>
            <Progress value={jobStatus.job.progress} className="w-32" />
            <Button
              onClick={handleCancelJob}
              variant="ghost"
              size="sm"
              className="flex items-center gap-1"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </>
        )}
      </div>

      {/* Dockerfile Selector Dialog */}
      <Dialog open={showDockerfileSelector} onOpenChange={setShowDockerfileSelector}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Select Dockerfile to Scan</DialogTitle>
            <DialogDescription>
              Choose which Dockerfile you want to scan for security issues
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {allDockerfiles.map((dockerfile) => (
              <button
                key={dockerfile}
                onClick={() => {
                  setSelectedDockerfile(dockerfile);
                  setShowDockerfileSelector(false);
                  // Auto-start if no secrets need checking
                  setTimeout(() => handleFixWithAI(), 100);
                }}
                className={`w-full text-left p-3 rounded border transition-colors ${
                  selectedDockerfile === dockerfile
                    ? "bg-blue-500/10 border-blue-500"
                    : "bg-layer-01 border-ui-04 hover:bg-ui-01"
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-blue-500" />
                  <span className="carbon-type-body-01 font-mono text-text-01">
                    {dockerfile}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDockerfileSelector(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secret Warning Dialog */}
      <Dialog open={showSecretWarning} onOpenChange={setShowSecretWarning}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <DialogTitle>Potential Secrets Detected</DialogTitle>
            </div>
            <DialogDescription>
              We detected potential secrets in your Dockerfile. Please review before proceeding.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="carbon-type-body-02 text-text-02">Detected patterns:</p>
            <div className="flex flex-wrap gap-2">
              {secretsDetected.map((secret) => (
                <Badge key={secret} variant="destructive">
                  {secret}
                </Badge>
              ))}
            </div>
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded">
              <p className="carbon-type-label-01 text-text-01">
                <strong>Warning:</strong> Using secrets in Dockerfiles is a security risk.
                Consider using environment variables or secret management tools instead.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSecretWarning(false)}>
              Cancel
            </Button>
            <Button onClick={startSecurityFixJob}>
              Continue Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="max-w-7xl w-[95vw] h-[90vh] p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-ui-04">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-6 w-6 text-green-500" />
                <div>
                  <DialogTitle className="text-xl">Security Scan Complete</DialogTitle>
                  <DialogDescription className="mt-1">
                    Review the AI-proposed security fixes before creating a merge request
                  </DialogDescription>
                </div>
              </div>
              {jobStatus?.job.scan_result && (
                <div className="flex gap-2">
                  <Badge className="bg-red-600 hover:bg-red-700 text-white border-0">
                    Critical: {jobStatus.job.scan_result.critical_count}
                  </Badge>
                  <Badge className="bg-orange-500 hover:bg-orange-600 text-white border-0">
                    High: {jobStatus.job.scan_result.high_count}
                  </Badge>
                  <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white border-0">
                    Medium: {jobStatus.job.scan_result.medium_count}
                  </Badge>
                  <Badge className="bg-blue-500 hover:bg-blue-600 text-white border-0">
                    Low: {jobStatus.job.scan_result.low_count}
                  </Badge>
                </div>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            {jobStatus && (
              <div className="grid grid-cols-2 gap-0 h-full">
                {/* Left Panel - Proposed Changes */}
                <div className="border-r border-ui-04 flex flex-col overflow-hidden">
                  <div className="bg-layer-01 border-b border-ui-04 px-6 py-3 flex-shrink-0">
                    <h3 className="carbon-type-heading-03 font-semibold text-text-01">
                      Proposed Changes
                    </h3>
                    {jobStatus.job.changes && (
                      <p className="carbon-type-body-02 text-text-03 mt-1">
                        {jobStatus.job.changes.length} security improvements identified
                      </p>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-6">
                      {jobStatus.job.changes && jobStatus.job.changes.length > 0 && (() => {
                        const parsedChanges = parseProposedChanges(jobStatus.job.changes);
                        const groupedChanges = groupChangesByCategory(parsedChanges);

                        return Object.entries(groupedChanges).map(([category, changes]) => (
                          <div key={category} className="space-y-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${getCategoryColor(category)}`} />
                              <h4 className="carbon-type-heading-04 font-semibold text-text-01">
                                {getCategoryLabel(category)}
                              </h4>
                              <Badge variant="outline" className="text-xs">
                                {changes.length}
                              </Badge>
                            </div>

                            <div className="space-y-2 pl-4 border-l-2 border-ui-03">
                              {changes.map((change, idx) => (
                                <div key={idx} className="bg-layer-01 border border-ui-04 rounded p-3">
                                  <div className="flex items-start gap-2 mb-2">
                                    <Badge variant="outline" className="text-xs font-mono">
                                      Line {change.lineNumber}
                                    </Badge>
                                  </div>
                                  <p className="carbon-type-body-02 text-text-02 leading-relaxed">
                                    {change.description}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>

                {/* Right Panel - File Comparison */}
                <div className="flex flex-col overflow-hidden">
                  <div className="bg-layer-01 border-b border-ui-04 px-6 py-3 flex-shrink-0">
                    <h3 className="carbon-type-heading-03 font-semibold text-text-01">
                      File Comparison
                    </h3>
                    <p className="carbon-type-body-02 text-text-03 mt-1">
                      Compare original and fixed Dockerfile
                    </p>
                  </div>

                  {jobStatus.job.original_content && jobStatus.job.fixed_content && (
                    <Tabs defaultValue="split" className="flex-1 flex flex-col overflow-hidden">
                      <div className="border-b border-ui-04 px-6 flex-shrink-0">
                        <TabsList className="bg-transparent border-0">
                          <TabsTrigger value="split" className="data-[state=active]:bg-layer-01">
                            Split View
                          </TabsTrigger>
                          <TabsTrigger value="original" className="data-[state=active]:bg-layer-01">
                            Original
                          </TabsTrigger>
                          <TabsTrigger value="fixed" className="data-[state=active]:bg-layer-01">
                            Fixed
                          </TabsTrigger>
                        </TabsList>
                      </div>

                      <TabsContent value="split" className="flex-1 overflow-y-auto m-0 data-[state=active]:flex data-[state=active]:flex-col">
                        <div className="grid grid-cols-2 divide-x divide-ui-04 h-full">
                          {/* Original */}
                          <div className="flex flex-col overflow-hidden">
                            <div className="bg-red-500/10 px-4 py-2 border-b border-ui-04 flex-shrink-0">
                              <span className="carbon-type-label-01 text-red-500 font-medium">Original</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 bg-field-01">
                              <pre className="font-mono text-xs text-text-01 leading-relaxed whitespace-pre-wrap break-words">
                                {decodeContent(jobStatus.job.original_content)}
                              </pre>
                            </div>
                          </div>

                          {/* Fixed */}
                          <div className="flex flex-col overflow-hidden">
                            <div className="bg-green-500/10 px-4 py-2 border-b border-ui-04 flex-shrink-0">
                              <span className="carbon-type-label-01 text-green-500 font-medium">Fixed</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 bg-field-01">
                              <pre className="font-mono text-xs text-text-01 leading-relaxed whitespace-pre-wrap break-words">
                                {decodeContent(jobStatus.job.fixed_content)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="original" className="flex-1 overflow-y-auto m-0 data-[state=active]:block">
                        <div className="p-6 bg-field-01 min-h-full">
                          <pre className="font-mono text-xs text-text-01 leading-relaxed whitespace-pre-wrap break-words">
                            {decodeContent(jobStatus.job.original_content)}
                          </pre>
                        </div>
                      </TabsContent>

                      <TabsContent value="fixed" className="flex-1 overflow-y-auto m-0 data-[state=active]:block">
                        <div className="p-6 bg-field-01 min-h-full">
                          <pre className="font-mono text-xs text-text-01 leading-relaxed whitespace-pre-wrap break-words">
                            {decodeContent(jobStatus.job.fixed_content)}
                          </pre>
                        </div>
                      </TabsContent>
                    </Tabs>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-ui-04 bg-layer-01">
            <div className="flex justify-between w-full items-center">
              <div className="flex items-center gap-2 text-text-03">
                <Sparkles className="h-4 w-4" />
                <span className="carbon-type-label-01">AI-powered security improvements</span>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleReject}
                  className="border-red-500 text-red-500 hover:bg-red-500/10"
                >
                  <X className="h-4 w-4 mr-2" />
                  Reject Changes
                </Button>
                <Button
                  onClick={handleApprove}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve & Create MR
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
