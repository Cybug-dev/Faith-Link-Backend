import { and, asc, eq, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  churches,
  churchMembers,
  churchPrimaryTransfers,
  profiles,
  type ChurchMember,
  type ChurchPrimaryTransfer,
} from "../db/schema.js";
import type { CreateChurchInput, UpdateChurchInput } from "../validation/church.js";
import { canAssignRole, canLeave, canRemoveMember, type ChurchRole } from "./church-permissions.js";

/** Max churches one user may hold the primary admin role for. Anti-spam; legitimate multi-site leaders fit. */
export const MAX_PRIMARY_ADMIN_CHURCHES = 3;
/** How long a primary transfer offer stays open. */
export const PRIMARY_TRANSFER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ServiceError = { ok: false; status: 400 | 403 | 404 | 409; code: string; message: string };
export type ServiceResult<T> = { ok: true; data: T } | ServiceError;

const fail = (status: ServiceError["status"], code: string, message: string): ServiceError => ({
  ok: false,
  status,
  code,
  message,
});

/** Postgres unique violation. Drizzle wraps driver errors, so the code may sit on `cause`. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** Fallback display name from JWT claims, used when a profile is created implicitly. */
export function defaultDisplayName(jwtPayload: Record<string, unknown> | undefined): string {
  const name = jwtPayload?.name;
  if (typeof name === "string" && name.trim()) return name.trim().slice(0, 100);
  const email = jwtPayload?.email;
  if (typeof email === "string" && email.includes("@")) return email.split("@")[0].slice(0, 100);
  return "User";
}

/** Creates the profile row if missing (FK target for memberships). Safe under concurrency. */
async function ensureProfile(tx: Tx, userId: string, displayName: string) {
  const now = new Date();
  await tx
    .insert(profiles)
    .values({ userId, displayName, createdAt: now, updatedAt: now })
    .onConflictDoNothing();
}

/** Drops empty/undefined entries so stored labels only hold real overrides. */
function cleanRoleLabels(labels: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(labels).filter(([, v]) => typeof v === "string" && v.length > 0)) as Record<
    string,
    string
  >;
}

/** Escapes LIKE wildcards so user search text is matched literally. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/**
 * Creates a church with the creator as admin + primary admin, atomically.
 * The creator's profile row is locked so concurrent creates cannot slip past the limit.
 */
export async function createChurch(
  userId: string,
  displayName: string,
  input: CreateChurchInput
): Promise<ServiceResult<{ church: typeof churches.$inferSelect; membership: ChurchMember }>> {
  try {
    return await db.transaction(async (tx) => {
      await ensureProfile(tx, userId, displayName);
      await tx.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.userId, userId)).for("update");

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(churchMembers)
        .where(and(eq(churchMembers.userId, userId), eq(churchMembers.isPrimaryAdmin, true)));
      if (count >= MAX_PRIMARY_ADMIN_CHURCHES) {
        return fail(
          409,
          "CHURCH_LIMIT_REACHED",
          `You can be the primary admin of at most ${MAX_PRIMARY_ADMIN_CHURCHES} churches`
        );
      }

      const now = new Date();
      const [church] = await tx
        .insert(churches)
        .values({
          name: input.name,
          slug: input.slug,
          description: input.description || null,
          logoUrl: input.logoUrl || null,
          address: input.address || null,
          city: input.city || null,
          country: input.country || null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const [membership] = await tx
        .insert(churchMembers)
        .values({ churchId: church.id, userId, role: "admin", status: "active", isPrimaryAdmin: true, joinedAt: now })
        .returning();

      return { ok: true as const, data: { church, membership } };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail(409, "SLUG_TAKEN", "A church with this slug already exists");
    }
    throw err;
  }
}

/** Public church directory with optional name/city search. */
export async function listChurches(params: { q?: string; limit: number; offset: number }) {
  const filter = params.q
    ? or(ilike(churches.name, likePattern(params.q)), ilike(churches.city, likePattern(params.q)))
    : undefined;

  // Explicit aliases: Drizzle renders column refs unqualified here, so "id" would bind to church_members.id.
  const memberCount = sql<number>`(
    SELECT count(*)::int FROM "church_members" cm
    WHERE cm."church_id" = "churches"."id" AND cm."status" = 'active'
  )`;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: churches.id,
        name: churches.name,
        slug: churches.slug,
        description: churches.description,
        logoUrl: churches.logoUrl,
        city: churches.city,
        country: churches.country,
        memberCount,
      })
      .from(churches)
      .where(filter)
      .orderBy(asc(churches.name), asc(churches.id))
      .limit(params.limit)
      .offset(params.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(churches).where(filter),
  ]);

  return { churches: rows, total, limit: params.limit, offset: params.offset };
}

