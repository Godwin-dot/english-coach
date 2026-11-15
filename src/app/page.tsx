import { AppShell } from "@/components/AppShell";
import { DashboardWorkspace } from "@/components/DashboardWorkspace";
import { getPublicLLMConfig } from "@/domain/llm-config";
import { getAppSettings } from "@/domain/settings";
import { getDashboardStats } from "@/domain/stats";
import { isPasswordAuthEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const appSettings = getAppSettings();
  const stats = getDashboardStats(appSettings);
  const llmConfig = getPublicLLMConfig();
  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date());

  return (
    <AppShell
      activeNav="home"
      targetLevel={appSettings.targetLevel}
      dueCount={stats.reviewableCards}
      hasProviderKey={llmConfig.hasGeminiKey || llmConfig.hasOpenrouterKey}
      passwordAuthEnabled={isPasswordAuthEnabled()}
    >
      <DashboardWorkspace
        initialSettings={appSettings}
        stats={stats}
        dateLabel={dateLabel}
      />
    </AppShell>
  );
}
