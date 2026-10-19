-- Membership hierarchy: primary-admin protection, display-only role labels, primary transfers.
-- Hand-written: the drizzle journal predates the quiz/achievement tables, so `drizzle-kit generate` would re-emit them.

ALTER TABLE "churches" ADD COLUMN "role_labels" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "church_members" ADD COLUMN "is_primary_admin" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Backfill: the earliest-joined active admin of each church becomes its primary admin.
UPDATE "church_members" cm SET "is_primary_admin" = true
FROM (
  SELECT DISTINCT ON ("church_id") "id"
  FROM "church_members"
  WHERE "role" = 'admin' AND "status" = 'active'
  ORDER BY "church_id", "joined_at", "id"
) first_admin
WHERE cm."id" = first_admin."id";
--> statement-breakpoint
ALTER TABLE "church_members" ADD CONSTRAINT "church_members_role_valid" CHECK ("role" IN ('admin', 'pastor', 'leader', 'member'));
--> statement-breakpoint
ALTER TABLE "church_members" ADD CONSTRAINT "church_members_status_valid" CHECK ("status" IN ('active', 'left', 'removed'));
--> statement-breakpoint
ALTER TABLE "church_members" ADD CONSTRAINT "church_members_primary_is_admin" CHECK (NOT "is_primary_admin" OR ("role" = 'admin' AND "status" = 'active'));
--> statement-breakpoint
CREATE UNIQUE INDEX "church_members_one_primary_idx" ON "church_members" USING btree ("church_id") WHERE "is_primary_admin";
--> statement-breakpoint
CREATE TABLE "church_primary_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL REFERENCES "churches"("id") ON DELETE CASCADE,
	"from_user_id" text NOT NULL REFERENCES "profiles"("user_id") ON DELETE CASCADE,
	"to_user_id" text NOT NULL REFERENCES "profiles"("user_id") ON DELETE CASCADE,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "church_primary_transfers_one_pending_idx" ON "church_primary_transfers" USING btree ("church_id") WHERE "status" = 'pending';
--> statement-breakpoint
CREATE INDEX "church_primary_transfers_to_user_idx" ON "church_primary_transfers" USING btree ("to_user_id");
