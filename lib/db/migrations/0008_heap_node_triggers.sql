CREATE TABLE `heap_node_triggers` (
	`node_id` text NOT NULL,
	`trigger_id` text NOT NULL,
	PRIMARY KEY(`node_id`, `trigger_id`),
	FOREIGN KEY (`node_id`) REFERENCES `heap_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trigger_id`) REFERENCES `triggers`(`id`) ON UPDATE no action ON DELETE cascade
);
