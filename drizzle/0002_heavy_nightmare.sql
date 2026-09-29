CREATE TABLE `place_image_names` (
	`image_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `place_images`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `place_image_names_name_image_unique` ON `place_image_names` (`name`,`image_id`);--> statement-breakpoint
CREATE TABLE `place_images` (
	`id` text PRIMARY KEY NOT NULL,
	`place_name` text NOT NULL,
	`city` text NOT NULL,
	`longitude` real NOT NULL,
	`latitude` real NOT NULL,
	`match_radius` integer DEFAULT 1500 NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`focal_x` real DEFAULT 0.5 NOT NULL,
	`focal_y` real DEFAULT 0.5 NOT NULL,
	`alt` text NOT NULL,
	`source_page_url` text NOT NULL,
	`source_image_url` text NOT NULL,
	`author` text NOT NULL,
	`license` text NOT NULL,
	`license_url` text NOT NULL,
	`changes` text NOT NULL,
	`content_hash` text NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `place_images_object_key_unique` ON `place_images` (`object_key`);