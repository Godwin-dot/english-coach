import { AppShell } from "@/components/AppShell";
import { getPublicLLMConfig } from "@/domain/llm-config";
import { getDueCards } from "@/domain/cards";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { isPasswordAuthEnabled } from "@/lib/auth";
import { ReviewWorkspace } from "./ReviewWorkspace";

export const dynamic = "force-dynamic";

export default function ReviewPage() {
  const rows = db.select().from(settings).all();
  const values = new Map(rows.map(({ key, value }) => [key, value]));
  const levelValue = values.get("target_level");
  if (levelValue === undefined) {
    throw new Error("Missing required application setting: target_level");
  }
  const targetLevel: unknown = JSON.parse(levelValue);
  if (typeof targetLevel !== "string") {
    throw new Error("The target_level setting has an invalid format.");
  }
  const llmConfig = getPublicLLMConfig();
  const review = getDueCards();

  return (
    <AppShell
      activeNav="review"
      targetLevel={targetLevel}
      dueCount={review.cards.length}
      hasProviderKey={llmConfig.hasGeminiKey || llmConfig.hasOpenrouterKey}
      passwordAuthEnabled={isPasswordAuthEnabled()}
    >
      <ReviewWorkspace
        initialCards={review.cards}
        totalDueCount={review.totalDueCount}
      />
    </AppShell>
  );
}
