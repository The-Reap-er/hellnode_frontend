import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { diveApi } from '@/services/diveApi';
import { DiveAnalysisResult, DiveLayer, FileChange, DiveCompareResponse } from '@/types/dive';
import { Layers, Search, AlertCircle, TrendingDown, File, RefreshCw, ChevronRight, ChevronDown, Plus, Minus, Edit3, Trash2, GitCompare, X, ArrowRight } from 'lucide-react';

export default function LayerAnalysis() {
  const [imageName, setImageName] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<DiveAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<DiveAnalysisResult[]>([]);
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set());
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareImage1, setCompareImage1] = useState('');
  const [compareImage2, setCompareImage2] = useState('');
  const [compareResult, setCompareResult] = useState<DiveCompareResponse | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  useEffect(() => {
    loadRecentAnalyses();
  }, []);

  const loadRecentAnalyses = async () => {
    try {
      const response = await diveApi.listAnalyses({ limit: 10, offset: 0 });
      setRecentAnalyses(response.analyses);
    } catch (err) {
      console.error('Failed to load recent analyses:', err);
    }
  };

  const handleAnalyze = async () => {
    if (!imageName.trim()) {
      setError('Please enter an image name');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);
    setExpandedLayers(new Set());

    try {
      const analyzeResponse = await diveApi.analyzeImage({
        image_name: imageName,
        force_rescan: false,
      });

      const jobId = analyzeResponse.job_id;
      let jobStatus = await diveApi.getJobStatus(jobId);

      while (jobStatus.status === 'pending' || jobStatus.status === 'processing') {
        await new Promise(resolve => setTimeout(resolve, 2000));
        jobStatus = await diveApi.getJobStatus(jobId);
      }

      if (jobStatus.status === 'completed' && jobStatus.result) {
        setAnalysis(jobStatus.result);
        loadRecentAnalyses();
      } else if (jobStatus.status === 'failed') {
        setError(jobStatus.error || 'Analysis failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to analyze image');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleLoadAnalysis = async (imageName: string) => {
    setIsAnalyzing(true);
    setError(null);
    setExpandedLayers(new Set());
    setCompareResult(null);
    try {
      const result = await diveApi.getAnalysisByImageName(imageName);
      setAnalysis(result);
      setImageName(imageName);
    } catch (err: any) {
      setError(err.message || 'Failed to load analysis');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeleteAnalysis = async (analysisId: string, imageName: string) => {
    if (!confirm(`Are you sure you want to delete analysis for ${imageName}?`)) {
      return;
    }

    try {
      await diveApi.deleteAnalysis(analysisId);
      if (analysis?.id === analysisId) {
        setAnalysis(null);
        setImageName('');
      }
      loadRecentAnalyses();
    } catch (err: any) {
      setError(err.message || 'Failed to delete analysis');
    }
  };

  const handleCompare = async () => {
    if (!compareImage1.trim() || !compareImage2.trim()) {
      setError('Please enter both image names to compare');
      return;
    }

    setIsComparing(true);
    setError(null);

    try {
      const result = await diveApi.compareImages(compareImage1, compareImage2);
      setCompareResult(result);
      setAnalysis(null);
    } catch (err: any) {
      setError(err.message || 'Failed to compare images');
    } finally {
      setIsComparing(false);
      setShowCompareModal(false);
    }
  };

  const toggleLayerExpansion = (index: number) => {
    const newExpanded = new Set(expandedLayers);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedLayers(newExpanded);
  };

  const getEfficiencyColor = (score: number) => {
    if (score >= 95) return 'text-green-500 bg-green-500/10';
    if (score >= 80) return 'text-blue-500 bg-blue-500/10';
    if (score >= 60) return 'text-yellow-500 bg-yellow-500/10';
    return 'text-red-500 bg-red-500/10';
  };

  return (
    <DashboardLayout>
      <div className="col-span-full">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2">
              Layer Analysis
            </h1>
            <p className="carbon-type-body-02 text-text-02">
              Analyze Docker image layers and optimize image efficiency
            </p>
          </div>
          <button
            onClick={() => setShowCompareModal(true)}
            className="px-4 py-2 bg-layer-01 hover:bg-layer-hover-01 border border-ui-03 rounded carbon-type-body-01 font-medium flex items-center gap-2 transition-colors"
          >
            <GitCompare className="h-4 w-4" />
            Compare Images
          </button>
        </div>

        {/* Compare Modal */}
        {showCompareModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-layer-01 border border-ui-03 rounded-lg p-6 max-w-2xl w-full mx-4">
              <div className="flex items-center justify-between mb-6">
                <h2 className="carbon-type-productive-heading-03 text-text-01">Compare Images</h2>
                <button
                  onClick={() => setShowCompareModal(false)}
                  className="p-2 hover:bg-layer-hover-01 rounded transition-colors"
                >
                  <X className="h-5 w-5 text-text-02" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="carbon-type-label-01 text-text-02 mb-2 block">
                    First Image
                  </label>
                  <input
                    type="text"
                    value={compareImage1}
                    onChange={(e) => setCompareImage1(e.target.value)}
                    placeholder="e.g., nginx:1.24-alpine"
                    className="w-full px-4 py-3 bg-field-01 border border-ui-04 rounded carbon-type-body-01 text-text-01 focus:outline-none focus:ring-2 focus:ring-interactive-01"
                  />
                </div>

                <div>
                  <label className="carbon-type-label-01 text-text-02 mb-2 block">
                    Second Image
                  </label>
                  <input
                    type="text"
                    value={compareImage2}
                    onChange={(e) => setCompareImage2(e.target.value)}
                    placeholder="e.g., nginx:alpine"
                    className="w-full px-4 py-3 bg-field-01 border border-ui-04 rounded carbon-type-body-01 text-text-01 focus:outline-none focus:ring-2 focus:ring-interactive-01"
                  />
                </div>

                <div className="flex gap-3 justify-end pt-4">
                  <button
                    onClick={() => setShowCompareModal(false)}
                    className="px-4 py-2 bg-layer-02 hover:bg-layer-hover-01 rounded carbon-type-body-01 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCompare}
                    disabled={isComparing}
                    className="px-4 py-2 bg-interactive-01 hover:bg-interactive-01-hover text-white rounded carbon-type-body-01 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isComparing ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Comparing...
                      </>
                    ) : (
                      <>
                        <GitCompare className="h-4 w-4" />
                        Compare
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analysis Input */}
        <div className="bg-layer-01 border border-ui-03 rounded p-6 mb-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-text-03" />
                <input
                  type="text"
                  value={imageName}
                  onChange={(e) => setImageName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                  placeholder="Enter image name (e.g., nginx:latest, redis:alpine)"
                  className="w-full pl-12 pr-4 py-3 bg-field-01 border border-ui-04 rounded carbon-type-body-01 text-text-01 focus:outline-none focus:ring-2 focus:ring-interactive-01"
                />
              </div>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="px-6 py-3 bg-interactive-01 hover:bg-interactive-01-hover text-white rounded carbon-type-body-01 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="h-5 w-5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Layers className="h-5 w-5" />
                  Analyze
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="carbon-type-body-01 text-red-500">{error}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Analysis Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Comparison Result */}
            {compareResult && (
              <div className="space-y-6">
                {/* Comparison Summary */}
                <div className="bg-layer-01 border border-ui-03 rounded p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="carbon-type-productive-heading-02 text-text-01 flex items-center gap-2">
                      <GitCompare className="h-5 w-5" />
                      Image Comparison
                    </h3>
                    <button
                      onClick={() => setCompareResult(null)}
                      className="p-2 hover:bg-layer-hover-01 rounded transition-colors"
                    >
                      <X className="h-4 w-4 text-text-02" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-layer-02 p-4 rounded">
                      <div className="carbon-type-label-01 text-text-02 mb-2">{compareResult.image_1}</div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="carbon-type-body-02 text-text-03">Size:</span>
                          <span className="carbon-type-body-01 text-text-01 font-mono">
                            {compareResult.image_1_analysis.efficiency.total_image_size_human}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="carbon-type-body-02 text-text-03">Efficiency:</span>
                          <span className={`carbon-type-body-01 font-mono ${getEfficiencyColor(compareResult.image_1_analysis.efficiency.score).split(' ')[0]}`}>
                            {compareResult.image_1_analysis.efficiency.score.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="carbon-type-body-02 text-text-03">Layers:</span>
                          <span className="carbon-type-body-01 text-text-01 font-mono">
                            {compareResult.image_1_analysis.layers.length}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-layer-02 p-4 rounded">
                      <div className="carbon-type-label-01 text-text-02 mb-2">{compareResult.image_2}</div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="carbon-type-body-02 text-text-03">Size:</span>
                          <span className="carbon-type-body-01 text-text-01 font-mono">
                            {compareResult.image_2_analysis.efficiency.total_image_size_human}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="carbon-type-body-02 text-text-03">Efficiency:</span>
                          <span className={`carbon-type-body-01 font-mono ${getEfficiencyColor(compareResult.image_2_analysis.efficiency.score).split(' ')[0]}`}>
                            {compareResult.image_2_analysis.efficiency.score.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="carbon-type-body-02 text-text-03">Layers:</span>
                          <span className="carbon-type-body-01 text-text-01 font-mono">
                            {compareResult.image_2_analysis.layers.length}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-ui-03 grid grid-cols-2 gap-4">
                    <div className="bg-field-01 p-3 rounded">
                      <div className="carbon-type-label-01 text-text-02 mb-1">Size Difference</div>
                      <div className={`carbon-type-body-01 font-mono ${compareResult.size_difference > 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {compareResult.size_difference > 0 ? '+' : ''}{(compareResult.size_difference / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                    <div className="bg-field-01 p-3 rounded">
                      <div className="carbon-type-label-01 text-text-02 mb-1">Efficiency Difference</div>
                      <div className={`carbon-type-body-01 font-mono ${compareResult.efficiency_diff > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {compareResult.efficiency_diff > 0 ? '+' : ''}{compareResult.efficiency_diff.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Layer Differences */}
                <div className="bg-layer-01 border border-ui-03 rounded p-6">
                  <h3 className="carbon-type-productive-heading-02 text-text-01 mb-4">
                    Layer Differences
                  </h3>
                  <div className="space-y-2">
                    {compareResult.layer_differences.map((diff, idx) => {
                      // Replace image1/image2 with actual image names
                      const description = diff.description
                        .replace(/image1/gi, compareResult.image_1)
                        .replace(/image2/gi, compareResult.image_2);

                      return (
                        <div key={idx} className="bg-layer-02 p-3 rounded flex items-start gap-3">
                          <div className="flex-shrink-0 mt-1">
                            {!diff.in_image_1 && diff.in_image_2 ? (
                              <Plus className="h-4 w-4 text-green-500" />
                            ) : diff.in_image_1 && !diff.in_image_2 ? (
                              <Minus className="h-4 w-4 text-red-500" />
                            ) : (
                              <ArrowRight className="h-4 w-4 text-blue-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="carbon-type-body-02 text-text-01 break-words">{description}</div>
                            {diff.size_diff !== 0 && (
                              <div className="carbon-type-label-01 text-text-03 mt-1">
                                Size: {(diff.size_diff / 1024 / 1024).toFixed(2)} MB
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Single Analysis Result */}
            {analysis && !compareResult && analysis?.efficiency && analysis?.layers && (
              <>
                {/* Efficiency Metrics */}
                <div className="bg-layer-01 border border-ui-03 rounded p-6">
                  <h3 className="carbon-type-productive-heading-02 text-text-01 mb-4 flex items-center gap-2">
                    <TrendingDown className="h-5 w-5" />
                    Image Efficiency
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-layer-02 p-4 rounded">
                      <div className="carbon-type-label-01 text-text-02 mb-1">Efficiency Score</div>
                      <div className={`carbon-type-productive-heading-03 font-mono ${getEfficiencyColor(analysis.efficiency.score).split(' ')[0]}`}>
                        {analysis.efficiency.score.toFixed(1)}%
                      </div>
                    </div>
                    <div className="bg-layer-02 p-4 rounded">
                      <div className="carbon-type-label-01 text-text-02 mb-1">Image Size</div>
                      <div className="carbon-type-productive-heading-03 text-text-01 font-mono">
                        {analysis.efficiency.total_image_size_human}
                      </div>
                    </div>
                    <div className="bg-layer-02 p-4 rounded">
                      <div className="carbon-type-label-01 text-text-02 mb-1">Wasted Space</div>
                      <div className="carbon-type-productive-heading-03 text-red-500 font-mono">
                        {analysis.efficiency.total_wasted_human}
                      </div>
                    </div>
                    <div className="bg-layer-02 p-4 rounded">
                      <div className="carbon-type-label-01 text-text-02 mb-1">Wasted %</div>
                      <div className="carbon-type-productive-heading-03 text-red-500 font-mono">
                        {analysis.efficiency.user_wasted_percent.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {/* Image Info */}
                  <div className="mt-4 pt-4 border-t border-ui-03 grid grid-cols-2 gap-4 carbon-type-body-02 text-text-02">
                    <div>
                      <span className="font-medium">Architecture:</span> {analysis.architecture || 'N/A'}
                    </div>
                    <div>
                      <span className="font-medium">OS:</span> {analysis.os || 'N/A'}
                    </div>
                    {analysis.base_image && (
                      <div className="col-span-2">
                        <span className="font-medium">Base Image:</span> {analysis.base_image}
                      </div>
                    )}
                  </div>
                </div>

                {/* Layers List */}
                <div className="bg-layer-01 border border-ui-03 rounded">
                  <div className="p-6 border-b border-ui-03">
                    <h3 className="carbon-type-productive-heading-02 text-text-01 flex items-center gap-2">
                      <Layers className="h-5 w-5" />
                      Layers ({analysis.layers.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-ui-03">
                    {analysis.layers.map((layer, index) => (
                      <div key={`${layer.id}-${index}`} className="bg-layer-01 hover:bg-layer-hover-01 transition-colors">
                        <div
                          className="p-4 cursor-pointer"
                          onClick={() => toggleLayerExpansion(index)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-1">
                              {expandedLayers.has(index) ? (
                                <ChevronDown className="h-5 w-5 text-text-02" />
                              ) : (
                                <ChevronRight className="h-5 w-5 text-text-02" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="px-2 py-1 bg-interactive-01 text-white rounded carbon-type-label-01 font-mono">
                                  #{index}
                                </span>
                                <span className="carbon-type-body-01 text-text-01 font-mono">
                                  {layer.size_human}
                                </span>
                                {layer.total_files > 0 && (
                                  <span className="carbon-type-label-01 text-text-03">
                                    {layer.total_files} files
                                  </span>
                                )}
                              </div>
                              {/* Truncated command with tooltip */}
                              <div
                                className="carbon-type-code-02 text-text-02 truncate group relative"
                                title={layer.command}
                              >
                                {layer.command}
                                <div className="hidden group-hover:block absolute left-0 top-full mt-2 z-50 max-w-2xl">
                                  <div className="bg-inverse-02 text-inverse-01 px-3 py-2 rounded shadow-lg carbon-type-code-02 whitespace-pre-wrap break-words">
                                    {layer.command}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {expandedLayers.has(index) && (
                          <div className="px-4 pb-4 pl-12 border-t border-ui-03 bg-layer-02">
                            <div className="pt-4 space-y-4">
                              {/* Full Command Display */}
                              <div className="bg-layer-01 p-4 rounded">
                                <div className="carbon-type-label-01 text-text-02 mb-2">Layer Command</div>
                                <div className="bg-field-01 p-3 rounded carbon-type-code-02 text-text-01 whitespace-pre-wrap break-words font-mono">
                                  {layer.command}
                                </div>
                                <button
                                  onClick={() => {
                                    // Placeholder for future AI recommendation feature
                                    alert('AI command recommendation feature coming soon!');
                                  }}
                                  className="mt-3 px-4 py-2 bg-interactive-01 hover:bg-interactive-01-hover text-white rounded carbon-type-body-01 font-medium flex items-center gap-2"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                  Recommend Better Command
                                </button>
                              </div>

                              {/* Layer ID/Digest */}
                              {(layer.digest || layer.id) && (
                                <div className="carbon-type-code-02 text-text-03 bg-field-01 p-2 rounded truncate">
                                  ID: {layer.digest || layer.id}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!analysis && !compareResult && !isAnalyzing && (
              <div className="bg-layer-01 border border-ui-03 rounded p-12 text-center">
                <Layers className="h-16 w-16 text-text-03 mx-auto mb-4" />
                <h3 className="carbon-type-productive-heading-02 text-text-01 mb-2">
                  No Analysis Selected
                </h3>
                <p className="carbon-type-body-01 text-text-02">
                  Enter an image name above to start analyzing, or select a recent analysis from the sidebar
                </p>
              </div>
            )}
          </div>

          {/* Recent Analyses Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-layer-01 border border-ui-03 rounded sticky top-6">
              <div className="p-4 border-b border-ui-03 flex items-center justify-between">
                <h3 className="carbon-type-productive-heading-02 text-text-01">
                  Recent Analyses
                </h3>
                <button
                  onClick={loadRecentAnalyses}
                  className="p-2 hover:bg-layer-hover-01 rounded transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="h-4 w-4 text-text-02" />
                </button>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {recentAnalyses.length > 0 ? (
                  <div className="divide-y divide-ui-03">
                    {recentAnalyses.map((item) => (
                      <div
                        key={item.id}
                        className={`p-4 hover:bg-layer-hover-01 transition-colors group ${
                          analysis?.id === item.id ? 'bg-interactive-01/10 border-l-2 border-interactive-01' : ''
                        }`}
                      >
                        <div
                          onClick={() => handleLoadAnalysis(item.image_name)}
                          className="cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="font-mono carbon-type-body-02 text-text-01 truncate flex-1">
                              {item.image_name}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded carbon-type-label-01 flex-shrink-0 ${getEfficiencyColor(item.efficiency.score)}`}>
                                {item.efficiency.score.toFixed(0)}%
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteAnalysis(item.id, item.image_name);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/10 rounded transition-all"
                                title="Delete analysis"
                              >
                                <Trash2 className="h-3 w-3 text-red-500" />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 carbon-type-label-01 text-text-03">
                            <span>{item.layers.length} layers</span>
                            <span>•</span>
                            <span>{item.efficiency.total_image_size_human}</span>
                          </div>
                          <div className="carbon-type-label-01 text-text-03 mt-1">
                            {new Date(item.analyzed_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <File className="h-12 w-12 text-text-03 mx-auto mb-3" />
                    <p className="carbon-type-body-02 text-text-02">No analyses yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
