import { useState } from "react";
import { Upload, FileText, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { KubeconfigValidationResponse } from "@shared/kubeconfig";

interface KubeconfigUploadProps {
  onUploadSuccess: (response: KubeconfigValidationResponse) => void;
}

export function KubeconfigUpload({ onUploadSuccess }: KubeconfigUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [name, setName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile || !name.trim()) {
      setError("Please provide both a kubeconfig file and a name");
      return;
    }

    setIsUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("kubeconfig", selectedFile);
      formData.append("name", name.trim());

      const response = await fetch(
        "http://localhost:8080/api/v1/validate-kubeconfig",
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: KubeconfigValidationResponse = await response.json();
      
      // Always call onUploadSuccess for any successful API response
      // The validation status (valid/invalid) will be handled in the parent component
      onUploadSuccess(data);
      
      // Reset form if the upload was successful and stored
      if (data.stored) {
        setName("");
        setSelectedFile(null);
      }
    } catch (error) {
      console.error("Upload error:", error);
      setError("Failed to upload kubeconfig. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-layer-01 border border-ui-03 rounded p-6">
      <h3 className="carbon-type-productive-heading-02 text-text-01 mb-4">
        Upload Kubeconfig
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name Input */}
        <div>
          <label className="block carbon-type-label-01 text-text-02 mb-2">
            Cluster Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., production-cluster"
            className="w-full px-3 py-2 bg-field-01 border border-ui-04 rounded carbon-type-body-01 text-text-01 placeholder-text-03 focus:outline-none focus:ring-2 focus:ring-interactive-01"
            disabled={isUploading}
          />
        </div>

        {/* File Upload Area */}
        <div>
          <label className="block carbon-type-label-01 text-text-02 mb-2">
            Kubeconfig File *
          </label>
          <div
            className={cn(
              "relative border-2 border-dashed rounded-lg p-6 text-center transition-colors",
              dragActive ? "border-interactive-01 bg-ui-01" : "border-ui-04",
              "hover:border-interactive-01 hover:bg-ui-01",
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              onChange={handleFileChange}
              accept=".yaml,.yml,.config"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isUploading}
            />

            <div className="flex flex-col items-center space-y-3">
              {selectedFile ? (
                <>
                  <FileText className="h-8 w-8 text-interactive-01" />
                  <div>
                    <p className="carbon-type-body-01 text-text-01">
                      {selectedFile.name}
                    </p>
                    <p className="carbon-type-label-01 text-text-02">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-text-03" />
                  <div>
                    <p className="carbon-type-body-01 text-text-01">
                      Drop kubeconfig file here or click to browse
                    </p>
                    <p className="carbon-type-label-01 text-text-02">
                      Supports .yaml, .yml, .config files
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center space-x-2 p-3 bg-support-01 text-white rounded">
            <AlertTriangle className="h-4 w-4" />
            <span className="carbon-type-body-01">{error}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isUploading || !selectedFile || !name.trim()}
          className={cn(
            "w-full flex items-center justify-center space-x-2 px-4 py-3 rounded carbon-type-body-01 transition-colors",
            isUploading || !selectedFile || !name.trim()
              ? "bg-ui-03 text-text-03 cursor-not-allowed"
              : "bg-interactive-01 text-white hover:bg-interactive-03",
          )}
        >
          {isUploading ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              <span>Validating...</span>
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              <span>Upload & Validate</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
