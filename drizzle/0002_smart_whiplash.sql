CREATE TABLE `mistakes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`user_text` text NOT NULL,
	`correction` text NOT NULL,
	`category` text,
	`explanation` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mistakes_date` ON `mistakes` (`created_at`);