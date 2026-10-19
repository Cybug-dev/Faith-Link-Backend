import assert from "node:assert/strict";
import {
  canAssignRole,
  canLeave,
  canRemoveMember,
  hasPermission,
  permissionsFor,
  type MemberRef,
} from "../src/services/church-permissions.js";

const primary: MemberRef = { userId: "u-primary", role: "admin", isPrimaryAdmin: true };
const admin: MemberRef = { userId: "u-admin", role: "admin", isPrimaryAdmin: false };
const pastor: MemberRef = { userId: "u-pastor", role: "pastor", isPrimaryAdmin: false };
const leader: MemberRef = { userId: "u-leader", role: "leader", isPrimaryAdmin: false };
const member: MemberRef = { userId: "u-member", role: "member", isPrimaryAdmin: false };

function denied(result: ReturnType<typeof canAssignRole>, code: string) {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, code);
}

function runTests() {
  console.log("Starting Church Permission Rule Tests...\n");

  // Permission map
  assert.ok(hasPermission("pastor", "lessons.manage"));
  assert.ok(!hasPermission("leader", "lessons.manage"), "leaders no longer author lessons");
  assert.ok(hasPermission("leader", "quizzes.manage"));
  assert.ok(!hasPermission("member", "quizzes.manage"));
  assert.ok(!hasPermission("pastor", "church.update"));
  assert.ok(!hasPermission("superuser", "members.view"), "unknown roles get nothing");
  console.log("✓ Permission map matches the agreed role split");

  assert.ok(permissionsFor("admin", true).includes("primary.transfer"));
  assert.ok(!permissionsFor("admin", false).includes("primary.transfer"));
  assert.deepEqual(permissionsFor("member", false), ["members.view"]);
  console.log("✓ primary.transfer is granted only by the primary flag, not the admin role");

  // Role assignment
  denied(canAssignRole(member, member, "admin"), "SELF_CHANGE_NOT_ALLOWED");
  denied(canAssignRole(admin, admin, "member"), "SELF_CHANGE_NOT_ALLOWED");
  console.log("✓ Nobody can change their own role (blocks self-promotion)");

  denied(canAssignRole(admin, primary, "member"), "PRIMARY_ADMIN_PROTECTED");
  denied(canAssignRole(pastor, primary, "leader"), "PRIMARY_ADMIN_PROTECTED");
  console.log("✓ Primary admin cannot be demoted by other admins");

  assert.ok(canAssignRole(admin, member, "admin").ok);
  assert.ok(canAssignRole(primary, admin, "member").ok);
  console.log("✓ Admins may assign any role to non-primary members");

  assert.ok(canAssignRole(pastor, member, "leader").ok);
  assert.ok(canAssignRole(pastor, leader, "member").ok);
  denied(canAssignRole(pastor, member, "admin"), "NOT_PERMITTED");
  denied(canAssignRole(pastor, member, "pastor"), "NOT_PERMITTED");
  denied(canAssignRole(pastor, admin, "member"), "NOT_PERMITTED");
  console.log("✓ Pastors only move people between member and leader");

  denied(canAssignRole(leader, member, "leader"), "NOT_PERMITTED");
  denied(canAssignRole(member, leader, "member"), "NOT_PERMITTED");
  console.log("✓ Leaders and members cannot assign roles");

  denied(canAssignRole(admin, member, "owner"), "INVALID_ROLE");
  console.log("✓ Unknown roles are rejected");

  // Removal
  assert.ok(canRemoveMember(admin, pastor).ok);
  assert.equal(canRemoveMember(admin, primary).ok, false);
  assert.equal(canRemoveMember(pastor, member).ok, false);
  const self = canRemoveMember(admin, admin);
  assert.ok(!self.ok && self.code === "USE_LEAVE");
  console.log("✓ Only admins remove members; never the primary admin or themselves");

  // Leaving
  assert.ok(canLeave(admin).ok);
  const primaryLeave = canLeave(primary);
  assert.ok(!primaryLeave.ok && primaryLeave.code === "PRIMARY_ADMIN_MUST_TRANSFER");
  console.log("✓ Primary admin must transfer before leaving");

  console.log("\nAll church permission rule tests passed.");
}

runTests();
