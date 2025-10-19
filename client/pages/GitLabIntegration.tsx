import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { gitlabApi, GitLabProject, GitLabTreeNode } from "@/services/gitlabApi";
import {
  Search,
  GitBranch,
  FolderOpen,
  Folder,
  File,
  FileCode,
  ChevronRight,
  ChevronDown,
  Loader2,
  RefreshCw,
  ExternalLink,
  Code,
  AlertCircle,
  Container,
  Layers,
  Shield,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SecurityFixToolbar } from "@/components/SecurityFixToolbar";

// Tree node with children for recursive structure
interface TreeNodeWithChildren extends GitLabTreeNode {
  children?: TreeNodeWithChildren[];
  isLoading?: boolean;
}

export default function GitLabIntegration() {
  const { toast } = useToast();

  // State - Load GitLab URL from localStorage (set by Settings page)
  const [gitlabUrl, setGitlabUrl] = useState(() => {
    return localStorage.getItem("gitlab_url") || "gitlab.com";
  });

  // Save GitLab URL to localStorage when it changes
  useEffect(() => {
    if (gitlabUrl) {
      localStorage.setItem("gitlab_url", gitlabUrl);
    }
  }, [gitlabUrl]);
  const [searchQuery, setSearchQuery] = useState("");
  const [projects, setProjects] = useState<GitLabProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [selectedProject, setSelectedProject] = useState<GitLabProject | null>(null);
  const [treeData, setTreeData] = useState<TreeNodeWithChildren[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [dockerfilePaths, setDockerfilePaths] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [extractedImages, setExtractedImages] = useState<Array<{ image: string; usage: string; stage?: string }>>([]);
  const [scanningImages, setScanningImages] = useState<Set<string>>(new Set());
  const [scanResults, setScanResults] = useState<Map<string, any>>(new Map());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [projectsWithDockerfiles, setProjectsWithDockerfiles] = useState<Set<number>>(new Set());

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [currentPage]);

  const loadProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const result = await gitlabApi.listProjects({
        url: gitlabUrl,
        page: currentPage,
        per_page: 20,
      });
      setProjects(result.projects);
      setTotalPages(result.total_pages);

      // Check each project for Dockerfiles in the background
      checkProjectsForDockerfiles(result.projects);
    } catch (error: any) {
      toast({
        title: "Failed to load projects",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const checkProjectsForDockerfiles = async (projectList: GitLabProject[]) => {
    const projectsWithDf = new Set<number>();

    // Check projects in parallel
    const checks = projectList.map(async (project) => {
      const hasDockerfile = await checkProjectForDockerfile(project.id);
      if (hasDockerfile) {
        projectsWithDf.add(project.id);
      }
    });

    await Promise.all(checks);
    setProjectsWithDockerfiles(projectsWithDf);
  };

  const handleProjectSelect = async (project: GitLabProject) => {
    setSelectedProject(project);
    setTreeData([]);
    setExpandedFolders(new Set());
    setDockerfilePaths(new Set());
    setSelectedFile(null);
    setFileContent(null);

    // Load full recursive tree and find Dockerfiles
    await loadFullTree(project.id);
  };

  const checkProjectForDockerfile = async (projectId: number): Promise<boolean> => {
    try {
      const files = await gitlabApi.findDockerfiles(projectId, {
        url: gitlabUrl,
      });
      return files.length > 0;
    } catch (error) {
      return false;
    }
  };

  const loadFullTree = async (projectId: number) => {
    setIsLoadingTree(true);
    try {
      // Load the full recursive tree - this should return ALL files and folders
      const result = await gitlabApi.getTree(projectId, {
        url: gitlabUrl,
        ref: selectedProject?.default_branch,
        recursive: true,
        per_page: 100, // Ensure we get a good number of items
      });

      console.log('Raw API response:', result);
      console.log('Total nodes:', result.tree.length);
      console.log('Node types:', result.tree.reduce((acc: any, node) => {
        acc[node.type] = (acc[node.type] || 0) + 1;
        return acc;
      }, {}));

      // Find all Dockerfiles
      const dockerfiles = new Set<string>();
      result.tree.forEach((node) => {
        if (
          node.type === "blob" &&
          (node.name.toLowerCase() === "dockerfile" ||
            node.name.toLowerCase().startsWith("dockerfile."))
        ) {
          dockerfiles.add(node.path);
        }
      });
      setDockerfilePaths(dockerfiles);

      // Build hierarchical tree structure
      const tree = buildTreeStructure(result.tree);
      console.log('Total nodes from API:', result.tree.length);
      console.log('Built tree structure:', tree);
      console.log('Sample tree paths:', result.tree.slice(0, 10).map(n => `${n.type}: ${n.path}`));
      setTreeData(tree);
    } catch (error: any) {
      toast({
        title: "Failed to load repository tree",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingTree(false);
    }
  };

  const buildTreeStructure = (flatNodes: GitLabTreeNode[]): TreeNodeWithChildren[] => {
    const nodeMap = new Map<string, TreeNodeWithChildren>();
    const rootNodes: TreeNodeWithChildren[] = [];

    // First pass: create ALL nodes (both files and directories)
    flatNodes.forEach((node) => {
      // Only add if not already exists
      if (!nodeMap.has(node.path)) {
        nodeMap.set(node.path, { ...node, children: [] });
      }
    });

    // Second pass: create intermediate directory nodes for any missing parent paths
    flatNodes.forEach((node) => {
      const pathParts = node.path.split("/");

      // Create all intermediate directory nodes
      for (let i = 1; i < pathParts.length; i++) {
        const intermediatePath = pathParts.slice(0, i).join("/");
        if (!nodeMap.has(intermediatePath)) {
          nodeMap.set(intermediatePath, {
            id: intermediatePath,
            name: pathParts[i - 1],
            type: "tree",
            path: intermediatePath,
            mode: "040000",
            children: [],
          });
        }
      }
    });

    // Third pass: build hierarchy by linking children to parents
    const allNodes = Array.from(nodeMap.values());

    allNodes.forEach((currentNode) => {
      const pathParts = currentNode.path.split("/");

      if (pathParts.length === 1) {
        // Root level item
        rootNodes.push(currentNode);
      } else {
        // Find and link to parent
        const parentPath = pathParts.slice(0, -1).join("/");
        const parentNode = nodeMap.get(parentPath);

        if (parentNode) {
          // Make sure we don't add duplicates
          if (!parentNode.children) {
            parentNode.children = [];
          }
          const existingChild = parentNode.children.find(c => c.path === currentNode.path);
          if (!existingChild) {
            parentNode.children.push(currentNode);
          }
        }
      }
    });

    // Sort: folders first, then files; alphabetically within each group
    const sortNodes = (nodes: TreeNodeWithChildren[]) => {
      nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "tree" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      nodes.forEach((node) => {
        if (node.children && node.children.length > 0) {
          sortNodes(node.children);
        }
      });
    };

    sortNodes(rootNodes);
    return rootNodes;
  };

  const toggleFolder = async (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      // Collapse folder
      newExpanded.delete(path);
      setExpandedFolders(newExpanded);
    } else {
      // Expand folder - check if we need to load children
      newExpanded.add(path);
      setExpandedFolders(newExpanded);

      // If this folder doesn't have children loaded yet, load them
      const findNode = (nodes: TreeNodeWithChildren[], targetPath: string): TreeNodeWithChildren | null => {
        for (const node of nodes) {
          if (node.path === targetPath) return node;
          if (node.children) {
            const found = findNode(node.children, targetPath);
            if (found) return found;
          }
        }
        return null;
      };

      const folderNode = findNode(treeData, path);
      if (folderNode && (!folderNode.children || folderNode.children.length === 0) && !folderNode.isLoading) {
        // Load children for this folder
        await loadFolderContents(path, folderNode);
      }
    }
  };

  const loadFolderContents = async (path: string, folderNode: TreeNodeWithChildren) => {
    if (!selectedProject) return;

    // Mark as loading
    folderNode.isLoading = true;
    setTreeData([...treeData]); // Trigger re-render

    try {
      const result = await gitlabApi.getTree(selectedProject.id, {
        url: gitlabUrl,
        path: path,
        ref: selectedProject.default_branch,
        recursive: false, // Only get immediate children
      });

      console.log(`Loaded children for ${path}:`, result.tree);

      // Add children to the folder node
      const children: TreeNodeWithChildren[] = result.tree.map(node => ({
        ...node,
        children: node.type === "tree" ? [] : undefined,
      }));

      // Sort children
      children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "tree" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      folderNode.children = children;
      folderNode.isLoading = false;

      // Check for Dockerfiles in the new children
      const newDockerfiles = new Set(dockerfilePaths);
      children.forEach((child) => {
        if (
          child.type === "blob" &&
          (child.name.toLowerCase() === "dockerfile" ||
            child.name.toLowerCase().startsWith("dockerfile."))
        ) {
          newDockerfiles.add(child.path);
        }
      });
      setDockerfilePaths(newDockerfiles);

      setTreeData([...treeData]); // Trigger re-render
    } catch (error: any) {
      folderNode.isLoading = false;
      toast({
        title: "Failed to load folder contents",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleFileClick = async (node: TreeNodeWithChildren) => {
    if (node.type === "tree") {
      toggleFolder(node.path);
    } else {
      await loadFileContent(node.path);
    }
  };

  const extractImagesFromDockerfile = (content: string) => {
    const images: Array<{ image: string; usage: string; stage?: string }> = [];
    const lines = content.split('\n');

    let currentStage: string | undefined;
    let isMultiStage = false;

    // Check if it's a multi-stage build
    const stagePattern = /^FROM\s+.*\s+AS\s+(\S+)/i;
    for (const line of lines) {
      if (stagePattern.test(line)) {
        isMultiStage = true;
        break;
      }
    }

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip comments and empty lines
      if (trimmedLine.startsWith('#') || !trimmedLine) continue;

      // Match FROM instructions
      const fromMatch = trimmedLine.match(/^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i);
      if (fromMatch) {
        const imageName = fromMatch[1];
        const stageName = fromMatch[2];

        // Skip if it's referencing a previous stage
        if (images.some(img => img.stage === imageName)) {
          currentStage = stageName;
          continue;
        }

        let usage = 'base';
        if (isMultiStage) {
          if (stageName) {
            usage = 'builder';
            currentStage = stageName;
          } else {
            usage = 'final';
          }
        }

        images.push({
          image: imageName,
          usage,
          stage: stageName,
        });
      }

      // Match COPY --from instructions
      const copyFromMatch = trimmedLine.match(/^COPY\s+--from=(\S+)/i);
      if (copyFromMatch) {
        const fromStage = copyFromMatch[1];
        // If it's not a stage name, it might be an external image
        if (!images.some(img => img.stage === fromStage) && !fromStage.match(/^\d+$/)) {
          images.push({
            image: fromStage,
            usage: 'external-copy',
          });
        }
      }
    }

    return images;
  };

  const loadFileContent = async (filePath: string) => {
    if (!selectedProject) return;

    setIsLoadingFile(true);
    setSelectedFile(filePath);
    setFileContent(null);
    setExtractedImages([]);

    try {
      const result = await gitlabApi.getFile(selectedProject.id, filePath, {
        url: gitlabUrl,
        ref: selectedProject.default_branch,
      });
      const decoded = gitlabApi.decodeFileContent(result.content);
      setFileContent(decoded);

      // Extract images if it's a Dockerfile
      if (dockerfilePaths.has(filePath)) {
        const images = extractImagesFromDockerfile(decoded);
        setExtractedImages(images);

        // Load existing scan results for these images
        await loadExistingScanResults(images.map(img => img.image));
      }
    } catch (error: any) {
      toast({
        title: "Failed to load file",
        description: error.message,
        variant: "destructive",
      });
      setFileContent("Failed to load file content");
    } finally {
      setIsLoadingFile(false);
    }
  };

  const loadExistingScanResults = async (imageNames: string[]) => {
    // Query backend for existing scan results for each image
    const results = new Map(scanResults);

    for (const imageName of imageNames) {
      try {
        // Check if we have a cached scan result - use v1 dashboard API
        const response = await fetch(
          `http://localhost:8080/api/v1/dashboard/image/vulnerabilities?image=${encodeURIComponent(imageName)}`,
          { method: 'GET' }
        );

        if (response.ok) {
          const data = await response.json();
          // Extract the latest tag's vulnerability data
          if (data.tags && data.tags.length > 0) {
            const latestTag = data.tags[0]; // Get the first tag (most recent)

            // Transform to match the scan result format expected by the UI
            const scanResult = {
              image_name: imageName,
              summary: {
                total: latestTag.vulnerabilities.total,
                critical: latestTag.vulnerabilities.critical,
                high: latestTag.vulnerabilities.high,
                medium: latestTag.vulnerabilities.medium,
                low: latestTag.vulnerabilities.low,
                informational: latestTag.vulnerabilities.informational,
              },
              scan_time: latestTag.last_scan,
              cache_hit: latestTag.cache_hit,
            };

            results.set(imageName, scanResult);
          }
        }
      } catch (error) {
        // Silently fail - image might not have been scanned yet
        console.debug(`No existing scan result for ${imageName}`);
      }
    }

    setScanResults(results);
  };

  const scanImage = async (imageName: string) => {
    setScanningImages(prev => new Set(prev).add(imageName));

    try {
      const startResponse = await fetch("http://localhost:8080/api/v2/security/image/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_name: imageName, force_rescan: false }),
      });

      if (startResponse.status !== 202) {
        const errorData = await startResponse.json();
        throw new Error(errorData.error || "Failed to start scan");
      }

      const { job_id } = await startResponse.json();

      // Poll for results
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(
            `http://localhost:8080/api/v2/security/image/status/${job_id}`
          );

          if (statusResponse.status !== 200) return;

          const jobStatus = await statusResponse.json();

          if (jobStatus.status === "completed" && jobStatus.result) {
            clearInterval(pollInterval);
            setScanResults(prev => new Map(prev).set(imageName, jobStatus.result));
            setScanningImages(prev => {
              const newSet = new Set(prev);
              newSet.delete(imageName);
              return newSet;
            });
            toast({
              title: "Scan Complete",
              description: `${imageName} scanned successfully`,
            });
          } else if (jobStatus.status === "failed") {
            clearInterval(pollInterval);
            setScanningImages(prev => {
              const newSet = new Set(prev);
              newSet.delete(imageName);
              return newSet;
            });
            toast({
              title: "Scan Failed",
              description: jobStatus.error || "Unknown error",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error("Error polling scan status:", error);
        }
      }, 2000);

      // Timeout after 10 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setScanningImages(prev => {
          const newSet = new Set(prev);
          newSet.delete(imageName);
          return newSet;
        });
      }, 600000);
    } catch (error: any) {
      setScanningImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(imageName);
        return newSet;
      });
      toast({
        title: "Failed to start scan",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const renderTreeNode = (node: TreeNodeWithChildren, level: number = 0): JSX.Element => {
    const isExpanded = expandedFolders.has(node.path);
    const isDockerfile = dockerfilePaths.has(node.path);
    const isSelected = selectedFile === node.path;
    const hasChildren = node.children && node.children.length > 0;
    const isLoading = node.isLoading;

    return (
      <div key={node.path}>
        <button
          onClick={() => handleFileClick(node)}
          className={`w-full text-left px-2 py-1.5 rounded hover:bg-ui-01 transition-colors flex items-center gap-2 ${
            isSelected ? "bg-ui-03" : ""
          } ${isDockerfile ? "bg-blue-500/10" : ""}`}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
        >
          {node.type === "tree" ? (
            <>
              {isLoading ? (
                <Loader2 className="h-4 w-4 text-text-03 flex-shrink-0 animate-spin" />
              ) : hasChildren || !isExpanded ? (
                isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-text-03 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-text-03 flex-shrink-0" />
                )
              ) : (
                <ChevronRight className="h-4 w-4 text-text-03 flex-shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="h-4 w-4 text-text-02 flex-shrink-0" />
              ) : (
                <Folder className="h-4 w-4 text-text-02 flex-shrink-0" />
              )}
            </>
          ) : (
            <>
              <div className="w-4 flex-shrink-0" />
              {isDockerfile ? (
                <FileCode className="h-4 w-4 text-blue-500 flex-shrink-0" />
              ) : (
                <File className="h-4 w-4 text-text-02 flex-shrink-0" />
              )}
            </>
          )}
          <span
            className={`carbon-type-body-01 ${isDockerfile ? "text-blue-500 font-medium" : "text-text-01"} truncate`}
          >
            {node.name}
          </span>
          {isDockerfile && (
            <Badge variant="default" className="ml-auto text-xs bg-blue-500">
              Dockerfile
            </Badge>
          )}
        </button>
        {node.type === "tree" && isExpanded && hasChildren && !isLoading && (
          <div>
            {node.children!.map((child) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const filteredProjects = projects.filter((project) =>
    project.name_with_namespace.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="col-span-full space-y-6">
        <div>
          <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2">
            GitLab Integration
          </h1>
          <p className="carbon-type-body-02 text-text-02">
            Browse repositories and scan Dockerfiles from your GitLab instance
          </p>
        </div>

        {/* GitLab URL */}
        <Card>
          <CardHeader>
            <CardTitle>GitLab Instance</CardTitle>
            <CardDescription>
              Configure before use in Settings page
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                type="text"
                value={gitlabUrl}
                onChange={(e) => setGitlabUrl(e.target.value)}
                placeholder="gitlab.com or git.example.com"
                className="flex-1"
              />
              <Button onClick={loadProjects} disabled={isLoadingProjects}>
                {isLoadingProjects ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Projects List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Repositories</CardTitle>
              <CardDescription>
                {projects.length} projects found
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-03" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="pl-9"
                />
              </div>

              {/* Projects List */}
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {isLoadingProjects ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-text-03" />
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="text-center py-8 text-text-03">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                    <p className="carbon-type-body-02">No projects found</p>
                  </div>
                ) : (
                  filteredProjects.map((project) => {
                    const hasDockerfile = projectsWithDockerfiles.has(project.id);
                    return (
                      <button
                        key={project.id}
                        onClick={() => handleProjectSelect(project)}
                        className={`w-full text-left p-3 rounded border transition-colors ${
                          selectedProject?.id === project.id
                            ? "bg-ui-03 border-interactive-01"
                            : hasDockerfile
                            ? "bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10"
                            : "bg-layer-01 border-ui-04 hover:bg-ui-01"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {hasDockerfile ? (
                            <FileCode className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
                          ) : (
                            <GitBranch className="h-4 w-4 mt-0.5 flex-shrink-0 text-text-02" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="carbon-type-body-01 font-medium text-text-01 truncate">
                                {project.name}
                              </div>
                              {hasDockerfile && (
                                <Badge variant="default" className="text-xs bg-blue-500 flex-shrink-0">
                                  Dockerfile
                                </Badge>
                              )}
                            </div>
                            <div className="carbon-type-label-01 text-text-03 truncate">
                              {project.path_with_namespace}
                            </div>
                            {project.description && (
                              <div className="carbon-type-label-01 text-text-03 mt-1 line-clamp-2">
                                {project.description}
                              </div>
                            )}
                            <div className="flex gap-2 mt-2">
                              <Badge variant="secondary" className="text-xs">
                                {project.visibility}
                              </Badge>
                              {project.default_branch && (
                                <Badge variant="outline" className="text-xs">
                                  {project.default_branch}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-ui-03">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1 || isLoadingProjects}
                  >
                    Previous
                  </Button>
                  <span className="carbon-type-label-01 text-text-02">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages || isLoadingProjects}
                  >
                    Next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Repository Browser & File Viewer */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle>
                      {selectedProject ? selectedProject.name_with_namespace : "Select a repository"}
                    </CardTitle>
                    {selectedProject && (
                      <CardDescription className="mt-2">
                        <a
                          href={selectedProject.web_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-interactive-01 hover:underline"
                        >
                          View on GitLab
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </CardDescription>
                    )}
                  </div>
                  {selectedProject && dockerfilePaths.size > 0 && (
                    <Badge variant="default" className="bg-blue-500">
                      {dockerfilePaths.size} Dockerfile{dockerfilePaths.size > 1 ? "s" : ""} found
                    </Badge>
                  )}
                </div>

                {/* Security Fix Toolbar - Repository Level */}
                {selectedProject && dockerfilePaths.size > 0 && (
                  <SecurityFixToolbar
                    projectId={selectedProject.id}
                    filePath={Array.from(dockerfilePaths)[0]} // Use first Dockerfile found
                    gitlabUrl={gitlabUrl}
                    defaultBranch={selectedProject.default_branch}
                    fileContent={selectedFile && dockerfilePaths.has(selectedFile) ? fileContent : undefined}
                    allDockerfiles={Array.from(dockerfilePaths)}
                  />
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!selectedProject ? (
                <div className="text-center py-12 text-text-03">
                  <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="carbon-type-body-02">
                    Select a repository to browse files and find Dockerfiles
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* File Tree */}
                  <div className="border border-ui-04 rounded">
                    <div className="bg-layer-01 border-b border-ui-04 px-4 py-2">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-text-02" />
                        <span className="carbon-type-body-01 font-medium text-text-01">
                          File Tree
                        </span>
                      </div>
                    </div>
                    <div className="p-2 max-h-[600px] overflow-y-auto">
                      {isLoadingTree ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin text-text-03" />
                        </div>
                      ) : treeData.length === 0 ? (
                        <div className="text-center py-8 text-text-03">
                          <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="carbon-type-body-02">Empty repository</p>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          {treeData.map((node) => renderTreeNode(node, 0))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* File Content Viewer */}
                  <div className="space-y-4">
                    {/* Extracted Images Section */}
                    {extractedImages.length > 0 && (
                      <div className="border border-ui-04 rounded">
                        <div className="bg-layer-01 border-b border-ui-04 px-4 py-2">
                          <div className="flex items-center gap-2">
                            <Container className="h-4 w-4 text-text-02" />
                            <span className="carbon-type-body-01 font-medium text-text-01">
                              Docker Images ({extractedImages.length})
                            </span>
                          </div>
                        </div>
                        <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto">
                          {extractedImages.map((img, idx) => {
                            const isScanning = scanningImages.has(img.image);
                            const scanResult = scanResults.get(img.image);

                            const getCategoryColor = (usage: string) => {
                              switch (usage) {
                                case 'base':
                                  return 'text-violet-600 bg-violet-50 border-violet-200';
                                case 'builder':
                                  return 'text-blue-600 bg-blue-50 border-blue-200';
                                case 'final':
                                  return 'text-green-600 bg-green-50 border-green-200';
                                case 'external-copy':
                                  return 'text-orange-600 bg-orange-50 border-orange-200';
                                default:
                                  return 'text-gray-600 bg-gray-50 border-gray-200';
                              }
                            };

                            const getCategoryLabel = (usage: string) => {
                              switch (usage) {
                                case 'base':
                                  return 'Base Image';
                                case 'builder':
                                  return 'Builder Stage';
                                case 'final':
                                  return 'Final Image';
                                case 'external-copy':
                                  return 'External Copy';
                                default:
                                  return usage;
                              }
                            };

                            return (
                              <div key={idx} className="border border-ui-04 rounded-lg p-3 bg-layer-01 hover:bg-ui-01 transition-colors">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Container className="h-4 w-4 text-violet-600 flex-shrink-0" />
                                      <span className="font-mono text-sm font-medium text-text-01 truncate">
                                        {img.image}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="text-xs text-text-03">Category:</span>
                                      <Badge
                                        variant="outline"
                                        className={`text-xs font-medium ${getCategoryColor(img.usage)}`}
                                      >
                                        {getCategoryLabel(img.usage)}
                                      </Badge>
                                      {img.stage && (
                                        <>
                                          <span className="text-xs text-text-03">Stage:</span>
                                          <Badge variant="outline" className="text-xs font-mono">
                                            {img.stage}
                                          </Badge>
                                        </>
                                      )}
                                    </div>
                                    {scanResult && (
                                      <div className="flex items-center gap-2 mt-2">
                                        <Badge className="bg-red-600 text-white text-xs">
                                          Critical: {scanResult.summary.critical}
                                        </Badge>
                                        <Badge className="bg-orange-500 text-white text-xs">
                                          High: {scanResult.summary.high}
                                        </Badge>
                                        <Badge className="bg-yellow-500 text-white text-xs">
                                          Medium: {scanResult.summary.medium}
                                        </Badge>
                                        <Badge className="bg-blue-500 text-white text-xs">
                                          Low: {scanResult.summary.low}
                                        </Badge>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {scanResult ? (
                                      <div className="flex items-center gap-1 text-green-600">
                                        <CheckCircle className="h-4 w-4" />
                                        <span className="text-xs font-medium">Scanned</span>
                                      </div>
                                    ) : isScanning ? (
                                      <div className="flex items-center gap-1 text-violet-600">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span className="text-xs font-medium">Scanning...</span>
                                      </div>
                                    ) : (
                                      <Button
                                        size="sm"
                                        onClick={() => scanImage(img.image)}
                                        className="bg-violet-600 hover:bg-violet-700 text-white"
                                      >
                                        <Shield className="h-3 w-3 mr-1" />
                                        Scan
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* File Content */}
                    <div className="border border-ui-04 rounded">
                      <div className="bg-layer-01 border-b border-ui-04 px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Code className="h-4 w-4 text-text-02" />
                          <span className="carbon-type-body-01 font-mono text-text-01 truncate">
                            {selectedFile || "No file selected"}
                          </span>
                        </div>
                      </div>
                      <div className="p-4 bg-field-01 max-h-[600px] overflow-auto">
                        {!selectedFile ? (
                          <div className="text-center py-12 text-text-03">
                            <File className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="carbon-type-body-02">
                              Select a file to view its content
                            </p>
                          </div>
                        ) : isLoadingFile ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-text-03" />
                          </div>
                        ) : (
                          <pre className="carbon-type-code-01 text-text-01 text-xs">
                            <code>{fileContent}</code>
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
