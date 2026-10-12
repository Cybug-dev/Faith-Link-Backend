import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  lessonCompletions,
  lessons,
  churches,
  quizAttempts,
  quizzes,
  userAchievements,
  type UserAchievement,
} from "../db/schema.js";

export interface AchievementDefinition {
  key: string;
  title: string;
  description: string;
  badge: string;
}

export const ACHIEVEMENTS_REGISTRY: AchievementDefinition[] = [
  {
    key: "first_lesson_completed",
    title: "First Lesson Completed",
    description: "Completed your first lesson in FaithLink.",
    badge: "book-open",
  },
  {
    key: "first_quiz_completed",
    title: "First Quiz Completed",
    description: "Completed your first quiz assessment.",
    badge: "award",
  },
  {
    key: "perfect_score",
    title: "Perfect Score",
    description: "Achieved a 100% score on a quiz.",
    badge: "star",
  },
  {
    key: "completed_5_lessons",
    title: "Completed 5 Lessons",
    description: "Demonstrated diligence by finishing 5 lessons.",
    badge: "check-circle",
  },
  {
    key: "completed_10_quizzes",
    title: "Completed 10 Quizzes",
    description: "Demonstrated mastery by finishing 10 quizzes.",
    badge: "trophy",
  },
];

/**
 * Calculates learning streak (in days) from timestamps of user activities.
 */
export function calculateStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;

  // Normalize to unique UTC calendar day strings (YYYY-MM-DD)
  const uniqueDays = new Set<string>();
  for (const d of dates) {
    const dayStr = d.toISOString().split("T")[0];
    if (dayStr) uniqueDays.add(dayStr);
  }

  const sortedDays = Array.from(uniqueDays).sort().reverse();
  if (sortedDays.length === 0) return 0;

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const mostRecent = sortedDays[0];
  // If user hasn't engaged today or yesterday, streak is broken
  if (mostRecent !== todayStr && mostRecent !== yesterdayStr) {
    return 0;
  }

  let streak = 0;
  let expectedDate = new Date(mostRecent + "T00:00:00Z");

  for (const dayStr of sortedDays) {
    const current = new Date(dayStr + "T00:00:00Z");
    const diffDays = Math.round((expectedDate.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      streak += 1;
      expectedDate.setUTCDate(expectedDate.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Evaluates user milestones against trusted database records and unlocks achievements.
 * Fully idempotent and server-authoritative.
 */
export async function syncUserAchievements(userId: string): Promise<UserAchievement[]> {
  // 1. Gather trusted user metrics
  const completedLessons = await db
    .select({ id: lessonCompletions.id })
    .from(lessonCompletions)
    .where(eq(lessonCompletions.userId, userId));

  const completedAttempts = await db
    .select({
      id: quizAttempts.id,
      percentage: quizAttempts.percentage,
    })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.status, "completed")));

  const lessonCount = completedLessons.length;
  const quizCount = completedAttempts.length;
  const hasPerfectScore = completedAttempts.some((a) => a.percentage === 100);

  // 2. Identify qualifying achievement keys
  const qualifyingKeys: string[] = [];
  if (lessonCount >= 1) qualifyingKeys.push("first_lesson_completed");
  if (quizCount >= 1) qualifyingKeys.push("first_quiz_completed");
  if (hasPerfectScore) qualifyingKeys.push("perfect_score");
  if (lessonCount >= 5) qualifyingKeys.push("completed_5_lessons");
  if (quizCount >= 10) qualifyingKeys.push("completed_10_quizzes");

  if (qualifyingKeys.length > 0) {
    for (const key of qualifyingKeys) {
      await db
        .insert(userAchievements)
        .values({
          userId,
          achievementKey: key,
          unlockedAt: new Date(),
        })
        .onConflictDoNothing({
          target: [userAchievements.userId, userAchievements.achievementKey],
        });
    }
  }

  // 3. Return all currently unlocked achievements for this user
  return db
    .select()
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId));
}

/**
 * Returns full achievement status (unlocked and locked) for a user.
 */
export async function getUserAchievements(userId: string) {
  const unlockedRows = await syncUserAchievements(userId);
  const unlockedMap = new Map<string, Date>();
  for (const row of unlockedRows) {
    unlockedMap.set(row.achievementKey, row.unlockedAt);
  }

  const achievements = ACHIEVEMENTS_REGISTRY.map((def) => {
    const unlockedAt = unlockedMap.get(def.key);
    return {
      ...def,
      isUnlocked: Boolean(unlockedAt),
      unlockedAt: unlockedAt ? unlockedAt.toISOString() : null,
    };
  });

  return {
    userId,
    totalUnlocked: unlockedRows.length,
    totalAvailable: ACHIEVEMENTS_REGISTRY.length,
    achievements,
  };
}

