import { AppShell } from "@/components/AppShell";
import { getPublicLLMConfig } from "@/domain/llm-config";
import { getRecentMistakes } from "@/domain/drill";
import { getReviewableCardCount } from "@/domain/cards";
import { getAppSettings } from "@/domain/settings";
import { isPasswordAuthEnabled } from "@/lib/auth";
import { DrillWorkspace } from "./DrillWorkspace";

export const dynamic = "force-dynamic";

export default function DrillPage() {
  const appSettings = getAppSettings();
  const llmConfig = getPublicLLMConfig();

  return (
    <AppShell
      activeNav="drill"
      targetLevel={appSettings.targetLevel}
      dueCount={getReviewableCardCount()}
      hasProviderKey={llmConfig.hasGeminiKey || llmConfig.hasOpenrouterKey}
      passwordAuthEnabled={isPasswordAuthEnabled()}
    >
      <DrillWorkspace
        cefrLevel={appSettings.targetLevel}
        initialMistakes={getRecentMistakes()}
        hasProviderKey={llmConfig.hasGeminiKey || llmConfig.hasOpenrouterKey}
      />
    </AppShell>
  );
}
