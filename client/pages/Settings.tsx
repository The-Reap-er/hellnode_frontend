import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";

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

  useEffect(() => {
    if (initial.theme) setTheme(initial.theme);
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

  return (
    <DashboardLayout>
      <div className="col-span-full space-y-8">
        <div>
          <h1 className="carbon-type-productive-heading-04 text-text-01 mb-2">
            Settings
          </h1>
          <p className="carbon-type-body-02 text-text-02">
            Configure appearance and Docker Images defaults. Changes are saved
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
      </div>
    </DashboardLayout>
  );
}
