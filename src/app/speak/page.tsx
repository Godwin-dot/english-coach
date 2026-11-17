import { AppShell } from "@/components/AppShell";
import { getReviewableCardCount } from "@/domain/cards";
import { getPublicLLMConfig } from "@/domain/llm-config";
import { getAppSettings } from "@/domain/settings";
import { isPasswordAuthEnabled } from "@/lib/auth";
import { SpeakWorkspace } from "./SpeakWorkspace";

export const dynamic = "force-dynamic";

export default function SpeakPage() {
  const appSettings = getAppSettings();
  const llmConfig = getPublicLLMConfig();

  return (
    <AppShell
      activeNav="speak"
      targetLevel={appSettings.targetLevel}
      dueCount={getReviewableCardCount()}
      hasProviderKey={llmConfig.hasGeminiKey || llmConfig.hasOpenrouterKey}
      passwordAuthEnabled={isPasswordAuthEnabled()}
    >
      <SpeakWorkspace cefrLevel={appSettings.targetLevel} />
    </AppShell>
  );
}
