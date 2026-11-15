CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`ref_id` integer,
	`rating` integer,
	`score` real,
	`duration_s` integer,
	`meta_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_date` ON `activity_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`term` text NOT NULL,
	`translation` text NOT NULL,
	`phonetic` text,
	`example_sentence` text NOT NULL,
	`example_translation` text NOT NULL,
	`mnemonic` text,
	`source_lesson_id` integer,
	`due` text NOT NULL,
	`fsrs_state_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_cards_due` ON `cards` (`due`);--> statement-breakpoint
CREATE UNIQUE INDEX `cards_language_term_unique` ON `cards` (`language`,`term`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`topic` text NOT NULL,
	`cefr_level` text NOT NULL,
	`content_en` text NOT NULL,
	`content_fr` text NOT NULL,
	`keywords_json` text NOT NULL,
	`quiz_json` text NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
