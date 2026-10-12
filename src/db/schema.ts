import {
  pgTable,
  text,
  varchar,
  timestamp,
  uuid,
  integer,
  boolean,
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

/**
 * Lessons in public schema.
 * Spiritual learning material and courses scoped to church tenants.
 */
export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    churchId: uuid("church_id")
      .notNull()
      .references(() => churches.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    summary: text("summary"),
    content: text("content").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("draft"), // 'draft' | 'published' | 'archived'
    orderIndex: integer("order_index").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("lessons_church_slug_idx").on(table.churchId, table.slug),
    index("lessons_church_idx").on(table.churchId),
    index("lessons_status_idx").on(table.status),
  ]
);

/**
 * Lesson Completions in public schema.
 * Tracks member progress and lesson completions per user and church.
 */
export const lessonCompletions = pgTable(
  "lesson_completions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    churchId: uuid("church_id")
      .notNull()
      .references(() => churches.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("lesson_completions_lesson_user_idx").on(table.lessonId, table.userId),
    index("lesson_completions_user_idx").on(table.userId),
    index("lesson_completions_church_idx").on(table.churchId),
  ]
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Church = typeof churches.$inferSelect;
export type NewChurch = typeof churches.$inferInsert;
export type ChurchMember = typeof churchMembers.$inferSelect;
export type NewChurchMember = typeof churchMembers.$inferInsert;
export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;
export type LessonCompletion = typeof lessonCompletions.$inferSelect;
export type NewLessonCompletion = typeof lessonCompletions.$inferInsert;

/**
 * Quizzes in public schema.
 * Church-scoped quizzes, optionally linked to a lesson.
 * passingScore is a seam for Phase 6 scoring; null means no pass threshold enforced.
 * deletedAt enables soft-delete so historical quiz_attempts (Phase 6) remain intact.
 */
export const quizzes = pgTable(
  "quizzes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    churchId: uuid("church_id")
      .notNull()
      .references(() => churches.id, { onDelete: "cascade" }),
    /** Optional: link quiz to a specific lesson for curriculum flow. */
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    /** draft | published | archived — mirrors lessons.status pattern. */
    status: varchar("status", { length: 50 }).notNull().default("draft"),
    /** Seam for Phase 6 scoring: 0–100 percentage threshold, null = ungraded. */
    passingScore: integer("passing_score"),
    orderIndex: integer("order_index").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    /** Soft-delete: preserves historical attempt data from Phase 6. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("quizzes_church_idx").on(table.churchId),
    index("quizzes_lesson_idx").on(table.lessonId),
    index("quizzes_status_idx").on(table.status),
  ]
);

/**
 * Quiz Questions in public schema.
 * Ordered questions within a quiz. Hard-deleted with parent quiz (cascade).
 * pointValue is a seam for Phase 6 weighted scoring; default 1.
 */
export const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    /** Seam for Phase 6: points awarded for a correct answer. */
    pointValue: integer("point_value").notNull().default(1),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    /** Soft-delete: retains question text in historical attempt records. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("quiz_questions_quiz_idx").on(table.quizId),
  ]
);

/**
 * Quiz Options in public schema.
 * Answer choices for a quiz question. isCorrect drives Phase 6 answer scoring.
 * Hard-deleted with parent question (cascade).
 */
export const quizOptions = pgTable(
  "quiz_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => quizQuestions.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    /** True for the correct answer choice(s); consumed by Phase 6 scoring. */
    isCorrect: boolean("is_correct").notNull().default(false),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("quiz_options_question_idx").on(table.questionId),
  ]
);

export type Quiz = typeof quizzes.$inferSelect;
export type NewQuiz = typeof quizzes.$inferInsert;
export type QuizQuestion = typeof quizQuestions.$inferSelect;
export type NewQuizQuestion = typeof quizQuestions.$inferInsert;
export type QuizOption = typeof quizOptions.$inferSelect;
export type NewQuizOption = typeof quizOptions.$inferInsert;