/**
 * Returns unified learning and quiz progress for the user.
 */
export async function getUserProgress(userId: string, churchId?: string) {
  // 1. Fetch lesson completions
  const lessonRows = await db
    .select({
      id: lessonCompletions.id,
      lessonId: lessonCompletions.lessonId,
      lessonTitle: lessons.title,
      churchId: lessonCompletions.churchId,
      churchName: churches.name,
      completedAt: lessonCompletions.completedAt,
    })
    .from(lessonCompletions)
    .innerJoin(lessons, eq(lessonCompletions.lessonId, lessons.id))
    .innerJoin(churches, eq(lessonCompletions.churchId, churches.id))
    .where(
      and(
        eq(lessonCompletions.userId, userId),
        churchId ? eq(lessonCompletions.churchId, churchId) : undefined
      )
    )
    .orderBy(desc(lessonCompletions.completedAt));

  // 2. Fetch completed quiz attempts
  const quizRows = await db
    .select({
      id: quizAttempts.id,
      quizId: quizAttempts.quizId,
      quizTitle: quizzes.title,
      churchId: quizAttempts.churchId,
      score: quizAttempts.score,
      maxScore: quizAttempts.maxScore,
      percentage: quizAttempts.percentage,
      isPassed: quizAttempts.isPassed,
      completedAt: quizAttempts.completedAt,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .where(
      and(
        eq(quizAttempts.userId, userId),
        eq(quizAttempts.status, "completed"),
        churchId ? eq(quizAttempts.churchId, churchId) : undefined
      )
    )
    .orderBy(desc(quizAttempts.completedAt));

  // 3. Compute best quiz scores by quiz
  const bestScoreMap = new Map<string, { quizId: string; quizTitle: string; bestPercentage: number; bestScore: number }>();
  for (const q of quizRows) {
    const existing = bestScoreMap.get(q.quizId);
    const pct = q.percentage ?? 0;
    const score = q.score ?? 0;
    if (!existing || pct > existing.bestPercentage) {
      bestScoreMap.set(q.quizId, {
        quizId: q.quizId,
        quizTitle: q.quizTitle,
        bestPercentage: pct,
        bestScore: score,
      });
    }
  }

  // 4. Calculate learning streak from all activity dates
  const activityDates: Date[] = [
    ...lessonRows.map((l) => l.completedAt),
    ...quizRows.filter((q) => q.completedAt !== null).map((q) => q.completedAt as Date),
  ];
  const currentStreakDays = calculateStreak(activityDates);

  // 5. Recent unified learning activity feed (top 10)
  const recentActivity = [
    ...lessonRows.map((l) => ({
      type: "lesson" as const,
      id: l.id,
      title: l.lessonTitle,
      churchName: l.churchName,
      timestamp: l.completedAt.toISOString(),
    })),
    ...quizRows
      .filter((q) => q.completedAt !== null)
      .map((q) => ({
        type: "quiz" as const,
        id: q.id,
        title: q.quizTitle,
        percentage: q.percentage,
        isPassed: q.isPassed,
        timestamp: (q.completedAt as Date).toISOString(),
      })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  return {
    userId,
    lessonsCompletedCount: lessonRows.length,
    quizzesCompletedCount: quizRows.length,
    currentStreakDays,
    bestQuizScores: Array.from(bestScoreMap.values()),
    recentActivity,
    lessons: lessonRows,
    quizzes: quizRows,
  };
}

/**
 * Returns aggregated stats for user overview.
 */
export async function getUserStats(userId: string, churchId?: string) {
  const progress = await getUserProgress(userId, churchId);
  const achievements = await getUserAchievements(userId);

  const completedQuizzes = progress.quizzes;
  const totalQuizzes = completedQuizzes.length;
  const avgScore =
    totalQuizzes > 0
      ? Math.round(
          completedQuizzes.reduce((sum, q) => sum + (q.percentage ?? 0), 0) / totalQuizzes
        )
      : 0;

  const perfectScores = completedQuizzes.filter((q) => q.percentage === 100).length;

  return {
    userId,
    totalLessonsCompleted: progress.lessonsCompletedCount,
    totalQuizzesCompleted: totalQuizzes,
    averageQuizPercentage: avgScore,
    perfectScoresCount: perfectScores,
    currentStreakDays: progress.currentStreakDays,
    achievementsUnlockedCount: achievements.totalUnlocked,
    achievementsTotalAvailable: achievements.totalAvailable,
  };
}
