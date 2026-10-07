import {
  pgTable,
  text,
  varchar,
  timestamp,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * User Profiles in public schema.
 * Extends the managed identity in `neon_auth.user` with FaithLink profile attributes.
 */
export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  phoneNumber: varchar("phone_number", { length: 25 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Churches (Tenants) in public schema.
 * Root multi-tenant boundary for communities, branches, and youth ministries.
 */
export const churches = pgTable(
  "churches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    description: text("description"),
    logoUrl: text("logo_url"),
    address: text("address"),
    city: varchar("city", { length: 100 }),
    country: varchar("country", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("churches_slug_idx").on(table.slug),
  ]
);

/**
 * Church Memberships in public schema.
 * Maps authenticated user profiles to churches with role-based access control.
 */
export const churchMembers = pgTable(
  "church_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    churchId: uuid("church_id")
      .notNull()
      .references(() => churches.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull().default("member"),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("church_members_church_user_idx").on(table.churchId, table.userId),
    index("church_members_user_idx").on(table.userId),
    index("church_members_church_idx").on(table.churchId),
  ]
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Church = typeof churches.$inferSelect;
export type NewChurch = typeof churches.$inferInsert;
export type ChurchMember = typeof churchMembers.$inferSelect;
export type NewChurchMember = typeof churchMembers.$inferInsert;
