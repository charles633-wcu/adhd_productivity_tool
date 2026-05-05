CREATE TABLE `calendar_event_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`master_event_id` text NOT NULL,
	`original_date` text NOT NULL,
	`title` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`notes` text,
	FOREIGN KEY (`master_event_id`) REFERENCES `calendar_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cal_evt_override_master_original_uniq` ON `calendar_event_overrides` (`master_event_id`,`original_date`);
--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `rrule` text;
--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `exdates` text;
--> statement-breakpoint
ALTER TABLE `calendar_events` DROP COLUMN `repeat_frequency`;
--> statement-breakpoint
ALTER TABLE `calendar_events` DROP COLUMN `repeat_interval`;
--> statement-breakpoint
ALTER TABLE `calendar_events` DROP COLUMN `repeat_ends_at`;
