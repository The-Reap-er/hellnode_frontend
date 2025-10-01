import { useState, useRef, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import Editor, { Monaco } from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Search, AlertCircle, CheckCircle, Loader2, Wand2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

declare global {
  interface Window {
    monaco: any; // Monaco editor instance
  }
}
import { DockerfileScanResult, ScanError } from "@shared/types";

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

const severityColors: Record<Severity, string> = {
  CRITICAL: 'bg-support-01',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-yellow-500',
  LOW: 'bg-sky-400',
  UNKNOWN: 'bg-gray-500',
};

interface FixResult {
  original_dockerfile: string;
  fixed_dockerfile: string;
  security_changes: Array<{
    line_number: number;
    original_line: string;
    fixed_line: string;
    reason: string;
    severity: string;
    category: string;
  }>;
  summary: {
    total_changes: number;
    critical_fixes: number;
    high_severity_fixes: number;
    medium_severity_fixes: number;
    low_severity_fixes: number;
    categories: Record<string, number>;
  };
}

export default function DockerfileScanner() {
  const [dockerfileContent, setDockerfileContent] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [scanResult, setScanResult] = useState<DockerfileScanResult | null>(null);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [showFixDialog, setShowFixDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
  };

  const handleEditorChange = (value: string | undefined) => {
    const newContent = value || "";
    setDockerfileContent(newContent);
    
    // Clear previous results and decorations when content changes or is empty
    if (scanResult || !newContent.trim()) {
      setScanResult(null);
      setError(null);
      
      // Clear decorations if editor exists
      if (editorRef.current) {
        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
      }
    }
  };

  const highlightVulnerabilities = useCallback((result: DockerfileScanResult) => {
    try {
      if (!editorRef.current || !result?.Results) return;
      
      const editor = editorRef.current;
      const monaco = window.monaco;
      if (!monaco) return;
      
      // Clear previous decorations
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
      
      const newDecorations: any[] = [];
      
      for (const resultItem of result.Results) {
        if (!resultItem?.Misconfigurations?.length) continue;
        
        for (const misconfig of resultItem.Misconfigurations) {
          try {
            if (!misconfig?.CauseMetadata?.StartLine || !misconfig?.CauseMetadata?.EndLine) continue;
            
            const startLine = Math.max(1, misconfig.CauseMetadata.StartLine);
            const endLine = Math.max(startLine, misconfig.CauseMetadata.EndLine);
            const severity = (misconfig.Severity || 'UNKNOWN') as Severity;
            const color = severityColors[severity] || severityColors.UNKNOWN;
            
            newDecorations.push({
              range: new monaco.Range(startLine, 1, endLine, 1000),
              options: {
                isWholeLine: true,
                className: `opacity-20 hover:opacity-30 transition-opacity duration-200 ${color}`,
                marginClassName: 'opacity-20',
                hoverMessage: {
                  value: `**${misconfig.Title || 'No title'}**\n\n${misconfig.Description || 'No description'}\n\n**Severity:** ${severity}\n**Resolution:** ${misconfig.Resolution || 'No resolution provided'}`,
                  isTrusted: true,
                },
                overviewRuler: {
                  color: color,
                  position: monaco.editor.OverviewRulerLane.Right,
                },
                glyphMarginClassName: `${color} opacity-20`
              },
            });
          } catch (err) {
            console.error('Error processing misconfiguration:', err);
            continue;
          }
        }
      }
      
      if (newDecorations.length > 0) {
        decorationsRef.current = editor.deltaDecorations([], newDecorations);
      }
    } catch (err) {
      console.error('Error highlighting vulnerabilities:', err);
      // Clear any partial decorations on error
      if (editorRef.current) {
        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
      }
    }
  }, []);

  const handleScan = async () => {
    try {
      const content = dockerfileContent.trim();
      if (!content) {
        setError('Dockerfile content cannot be empty');
        return;
      }
      
      setIsScanning(true);
      setError(null);
      
      try {
        const formData = new FormData();
        const blob = new Blob([content], { type: 'text/plain' });
        formData.append('dockerfile', blob, 'Dockerfile');
        
        const response = await fetch('http://localhost:8080/api/v1/scan/dockerfile', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          let errorMessage = `Server error: ${response.status} ${response.statusText}`;
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch (e) {
            console.error('Failed to parse error response:', e);
          }
          throw new Error(errorMessage);
        }
        
        const result = await response.json() as DockerfileScanResult;
        
        // Validate the response structure
        if (!result || typeof result !== 'object' || !Array.isArray(result.Results)) {
          throw new Error('Invalid response format from server');
        }
        
        // Ensure each result has a Misconfigurations array
        const validatedResults = result.Results.map(r => ({
          ...r,
          Misconfigurations: Array.isArray(r.Misconfigurations) 
            ? r.Misconfigurations
            : []
        }));
        
        const validatedResult = {
          ...result,
          Results: validatedResults
        };
        
        setScanResult(validatedResult);
        highlightVulnerabilities(validatedResult);
        
      } catch (err) {
        console.error('Error during Dockerfile scan:', err);
        // Clear any partial results on error
        setScanResult(null);
        if (editorRef.current) {
          decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
        }
        
        // Provide user-friendly error message
        const errorMessage = err instanceof Error 
          ? err.message 
          : 'An unknown error occurred while scanning the Dockerfile';
        setError(errorMessage);
      }
      
    } catch (err) {
      console.error('Unexpected error in handleScan:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsScanning(false);
    }
  };

  const getSeverityCount = (severity: Severity): number => {
    if (!scanResult?.Results?.length) return 0;
    return scanResult.Results.reduce((count, result) => {
      return count + (result.Misconfigurations || []).filter(m => m?.Severity === severity).length;
    }, 0);
  };

  const handleFixDockerfile = async () => {
    try {
      const content = dockerfileContent.trim();
      if (!content) {
        setError('Dockerfile content cannot be empty');
        return;
      }
      
      setIsFixing(true);
      setError(null);
      
      const formData = new FormData();
      const blob = new Blob([content], { type: 'text/plain' });
      formData.append('dockerfile', blob, 'Dockerfile');
      formData.append('options', JSON.stringify({
        preserve_comments: true,
        minimal_changes: false,
        explain_changes: true
      }));
      
      const response = await fetch('http://localhost:8080/api/v2/security/dockerfile/fix', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      setFixResult(result);
      setShowFixDialog(true);
      
    } catch (err) {
      console.error('Error fixing Dockerfile:', err);
      setError(err instanceof Error ? err.message : 'Failed to fix Dockerfile');
    } finally {
      setIsFixing(false);
    }
  };
  
  const applyFixes = () => {
    if (!fixResult) return;
    setDockerfileContent(fixResult.fixed_dockerfile);
    setShowFixDialog(false);
  };

  return (
    <DashboardLayout>
      <div className="col-span-full">
        <div className="mb-8">
          <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2">
                  Dockerfile Scanner
                </h1>
                <p className="carbon-type-body-02 text-text-02">
                  Paste your Dockerfile content below to scan for vulnerabilities.
                </p>
              </div>
              <div className="flex space-x-2">
                <Button 
                  onClick={handleScan} 
                  disabled={!dockerfileContent.trim() || isScanning}
                  variant="outline"
                  className="min-w-[150px]"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Scan Dockerfile
                    </>
                  )}
                </Button>
                <Button 
                  onClick={handleFixDockerfile}
                  disabled={!dockerfileContent.trim() || isFixing}
                  className="min-w-[180px] bg-purple-600 hover:bg-purple-700"
                >
                  {isFixing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Fixing...
                    </>
                  ) : (
                    <>
                      <Wand2 className="mr-2 h-4 w-4" />
                      Fix Security Issues
                    </>
                  )}
                </Button>
              </div>
            </div>

            {error && (
              <div className="flex items-center p-4 bg-support-01/10 border border-support-01 rounded">
                <AlertCircle className="h-5 w-5 text-support-01 mr-2" />
                <span className="text-text-01">{error}</span>
              </div>
            )}

            {scanResult && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                <div className="bg-layer-01 p-4 rounded border border-ui-03">
                  <div className="text-text-02 text-sm">Total Issues</div>
                  <div className="text-2xl font-bold">
                    {scanResult.Results.reduce((sum, r) => sum + r.MisconfSummary.Failures, 0)}
                  </div>
                </div>
                {Object.entries(severityColors).map(([severity, color]) => (
                  <div key={severity} className="bg-layer-01 p-4 rounded border border-ui-03">
                    <div className="flex items-center justify-between">
                      <span className="text-text-02 text-sm capitalize">{severity.toLowerCase()}</span>
                      <div className={`h-3 w-3 rounded-full ${color}`} />
                    </div>
                    <div className="text-2xl font-bold">
                      {getSeverityCount(severity as Severity)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-layer-01 border border-ui-03 rounded p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="carbon-type-productive-heading-02 text-text-01">
              Dockerfile Content
            </h3>
            {scanResult && (
              <div className="flex items-center text-sm text-text-02">
                <CheckCircle className="h-4 w-4 text-support-02 mr-1" />
                <span>Scanned at {new Date(scanResult.CreatedAt).toLocaleString()}</span>
              </div>
            )}
          </div>
          
          <div className="w-full h-[600px] bg-field-01 border border-ui-04 rounded overflow-hidden">
            <Editor
              height="100%"
              defaultLanguage="dockerfile"
              value={dockerfileContent}
              onChange={handleEditorChange}
              onMount={handleEditorDidMount}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 14,
                wordWrap: 'on',
                lineNumbers: 'on',
                renderLineHighlight: 'all',
                readOnly: false,
                automaticLayout: true,
              }}
            />
          </div>
        </div>

        {scanResult && (
          <div className="mt-8">
            <h3 className="carbon-type-productive-heading-02 text-text-01 mb-4">
              Scan Results
            </h3>
            <div className="space-y-4">
              {scanResult.Results.flatMap(result => 
                result.Misconfigurations.map((misconfig, idx) => (
                  <div 
                    key={`${misconfig.ID}-${idx}`}
                    className="bg-layer-01 p-4 rounded border border-ui-03"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center">
                          <div 
                            className={`h-3 w-3 rounded-full mr-2 ${severityColors[misconfig.Severity] || severityColors.UNKNOWN}`} 
                          />
                          <h4 className="font-medium">
                            {misconfig.Title} ({misconfig.ID})
                          </h4>
                        </div>
                        <p className="text-text-02 mt-1">{misconfig.Description}</p>
                        {misconfig.CauseMetadata?.Code?.Lines?.some(l => l.IsCause) && (
                          <div className="mt-2 p-2 bg-ui-02 rounded text-sm font-mono">
                            {misconfig.CauseMetadata.Code.Lines
                              .filter(l => l.IsCause)
                              .map((line, i) => (
                                <div key={i} className="text-text-02">
                                  <span className="text-text-03 mr-2">{line.Number}</span>
                                  {line.Content}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                      <a 
                        href={misconfig.PrimaryURL} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-interactive-01 hover:underline text-sm whitespace-nowrap ml-4"
                      >
                        Learn more →
                      </a>
                    </div>
                    <div className="mt-3 pt-3 border-t border-ui-03 text-sm">
                      <div className="text-text-02">
                        <strong>Severity:</strong> {misconfig.Severity} • 
                        <strong>Resolution:</strong> {misconfig.Resolution}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={showFixDialog} onOpenChange={setShowFixDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Dockerfile Security Fixes</DialogTitle>
            <DialogDescription>
              Review the suggested security fixes for your Dockerfile
            </DialogDescription>
          </DialogHeader>
          
          {fixResult && (
            <div className="flex-1 overflow-auto">
              <div className="mb-4 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Summary</h4>
                  <div className="space-y-1 text-sm">
                    <div>Total Changes: {fixResult.summary.total_changes}</div>
                    <div className="text-red-500">Critical: {fixResult.summary.critical_fixes}</div>
                    <div className="text-orange-500">High: {fixResult.summary.high_severity_fixes}</div>
                    <div className="text-yellow-500">Medium: {fixResult.summary.medium_severity_fixes}</div>
                    <div className="text-blue-500">Low: {fixResult.summary.low_severity_fixes}</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Fixed Categories</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(fixResult.summary.categories).map(([category, count]) => (
                      <span key={category} className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                        {category}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <Tabs defaultValue="diff" className="flex-1 flex flex-col">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="diff">Diff View</TabsTrigger>
                  <TabsTrigger value="fixed">Fixed Dockerfile</TabsTrigger>
                </TabsList>
                
                <div className="mt-4 border rounded-md overflow-hidden flex-1">
                  <TabsContent value="diff" className="m-0 h-full">
                    <div className="p-4 bg-black-50 dark:bg-black-900 h-[300px] overflow-auto">
                      <pre className="text-sm whitespace-pre-wrap break-words">
                        {fixResult.security_changes.map((change, i) => (
                          <div key={i} className="mb-4">
                            <div className="font-medium mb-1">
                              Line {change.line_number}: {change.reason}
                              <span className={`ml-2 px-2 py-0.5 text-xs rounded-none ${
                                change.severity === 'critical' ? 'bg-red-100 text-red-800' :
                                change.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                                change.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {change.severity.toUpperCase()}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded">
                                <div className="text-xs text-red-500 mb-1">Original:</div>
                                <code className="whitespace-pre-wrap break-words">{change.original_line}</code>
                              </div>
                              <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded">
                                <div className="text-xs text-green-600 dark:text-green-400 mb-1">Fixed:</div>
                                <code className="whitespace-pre-wrap break-words">{change.fixed_line}</code>
                              </div>
                            </div>
                          </div>
                        ))}
                      </pre>
                    </div>
                  </TabsContent>
                  <TabsContent value="fixed" className="m-0 h-full">
                    <div className="p-4 bg-black-50 dark:bg-black-900 h-[300px] overflow-auto">
                      <pre className="text-sm whitespace-pre-wrap">{fixResult.fixed_dockerfile}</pre>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          )}
          
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowFixDialog(false)}>
              Cancel
            </Button>
            <Button onClick={applyFixes}>
              Apply Fixes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