/** Updates editable church fields. Slug is not editable. */
export async function updateChurch(churchId: string, input: UpdateChurchInput) {
  const { roleLabels, ...fields } = input;
  const [church] = await db
    .update(churches)
    .set({
      ...fields,
      ...(roleLabels !== undefined ? { roleLabels: cleanRoleLabels(roleLabels) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(churches.id, churchId))
    .returning();
  return church;
}

/** Active members, primary admin first, then by role rank and name. */
export async function listMembers(churchId: string, params: { limit: number; offset: number }) {
  const where = and(eq(churchMembers.churchId, churchId), eq(churchMembers.status, "active"));
  const roleRank = sql`CASE ${churchMembers.role} WHEN 'admin' THEN 0 WHEN 'pastor' THEN 1 WHEN 'leader' THEN 2 ELSE 3 END`;

  const [members, [{ total }]] = await Promise.all([
    db
      .select({
        membershipId: churchMembers.id,
        role: churchMembers.role,
        isPrimaryAdmin: churchMembers.isPrimaryAdmin,
        status: churchMembers.status,
        joinedAt: churchMembers.joinedAt,
        user: {
          userId: profiles.userId,
          displayName: profiles.displayName,
          avatarUrl: profiles.avatarUrl,
        },
      })
      .from(churchMembers)
      .innerJoin(profiles, eq(churchMembers.userId, profiles.userId))
      .where(where)
      .orderBy(sql`${churchMembers.isPrimaryAdmin} DESC`, roleRank, asc(profiles.displayName), asc(churchMembers.id))
      .limit(params.limit)
      .offset(params.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(churchMembers).where(where),
  ]);

  return { members, total, limit: params.limit, offset: params.offset };
}

/**
 * Joins a church as `member`. A user who previously left is reactivated as a plain member
 * (old role is not restored). A removed user cannot rejoin on their own.
 */
export async function joinChurch(
  churchId: string,
  userId: string,
  displayName: string
): Promise<ServiceResult<{ churchName: string; membership: ChurchMember; rejoined: boolean }>> {
  try {
    return await db.transaction(async (tx) => {
      const [church] = await tx
        .select({ id: churches.id, name: churches.name })
        .from(churches)
        .where(eq(churches.id, churchId))
        .limit(1);
      if (!church) return fail(404, "CHURCH_NOT_FOUND", "Church not found");

      await ensureProfile(tx, userId, displayName);

      const [existing] = await tx
        .select()
        .from(churchMembers)
        .where(and(eq(churchMembers.churchId, churchId), eq(churchMembers.userId, userId)))
        .for("update");

      if (existing?.status === "active") return fail(409, "ALREADY_MEMBER", "You are already a member of this church");
      if (existing?.status === "removed") {
        return fail(403, "REMOVED_FROM_CHURCH", "You were removed from this church and cannot rejoin on your own");
      }

      const now = new Date();
      if (existing) {
        const [membership] = await tx
          .update(churchMembers)
          .set({ status: "active", role: "member", isPrimaryAdmin: false, joinedAt: now })
          .where(eq(churchMembers.id, existing.id))
          .returning();
        return { ok: true as const, data: { churchName: church.name, membership, rejoined: true } };
      }

      const [membership] = await tx
        .insert(churchMembers)
        .values({ churchId, userId, role: "member", status: "active", joinedAt: now })
        .returning();
      return { ok: true as const, data: { churchName: church.name, membership, rejoined: false } };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail(409, "ALREADY_MEMBER", "You are already a member of this church");
    }
    throw err;
  }
}

/**
 * Locks the actor's active membership and the target membership (same church) in id order,
 * so concurrent role changes cannot interleave or deadlock.
 */
async function lockActorAndTarget(tx: Tx, churchId: string, actorUserId: string, targetMembershipId: string) {
  const rows = await tx
    .select()
    .from(churchMembers)
    .where(
      and(
        eq(churchMembers.churchId, churchId),
        or(eq(churchMembers.userId, actorUserId), eq(churchMembers.id, targetMembershipId))
      )
    )
    .orderBy(asc(churchMembers.id))
    .for("update");
  const actor = rows.find((r) => r.userId === actorUserId && r.status === "active");
  const target = rows.find((r) => r.id === targetMembershipId && r.status === "active");
  return { actor, target };
}

/** Cancels any pending primary transfer offered to `userId` in this church (they are no longer eligible). */
async function cancelPendingTransfersTo(tx: Tx, churchId: string, userId: string) {
  await tx
    .update(churchPrimaryTransfers)
    .set({ status: "cancelled", resolvedAt: new Date() })
    .where(
      and(
        eq(churchPrimaryTransfers.churchId, churchId),
        eq(churchPrimaryTransfers.toUserId, userId),
        eq(churchPrimaryTransfers.status, "pending")
      )
    );
}

export async function changeMemberRole(
  churchId: string,
  actorUserId: string,
  targetMembershipId: string,
  newRole: ChurchRole
): Promise<ServiceResult<ChurchMember>> {
  return db.transaction(async (tx) => {
    const { actor, target } = await lockActorAndTarget(tx, churchId, actorUserId, targetMembershipId);
    if (!actor) return fail(403, "NOT_A_MEMBER", "You are not an active member of this church");
    if (!target) return fail(404, "MEMBER_NOT_FOUND", "Member not found in this church");

    const rule = canAssignRole(actor, target, newRole);
    if (!rule.ok) return fail(rule.code === "INVALID_ROLE" ? 400 : 403, rule.code, rule.message);
    if (target.role === newRole) return { ok: true as const, data: target };

    const [updated] = await tx
      .update(churchMembers)
      .set({ role: newRole })
      .where(eq(churchMembers.id, target.id))
      .returning();
    return { ok: true as const, data: updated };
  });
}

export async function removeMember(
  churchId: string,
  actorUserId: string,
  targetMembershipId: string
): Promise<ServiceResult<ChurchMember>> {
  return db.transaction(async (tx) => {
    const { actor, target } = await lockActorAndTarget(tx, churchId, actorUserId, targetMembershipId);
    if (!actor) return fail(403, "NOT_A_MEMBER", "You are not an active member of this church");
    if (!target) return fail(404, "MEMBER_NOT_FOUND", "Member not found in this church");

    const rule = canRemoveMember(actor, target);
    if (!rule.ok) return fail(rule.code === "USE_LEAVE" ? 400 : 403, rule.code, rule.message);

    const [updated] = await tx
      .update(churchMembers)
      .set({ status: "removed", role: "member" })
      .where(eq(churchMembers.id, target.id))
      .returning();
    await cancelPendingTransfersTo(tx, churchId, target.userId);
    return { ok: true as const, data: updated };
  });
}

/** The caller leaves the church. The role resets to `member` so a later rejoin starts fresh. */
export async function leaveChurch(churchId: string, userId: string): Promise<ServiceResult<ChurchMember>> {
  return db.transaction(async (tx) => {
    const [member] = await tx
      .select()
      .from(churchMembers)
      .where(
        and(eq(churchMembers.churchId, churchId), eq(churchMembers.userId, userId), eq(churchMembers.status, "active"))
      )
      .for("update");
    if (!member) return fail(404, "NOT_A_MEMBER", "You are not an active member of this church");

    const rule = canLeave(member);
    if (!rule.ok) return fail(409, rule.code, rule.message);

    const [updated] = await tx
      .update(churchMembers)
      .set({ status: "left", role: "member" })
      .where(eq(churchMembers.id, member.id))
      .returning();
    await cancelPendingTransfersTo(tx, churchId, userId);
    return { ok: true as const, data: updated };
  });
}

/** Marks overdue pending offers as expired so they stop blocking new offers. */
async function expireStaleTransfers(tx: Tx, churchId: string) {
  await tx
    .update(churchPrimaryTransfers)
    .set({ status: "expired", resolvedAt: new Date() })
    .where(
      and(
        eq(churchPrimaryTransfers.churchId, churchId),
        eq(churchPrimaryTransfers.status, "pending"),
        lt(churchPrimaryTransfers.expiresAt, new Date())
      )
    );
}

/** Pending, unexpired offer for this church that involves `userId` (as offerer or recipient), if any. */
export async function getPendingTransferFor(churchId: string, userId: string) {
  const [transfer] = await db
    .select()
    .from(churchPrimaryTransfers)
    .where(
      and(
        eq(churchPrimaryTransfers.churchId, churchId),
        eq(churchPrimaryTransfers.status, "pending"),
        sql`${churchPrimaryTransfers.expiresAt} > now()`,
        or(eq(churchPrimaryTransfers.fromUserId, userId), eq(churchPrimaryTransfers.toUserId, userId))
      )
    )
    .limit(1);
  return transfer ?? null;
}

/** The primary admin offers the role to another active member. One open offer per church. */
export async function offerPrimaryTransfer(
  churchId: string,
  actorUserId: string,
  targetMembershipId: string
): Promise<ServiceResult<ChurchPrimaryTransfer>> {
  try {
    return await db.transaction(async (tx) => {
      const { actor, target } = await lockActorAndTarget(tx, churchId, actorUserId, targetMembershipId);
      if (!actor?.isPrimaryAdmin) {
        return fail(403, "NOT_PRIMARY_ADMIN", "Only the primary admin can transfer the primary admin role");
      }
      if (!target) return fail(404, "MEMBER_NOT_FOUND", "Member not found in this church");
      if (target.id === actor.id) return fail(400, "SELF_TRANSFER", "You are already the primary admin");

      await expireStaleTransfers(tx, churchId);
      const now = new Date();
      const [transfer] = await tx
        .insert(churchPrimaryTransfers)
        .values({
          churchId,
          fromUserId: actor.userId,
          toUserId: target.userId,
          status: "pending",
          createdAt: now,
          expiresAt: new Date(now.getTime() + PRIMARY_TRANSFER_TTL_MS),
        })
        .returning();
      return { ok: true as const, data: transfer };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail(409, "TRANSFER_PENDING", "A transfer is already pending; cancel it before offering a new one");
    }
    throw err;
  }
}

/**
 * The recipient accepts the open offer. In one transaction: re-check both people are still
 * eligible, clear the old flag, then make the recipient admin + primary admin.
 * The former primary admin stays an admin.
 */
export async function acceptPrimaryTransfer(
  churchId: string,
  userId: string
): Promise<ServiceResult<ChurchPrimaryTransfer>> {
  return db.transaction(async (tx) => {
    const [transfer] = await tx
      .select()
      .from(churchPrimaryTransfers)
      .where(
        and(
          eq(churchPrimaryTransfers.churchId, churchId),
          eq(churchPrimaryTransfers.toUserId, userId),
          eq(churchPrimaryTransfers.status, "pending")
        )
      )
      .for("update");
    if (!transfer) return fail(404, "NO_PENDING_TRANSFER", "There is no pending transfer for you in this church");

    const now = new Date();
    if (transfer.expiresAt <= now) {
      await tx
        .update(churchPrimaryTransfers)
        .set({ status: "expired", resolvedAt: now })
        .where(eq(churchPrimaryTransfers.id, transfer.id));
      return fail(409, "TRANSFER_EXPIRED", "This transfer offer has expired");
    }

    const rows = await tx
      .select()
      .from(churchMembers)
      .where(
        and(
          eq(churchMembers.churchId, churchId),
          inArray(churchMembers.userId, [transfer.fromUserId, transfer.toUserId]),
          eq(churchMembers.status, "active")
        )
      )
      .orderBy(asc(churchMembers.id))
      .for("update");
    const from = rows.find((r) => r.userId === transfer.fromUserId);
    const to = rows.find((r) => r.userId === transfer.toUserId);

    if (!from?.isPrimaryAdmin || !to) {
      await tx
        .update(churchPrimaryTransfers)
        .set({ status: "cancelled", resolvedAt: now })
        .where(eq(churchPrimaryTransfers.id, transfer.id));
      return fail(409, "TRANSFER_INVALID", "This transfer is no longer valid");
    }

    // Order matters: the one-primary-per-church index must never see two flags at once.
    await tx.update(churchMembers).set({ isPrimaryAdmin: false }).where(eq(churchMembers.id, from.id));
    await tx.update(churchMembers).set({ role: "admin", isPrimaryAdmin: true }).where(eq(churchMembers.id, to.id));

    const [accepted] = await tx
      .update(churchPrimaryTransfers)
      .set({ status: "accepted", resolvedAt: now })
      .where(eq(churchPrimaryTransfers.id, transfer.id))
      .returning();
    return { ok: true as const, data: accepted };
  });
}

/** Either party ends the open offer: the primary admin withdraws it, or the recipient declines it. */
export async function cancelPrimaryTransfer(
  churchId: string,
  userId: string
): Promise<ServiceResult<ChurchPrimaryTransfer>> {
  const [cancelled] = await db
    .update(churchPrimaryTransfers)
    .set({ status: "cancelled", resolvedAt: new Date() })
    .where(
      and(
        eq(churchPrimaryTransfers.churchId, churchId),
        eq(churchPrimaryTransfers.status, "pending"),
        or(eq(churchPrimaryTransfers.fromUserId, userId), eq(churchPrimaryTransfers.toUserId, userId))
      )
    )
    .returning();
  if (!cancelled) return fail(404, "NO_PENDING_TRANSFER", "There is no pending transfer you can cancel");
  return { ok: true, data: cancelled };
}
