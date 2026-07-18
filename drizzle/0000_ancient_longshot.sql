CREATE TABLE `hub_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`assigned_by_email` text NOT NULL,
	`assigned_by_name` text NOT NULL,
	`assigned_to_email` text NOT NULL,
	`title` text NOT NULL,
	`instructions` text NOT NULL,
	`category` text NOT NULL,
	`priority` text NOT NULL,
	`due_at` text,
	`status` text NOT NULL,
	`response` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hub_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hub_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`sender_email` text NOT NULL,
	`sender_name` text NOT NULL,
	`sender_role` text NOT NULL,
	`recipient_email` text,
	`recipient_role` text,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`category` text NOT NULL,
	`priority` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	`acknowledged_at` text,
	`reply_to` text
);
--> statement-breakpoint
CREATE TABLE `hub_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`permissions` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`last_seen_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hub_users_email_unique` ON `hub_users` (`email`);