CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"total_elapsed_seconds" integer,
	"active_seconds" integer,
	"paused_seconds" integer,
	"total_cartons" integer,
	"total_points" double precision,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pallet_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"pallet_size_id" uuid,
	"cartons" integer NOT NULL,
	"point_value" double precision NOT NULL,
	"total_points" double precision NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pallet_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"label" text NOT NULL,
	"cartons" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pause_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"reason_code" text NOT NULL,
	"reason_label" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer
);
--> statement-breakpoint
CREATE TABLE "point_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"pallet_log_id" uuid NOT NULL,
	"race_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"points" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"size_label" text NOT NULL,
	"cartons_per_layout" integer DEFAULT 12 NOT NULL,
	"point_value" double precision DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_product_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"point_value" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"prize_description" text,
	"start_at" timestamp with time zone DEFAULT now() NOT NULL,
	"end_at" timestamp with time zone,
	"min_active_hours" double precision DEFAULT 30 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"archive_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"employee_id" text NOT NULL,
	"emoji" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batch_members" ADD CONSTRAINT "batch_members_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_members" ADD CONSTRAINT "batch_members_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_line_id_production_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."production_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallet_logs" ADD CONSTRAINT "pallet_logs_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallet_logs" ADD CONSTRAINT "pallet_logs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallet_logs" ADD CONSTRAINT "pallet_logs_pallet_size_id_pallet_sizes_id_fk" FOREIGN KEY ("pallet_size_id") REFERENCES "public"."pallet_sizes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallet_sizes" ADD CONSTRAINT "pallet_sizes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pause_logs" ADD CONSTRAINT "pause_logs_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_awards" ADD CONSTRAINT "point_awards_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_awards" ADD CONSTRAINT "point_awards_pallet_log_id_pallet_logs_id_fk" FOREIGN KEY ("pallet_log_id") REFERENCES "public"."pallet_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_awards" ADD CONSTRAINT "point_awards_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_awards" ADD CONSTRAINT "point_awards_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_product_points" ADD CONSTRAINT "race_product_points_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_product_points" ADD CONSTRAINT "race_product_points_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batch_members_batch_idx" ON "batch_members" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "batch_members_worker_idx" ON "batch_members" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "batches_line_idx" ON "batches" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "batches_product_idx" ON "batches" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "batches_status_idx" ON "batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "batches_started_at_idx" ON "batches" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "batches_line_status_idx" ON "batches" USING btree ("line_id","status");--> statement-breakpoint
CREATE INDEX "pallet_logs_batch_idx" ON "pallet_logs" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "pallet_logs_created_at_idx" ON "pallet_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pallet_logs_product_idx" ON "pallet_logs" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "pallet_sizes_product_idx" ON "pallet_sizes" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pallet_sizes_product_cartons_unique" ON "pallet_sizes" USING btree ("product_id","cartons");--> statement-breakpoint
CREATE INDEX "pause_logs_batch_idx" ON "pause_logs" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "pause_logs_reason_idx" ON "pause_logs" USING btree ("reason_code");--> statement-breakpoint
CREATE INDEX "pause_logs_started_at_idx" ON "pause_logs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "point_awards_batch_idx" ON "point_awards" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "point_awards_race_idx" ON "point_awards" USING btree ("race_id");--> statement-breakpoint
CREATE INDEX "point_awards_worker_idx" ON "point_awards" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "point_awards_pallet_idx" ON "point_awards" USING btree ("pallet_log_id");--> statement-breakpoint
CREATE INDEX "point_awards_created_at_idx" ON "point_awards" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "point_awards_race_worker_idx" ON "point_awards" USING btree ("race_id","worker_id");--> statement-breakpoint
CREATE INDEX "point_awards_race_pallet_idx" ON "point_awards" USING btree ("race_id","pallet_log_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_lines_code_unique" ON "production_lines" USING btree ("code");--> statement-breakpoint
CREATE INDEX "production_lines_sort_idx" ON "production_lines" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "production_lines_is_active_idx" ON "production_lines" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "products_is_active_idx" ON "products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "race_product_points_race_idx" ON "race_product_points" USING btree ("race_id");--> statement-breakpoint
CREATE UNIQUE INDEX "race_product_points_unique" ON "race_product_points" USING btree ("race_id","product_id");--> statement-breakpoint
CREATE INDEX "races_status_idx" ON "races" USING btree ("status");--> statement-breakpoint
CREATE INDEX "races_start_at_idx" ON "races" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "races_is_primary_idx" ON "races" USING btree ("is_primary");--> statement-breakpoint
CREATE INDEX "races_end_at_idx" ON "races" USING btree ("end_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workers_employee_id_unique" ON "workers" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workers_emoji_unique" ON "workers" USING btree ("emoji");--> statement-breakpoint
CREATE INDEX "workers_is_active_idx" ON "workers" USING btree ("is_active");