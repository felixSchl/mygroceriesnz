CREATE TABLE IF NOT EXISTS `app_state` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`selected_stores` text DEFAULT '[]'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `list` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`name` text DEFAULT 'default',
	`items` text DEFAULT '[]'
);
