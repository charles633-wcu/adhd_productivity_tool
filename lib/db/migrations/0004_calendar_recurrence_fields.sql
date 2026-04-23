ALTER TABLE `calendar_events` ADD `repeat_frequency` text;
--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `repeat_interval` integer;
--> statement-breakpoint
UPDATE `calendar_events`
SET `repeat_frequency` = 'day',
    `repeat_interval` = `repeat_interval_days`
WHERE `repeat_interval_days` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `calendar_events` DROP COLUMN `repeat_interval_days`;
