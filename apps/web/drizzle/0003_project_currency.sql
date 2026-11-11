ALTER TABLE "disputes" ADD COLUMN "currency" text DEFAULT 'pkr' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "currency" text DEFAULT 'pkr' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "currency" text DEFAULT 'pkr' NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "currency" text DEFAULT 'pkr' NOT NULL;