CREATE TABLE `reception_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`assigned_to_email` text,
	`client_code` text NOT NULL,
	`item_type` text NOT NULL,
	`detail` text NOT NULL,
	`priority` text NOT NULL,
	`due_at` text,
	`status` text NOT NULL,
	`escalated_to_email` text,
	`outcome` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `safety_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_email` text NOT NULL,
	`alert_type` text NOT NULL,
	`severity` text NOT NULL,
	`status` text NOT NULL,
	`detail` text NOT NULL,
	`action_taken` text,
	`created_at` text NOT NULL,
	`escalated_at` text,
	`acknowledged_at` text,
	`acknowledged_by` text,
	`actioned_at` text,
	`actioned_by` text,
	`supervisor_signoff_at` text,
	`supervisor_signoff_by` text,
	`closed_at` text,
	`closed_by` text
);
--> statement-breakpoint
CREATE TABLE `schedule_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_email` text NOT NULL,
	`starts_at` text NOT NULL,
	`duration_minutes` text NOT NULL,
	`client_code` text NOT NULL,
	`age_band` text NOT NULL,
	`support_intensity` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shift_checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_email` text NOT NULL,
	`shift_started_at` text NOT NULL,
	`shift_ended_at` text,
	`lunch_due_at` text NOT NULL,
	`lunch_started_at` text,
	`lunch_finished_at` text,
	`break_state` text NOT NULL,
	`workload_check` text,
	`support_requested` text DEFAULT '0' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff_work_profiles` (
	`email` text PRIMARY KEY NOT NULL,
	`max_daily_hours` text DEFAULT '8' NOT NULL,
	`max_daily_sessions` text DEFAULT '6' NOT NULL,
	`max_high_support_sessions` text DEFAULT '2' NOT NULL,
	`lunch_after_minutes` text DEFAULT '240' NOT NULL,
	`transition_buffer_minutes` text DEFAULT '20' NOT NULL,
	`age_pattern` text DEFAULT 'mixed_with_buffers' NOT NULL,
	`child_days` text DEFAULT '[]' NOT NULL,
	`adult_days` text DEFAULT '[]' NOT NULL,
	`preferences_confirmed_at` text,
	`approved_by_email` text,
	`updated_at` text NOT NULL
);
