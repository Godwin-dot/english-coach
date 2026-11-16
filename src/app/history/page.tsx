import { AppShell } from "@/components/AppShell";
import { getReviewableCardCount } from "@/domain/cards";
import { getPublicLLMConfig } from "@/domain/llm-config";
import { getFullHistory } from "@/domain/history";
import { getAppSettings } from "@/domain/settings";
import { isPasswordAuthEnabled } from "@/lib/auth";
import { HistoryWorkspace } from "./HistoryWorkspace";

export const dynamic = "force-dynamic";

export default function HistoryPage() {
  const appSettings = getAppSettings();
  const llmConfig = getPublicLLMConfig();

  return (
    <AppShell
      activeNav="history"
      targetLevel={appSettings.targetLevel}
      dueCount={getReviewableCardCount()}
      hasProviderKey={llmConfig.hasGeminiKey || llmConfig.hasOpenrouterKey}
      passwordAuthEnabled={isPasswordAuthEnabled()}
    >
      <HistoryWorkspace history={getFullHistory()} />
    </AppShell>
  );
}
