import { AppShell } from "@/components/AppShell";
import { getReviewableCardCount } from "@/domain/cards";
import { listChatSessions } from "@/domain/chat";
import { getPublicLLMConfig } from "@/domain/llm-config";
import { getAppSettings } from "@/domain/settings";
import { isPasswordAuthEnabled } from "@/lib/auth";
import { ChatWorkspace } from "./ChatWorkspace";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  const appSettings = getAppSettings();
  const llmConfig = getPublicLLMConfig();
  const hasProviderKey =
    llmConfig.hasGeminiKey || llmConfig.hasOpenrouterKey;

  return (
    <AppShell
      activeNav="chat"
      targetLevel={appSettings.targetLevel}
      dueCount={getReviewableCardCount()}
      hasProviderKey={hasProviderKey}
      passwordAuthEnabled={isPasswordAuthEnabled()}
    >
      <ChatWorkspace
        cefrLevel={appSettings.targetLevel}
        hasProviderKey={hasProviderKey}
        initialSessions={listChatSessions()}
      />
    </AppShell>
  );
}
