import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { artifactoryApi } from "@/services/artifactoryApi";
import { gitlabApi } from "@/services/gitlabApi";
import { CheckCircle, XCircle, RefreshCw, LogIn, LogOut } from "lucide-react";

interface AppSettings {
  theme?: "light" | "dark";
  imagesPageSize?: number;
  imagesAutoRefresh?: number; // seconds, 0 = off
  onlyWithVulnsDefault?: boolean;
  onlyHighCriticalDefault?: boolean;
}

const loadSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem("appSettings");
    return raw ? (JSON.parse(raw) as AppSettings) : {};
  } catch {
    return {};
  }
};

const saveSettings = (next: AppSettings) => {
  localStorage.setItem("appSettings", JSON.stringify(next));
};

export default function Settings() {
  const { setTheme, theme } = useTheme();
  const { toast } = useToast();

  const initial = useMemo(loadSettings, []);

  const [imagesPageSize, setImagesPageSize] = useState<number>(
    initial.imagesPageSize ?? 12,
  );
  const [imagesAutoRefresh, setImagesAutoRefresh] = useState<number>(
    initial.imagesAutoRefresh ?? 0,
  );
  const [onlyWithVulnsDefault, setOnlyWithVulnsDefault] = useState<boolean>(
    initial.onlyWithVulnsDefault ?? false,
  );
  const [onlyHighCriticalDefault, setOnlyHighCriticalDefault] =
    useState<boolean>(initial.onlyHighCriticalDefault ?? false);

  // Artifactory state
  const [artifactoryUrl, setArtifactoryUrl] = useState("");
  const [artifactoryUsername, setArtifactoryUsername] = useState("");
  const [artifactoryToken, setArtifactoryToken] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isCheckingConnectivity, setIsCheckingConnectivity] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [connectivityStatus, setConnectivityStatus] = useState<{
    connected: boolean;
    message: string;
  } | null>(null);

  // GitLab state - Load from localStorage
  const [gitlabUrl, setGitlabUrl] = useState(() => {
    return localStorage.getItem("gitlab_url") || "gitlab.com";
  });
  const [gitlabUsername, setGitlabUsername] = useState(() => {
    return localStorage.getItem("gitlab_username") || "";
  });
  const [gitlabToken, setGitlabToken] = useState("");
  const [isGitlabLoggingIn, setIsGitlabLoggingIn] = useState(false);
  const [isGitlabCheckingConnectivity, setIsGitlabCheckingConnectivity] = useState(false);
  const [isGitlabLoggingOut, setIsGitlabLoggingOut] = useState(false);
  const [gitlabConnectivityStatus, setGitlabConnectivityStatus] = useState<{
    connected: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (initial.theme) setTheme(initial.theme);
    // Check GitLab connectivity on mount
    if (gitlabUrl) {
      handleGitlabCheckConnectivity();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = () => {
    const next: AppSettings = {
      theme: (theme as "light" | "dark") || "dark",
      imagesPageSize,
      imagesAutoRefresh,
      onlyWithVulnsDefault,
      onlyHighCriticalDefault,
    };
    saveSettings(next);
    toast({
      title: "Settings saved",
      description: "Your preferences are now active.",
    });
  };

  const handleArtifactoryLogin = async () => {
    if (!artifactoryUsername || !artifactoryToken) {
      toast({
        title: "Missing credentials",
        description: "Please provide username and token",
        variant: "destructive",
      });
      return;
    }

    setIsLoggingIn(true);
    try {
      const result = await artifactoryApi.login({
        username: artifactoryUsername,
        token: artifactoryToken,
        url: artifactoryUrl || undefined,
      });

      toast({
        title: "Login successful",
        description: result.message,
      });

      // Check connectivity after successful login
      handleCheckConnectivity();
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleCheckConnectivity = async () => {
    if (!artifactoryUrl) {
      toast({
        title: "Missing URL",
        description: "Please provide Artifactory URL",
        variant: "destructive",
      });
      return;
    }

    setIsCheckingConnectivity(true);
    try {
      const result = await artifactoryApi.checkConnectivityGet(artifactoryUrl);
      setConnectivityStatus({
        connected: result.connected,
        message: result.message,
      });

      toast({
        title: result.connected ? "Connected" : "Not connected",
        description: result.message,
        variant: result.connected ? "default" : "destructive",
      });
    } catch (error: any) {
      setConnectivityStatus({
        connected: false,
        message: error.message,
      });

      toast({
        title: "Connectivity check failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCheckingConnectivity(false);
    }
  };

  const handleArtifactoryLogout = async () => {
    if (!artifactoryUrl) {
      toast({
        title: "Missing URL",
        description: "Please provide Artifactory URL",
        variant: "destructive",
      });
      return;
    }

    setIsLoggingOut(true);
    try {
      const result = await artifactoryApi.logout(artifactoryUrl);

      toast({
        title: "Logout successful",
        description: result.message,
      });

      setConnectivityStatus(null);
      setArtifactoryToken("");
    } catch (error: any) {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  // GitLab handlers
  const handleGitlabLogin = async () => {
    if (!gitlabToken) {
      toast({
        title: "Missing credentials",
        description: "Please provide GitLab token",
        variant: "destructive",
      });
      return;
    }

    setIsGitlabLoggingIn(true);
    try {
      const result = await gitlabApi.login({
        username: gitlabUsername || undefined,
        token: gitlabToken,
        url: gitlabUrl || undefined,
      });

      // Save to localStorage
      localStorage.setItem("gitlab_url", gitlabUrl || "gitlab.com");
      if (gitlabUsername) {
        localStorage.setItem("gitlab_username", gitlabUsername);
      }

      toast({
        title: "Login successful",
        description: result.message,
      });

      // Check connectivity after successful login
      handleGitlabCheckConnectivity();
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGitlabLoggingIn(false);
    }
  };

  const handleGitlabCheckConnectivity = async () => {
    setIsGitlabCheckingConnectivity(true);
    try {
      const result = await gitlabApi.checkConnectivityGet(gitlabUrl || undefined);
      setGitlabConnectivityStatus({
        connected: result.connected,
        message: result.message,
      });

      toast({
        title: result.connected ? "Connected" : "Not connected",
        description: result.message,
        variant: result.connected ? "default" : "destructive",
      });
    } catch (error: any) {
      setGitlabConnectivityStatus({
        connected: false,
        message: error.message,
      });

      toast({
        title: "Connectivity check failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGitlabCheckingConnectivity(false);
    }
  };

  const handleGitlabLogout = async () => {
    setIsGitlabLoggingOut(true);
    try {
      const result = await gitlabApi.logout(gitlabUrl || undefined);

      // Clear localStorage
      localStorage.removeItem("gitlab_url");
      localStorage.removeItem("gitlab_username");

      toast({
        title: "Logout successful",
        description: result.message,
      });

      setGitlabConnectivityStatus(null);
      setGitlabToken("");
    } catch (error: any) {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGitlabLoggingOut(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="col-span-full space-y-8">
        <div>
          <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2">
            Settings
          </h1>
          <p className="carbon-type-body-02 text-text-02">
            Configure appearance, Docker Images defaults, and integrations. Changes are saved
            locally and applied immediately.
          </p>
        </div>

        {/* Appearance */}
        <section className="bg-layer-01 border border-ui-03 rounded p-6">
          <h2 className="carbon-type-productive-heading-02 text-text-01 mb-4">
            Appearance
          </h2>
          <div className="flex items-center gap-4">
            <button
              className={`px-3 py-2 border rounded carbon-type-body-01 ${theme === "light" ? "bg-ui-03 border-interactive-01" : "border-ui-04"}`}
              onClick={() => setTheme("light")}
            >
              Light
            </button>
            <button
              className={`px-3 py-2 border rounded carbon-type-body-01 ${theme === "dark" ? "bg-ui-03 border-interactive-01" : "border-ui-04"}`}
              onClick={() => setTheme("dark")}
            >
              Dark
            </button>
          </div>
        </section>

        {/* Docker Images Defaults */}
        <section className="bg-layer-01 border border-ui-03 rounded p-6">
          <h2 className="carbon-type-productive-heading-02 text-text-01 mb-4">
            Docker Images
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block carbon-type-label-01 text-text-02 mb-2">
                Page size
              </label>
              <select
                value={imagesPageSize}
                onChange={(e) => setImagesPageSize(Number(e.target.value))}
                className="w-full px-3 py-2 bg-field-01 border border-ui-04 rounded carbon-type-body-01 text-text-01 focus:outline-none focus:ring-2 focus:ring-interactive-01 appearance-none"
              >
                {[8, 12, 16, 24, 32].map((n) => (
                  <option key={n} value={n}>
                    {n} per page
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block carbon-type-label-01 text-text-02 mb-2">
                Auto-refresh (seconds)
              </label>
              <Input
                type="number"
                min={0}
                step={30}
                value={imagesAutoRefresh}
                onChange={(e) =>
                  setImagesAutoRefresh(Math.max(0, Number(e.target.value) || 0))
                }
              />
              <p className="carbon-type-label-01 text-text-03 mt-1">
                Set 0 to disable auto-refresh.
              </p>
            </div>
            <div className="md:col-span-2 flex flex-col gap-3">
              <label className="inline-flex items-center gap-2 carbon-type-body-01 text-text-01">
                <Checkbox
                  checked={onlyWithVulnsDefault}
                  onCheckedChange={(v) => setOnlyWithVulnsDefault(Boolean(v))}
                />
                <span>Default: only show images with vulnerabilities</span>
              </label>
              <label className="inline-flex items-center gap-2 carbon-type-body-01 text-text-01">
                <Checkbox
                  checked={onlyHighCriticalDefault}
                  onCheckedChange={(v) =>
                    setOnlyHighCriticalDefault(Boolean(v))
                  }
                />
                <span>Default: only High or Critical</span>
              </label>
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={handleSave}
              className="px-4 py-2 border border-ui-04 text-text-01 rounded carbon-type-body-01 hover:bg-ui-01 transition-colors"
            >
              Save Settings
            </button>
          </div>
        </section>

        {/* Artifactory Integration */}
        <section className="bg-layer-01 border border-ui-03 rounded p-6">
          <h2 className="carbon-type-productive-heading-02 text-text-01 mb-4">
            Artifactory Integration
          </h2>
          <p className="carbon-type-body-02 text-text-02 mb-6">
            Connect to your Artifactory registry to scan and manage container images
          </p>

          <div className="space-y-4">
            {/* Artifactory URL */}
            <div>
              <label className="block carbon-type-label-01 text-text-02 mb-2">
                Artifactory URL
              </label>
              <Input
                type="text"
                value={artifactoryUrl}
                onChange={(e) => setArtifactoryUrl(e.target.value)}
                placeholder="artifactory.example.com"
                className="w-full"
              />
              <p className="carbon-type-label-01 text-text-03 mt-1">
                Enter your Artifactory registry URL (without protocol)
              </p>
            </div>

            {/* Username */}
            <div>
              <label className="block carbon-type-label-01 text-text-02 mb-2">
                Username
              </label>
              <Input
                type="text"
                value={artifactoryUsername}
                onChange={(e) => setArtifactoryUsername(e.target.value)}
                placeholder="your_username"
                className="w-full"
              />
            </div>

            {/* API Token */}
            <div>
              <label className="block carbon-type-label-01 text-text-02 mb-2">
                API Token
              </label>
              <Input
                type="password"
                value={artifactoryToken}
                onChange={(e) => setArtifactoryToken(e.target.value)}
                placeholder="your_api_token"
                className="w-full"
              />
              <p className="carbon-type-label-01 text-text-03 mt-1">
                Generate an API token from your Artifactory profile
              </p>
            </div>

            {/* Connectivity Status */}
            {connectivityStatus && (
              <div className={`p-4 rounded border flex items-start gap-3 ${
                connectivityStatus.connected
                  ? 'bg-green-500/10 border-green-500/20'
                  : 'bg-red-500/10 border-red-500/20'
              }`}>
                {connectivityStatus.connected ? (
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <div className={`carbon-type-body-01 font-medium ${
                    connectivityStatus.connected ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {connectivityStatus.connected ? 'Connected' : 'Not Connected'}
                  </div>
                  <div className="carbon-type-body-02 text-text-02 mt-1">
                    {connectivityStatus.message}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={handleArtifactoryLogin}
                disabled={isLoggingIn}
                className="px-4 py-2 bg-interactive-01 hover:bg-interactive-01-hover text-white rounded carbon-type-body-01 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoggingIn ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    Login
                  </>
                )}
              </button>

              <button
                onClick={handleCheckConnectivity}
                disabled={isCheckingConnectivity}
                className="px-4 py-2 bg-layer-02 hover:bg-layer-hover-01 border border-ui-04 text-text-01 rounded carbon-type-body-01 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isCheckingConnectivity ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Check Connectivity
                  </>
                )}
              </button>

              <button
                onClick={handleArtifactoryLogout}
                disabled={isLoggingOut}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 rounded carbon-type-body-01 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoggingOut ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Logging out...
                  </>
                ) : (
                  <>
                    <LogOut className="h-4 w-4" />
                    Logout
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* GitLab Integration */}
        <section className="bg-layer-01 border border-ui-03 rounded p-6">
          <h2 className="carbon-type-productive-heading-02 text-text-01 mb-4">
            GitLab Integration
          </h2>
          <p className="carbon-type-body-02 text-text-02 mb-6">
            Connect to your GitLab instance to browse repositories and scan Dockerfiles
          </p>

          <div className="space-y-4">
            {/* GitLab URL */}
            <div>
              <label className="block carbon-type-label-01 text-text-02 mb-2">
                GitLab URL
              </label>
              <Input
                type="text"
                value={gitlabUrl}
                onChange={(e) => setGitlabUrl(e.target.value)}
                placeholder="gitlab.com or git.example.com"
                className="w-full"
              />
              <p className="carbon-type-label-01 text-text-03 mt-1">
                Enter your GitLab instance URL (without protocol)
              </p>
            </div>

            {/* Username (optional) */}
            <div>
              <label className="block carbon-type-label-01 text-text-02 mb-2">
                Username (optional)
              </label>
              <Input
                type="text"
                value={gitlabUsername}
                onChange={(e) => setGitlabUsername(e.target.value)}
                placeholder="your_username"
                className="w-full"
              />
            </div>

            {/* Personal Access Token */}
            <div>
              <label className="block carbon-type-label-01 text-text-02 mb-2">
                Personal Access Token
              </label>
              <Input
                type="password"
                value={gitlabToken}
                onChange={(e) => setGitlabToken(e.target.value)}
                placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                className="w-full"
              />
              <p className="carbon-type-label-01 text-text-03 mt-1">
                Generate a personal access token from GitLab Settings → Access Tokens (requires read_api, read_repository scopes)
              </p>
            </div>

            {/* Connectivity Status */}
            {gitlabConnectivityStatus && (
              <div className={`p-4 rounded border flex items-start gap-3 ${
                gitlabConnectivityStatus.connected
                  ? 'bg-green-500/10 border-green-500/20'
                  : 'bg-red-500/10 border-red-500/20'
              }`}>
                {gitlabConnectivityStatus.connected ? (
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <div className={`carbon-type-body-01 font-medium ${
                    gitlabConnectivityStatus.connected ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {gitlabConnectivityStatus.connected ? 'Connected' : 'Not Connected'}
                  </div>
                  <div className="carbon-type-body-02 text-text-02 mt-1">
                    {gitlabConnectivityStatus.message}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={handleGitlabLogin}
                disabled={isGitlabLoggingIn}
                className="px-4 py-2 bg-interactive-01 hover:bg-interactive-01-hover text-white rounded carbon-type-body-01 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isGitlabLoggingIn ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    Login
                  </>
                )}
              </button>

              <button
                onClick={handleGitlabCheckConnectivity}
                disabled={isGitlabCheckingConnectivity}
                className="px-4 py-2 bg-layer-02 hover:bg-layer-hover-01 border border-ui-04 text-text-01 rounded carbon-type-body-01 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isGitlabCheckingConnectivity ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Check Connectivity
                  </>
                )}
              </button>

              <button
                onClick={handleGitlabLogout}
                disabled={isGitlabLoggingOut}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 rounded carbon-type-body-01 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isGitlabLoggingOut ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Logging out...
                  </>
                ) : (
                  <>
                    <LogOut className="h-4 w-4" />
                    Logout
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
