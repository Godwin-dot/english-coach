import { db } from "./index";
import { settings } from "./schema";

const initialSettings = [
  ["daily_new_cards", 10],
  ["daily_review_cap", 15],
  ["weekly_goal_days", 5],
  ["target_level", "B1"],
  ["interests", ["développement logiciel", "littérature"]],
] as const;

db.transaction((transaction) => {
  for (const [key, value] of initialSettings) {
    transaction
      .insert(settings)
      .values({ key, value: JSON.stringify(value) })
      .onConflictDoNothing({ target: settings.key })
      .run();
  }
});

console.info(`Seeded ${initialSettings.length} default settings (idempotent).`);
