ALTER TABLE `heap_nodes` ADD `shape` text NOT NULL DEFAULT 'rectangle';
--> statement-breakpoint
ALTER TABLE `heap_nodes` ADD `width` real;
--> statement-breakpoint
ALTER TABLE `heap_nodes` ADD `height` real;
