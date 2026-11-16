import { AppShell } from "@/components/AppShell";
import { getDueCards, getReviewableCardCount } from "@/domain/cards";
import { getPublicLLMConfig } from "@/domain/llm-config";
import { getTodayLesson } from "@/domain/lessons";
import { getAppSettings } from "@/domain/settings";
import { isPasswordAuthEnabled } from "@/lib/auth";
import { SessionWorkspace } from "./SessionWorkspace";

export const dynamic = "force-dynamic";

export default function SessionPage() {
  const settings = getAppSettings();
  const llmConfig = getPublicLLMConfig();
  const due = getDueCards(new Date(), 8);

  return (
    <AppShell
      targetLevel={settings.targetLevel}
      dueCount={getReviewableCardCount()}
      hasProviderKey={llmConfig.hasGeminiKey || llmConfig.hasOpenrouterKey}
      passwordAuthEnabled={isPasswordAuthEnabled()}
    >
      <SessionWorkspace
        cefrLevel={settings.targetLevel}
        interests={settings.interests}
        initialDueCards={due.cards}
        initialLesson={getTodayLesson()}
      />
    </AppShell>
  );
}
