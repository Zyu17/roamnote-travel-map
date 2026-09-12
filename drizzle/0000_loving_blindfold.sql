CREATE TABLE `travel_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `travel_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `travel_comments_plan_created_idx` ON `travel_comments` (`plan_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `travel_plan_members` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `travel_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `travel_plan_members_plan_user_unique` ON `travel_plan_members` (`plan_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `travel_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`share_code` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `travel_plans_share_code_unique` ON `travel_plans` (`share_code`);--> statement-breakpoint
CREATE INDEX `travel_plans_owner_updated_idx` ON `travel_plans` (`owner_id`,`updated_at`);