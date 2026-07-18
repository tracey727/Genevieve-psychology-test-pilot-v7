import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("builds the connected Irene, staff and reception safety experience", () => {
  const hosting = JSON.parse(read("../dist/.openai/hosting.json"));
  const manifest = JSON.parse(read("../dist/client/manifest.webmanifest"));
  const migration = read("../dist/.openai/drizzle/0000_ancient_longshot.sql");
  const safetyMigration = read("../dist/.openai/drizzle/0001_unique_tinkerer.sql");
  const memoryMigration = read("../dist/.openai/drizzle/0002_quiet_zarek.sql");
  const legacyDashboard = read("../dist/client/demo/index.html");
  const messageApi = read("../app/api/messages/route.ts");
  const assignmentApi = read("../app/api/assignments/route.ts");
  const staffApi = read("../app/api/staff/route.ts");
  const safetyApi = read("../app/api/safety/route.ts");
  const receptionApi = read("../app/api/reception/route.ts");
  const memoryApi = read("../app/api/memory/route.ts");
  const receptionPage = read("../app/reception/reception-base.tsx");
  const clientAssets = readdirSync(new URL("../dist/client/assets/", import.meta.url))
    .filter((name) => name.endsWith(".js"))
    .map((name) => read(`../dist/client/assets/${name}`))
    .join("\n");

  assert.equal(hosting.d1, "DB");
  assert.equal(manifest.start_url, "/staff");
  assert.equal(manifest.display, "standalone");
  assert.match(migration, /CREATE TABLE `hub_users`/i);
  assert.match(migration, /CREATE TABLE `hub_messages`/i);
  assert.match(migration, /CREATE TABLE `hub_assignments`/i);
  assert.match(safetyMigration, /CREATE TABLE `safety_alerts`/i);
  assert.match(safetyMigration, /CREATE TABLE `shift_checkins`/i);
  assert.match(safetyMigration, /CREATE TABLE `staff_work_profiles`/i);
  assert.match(safetyMigration, /CREATE TABLE `schedule_blocks`/i);
  assert.match(safetyMigration, /CREATE TABLE `reception_queue`/i);
  assert.match(memoryMigration, /CREATE TABLE `practice_memory`/i);
  assert.match(memoryMigration, /`status_before_delete` text/i);
  assert.match(memoryMigration, /`review_count` text/i);
  assert.match(clientAssets, /Irene’s Connected Command Centre/);
  assert.match(clientAssets, /Staff Phone App|GENEVIEVE/);
  assert.match(clientAssets, /Reception Base/);
  assert.match(clientAssets, /Supervisor sign-off and close/);
  assert.match(clientAssets, /Practice Memory & Learning/);
  assert.match(clientAssets, /Permanent purge/);
  assert.match(clientAssets, /Feedback never rewrites guidance automatically/);
  assert.match(clientAssets, /Fictional Reception Demo/);
  assert.match(clientAssets, /Fictional Staff Demo/);
  assert.match(legacyDashboard, /href="\/irene"/);
  assert.match(legacyDashboard, /href="\/staff"/);
  assert.match(legacyDashboard, /href="\/reception"/);
  assert.match(messageApi, /recipient_email = \? OR recipient_role = \?/);
  assert.match(messageApi, /recipientRole = oversight[^:]+:[^;]+"director"/s);
  assert.match(assignmentApi, /assigned_to_email !== actor\.email/);
  assert.match(staffApi, /actor\.role !== "director"/);
  assert.match(safetyApi, /Only a supervisor or authorised safety person may deactivate this alert/);
  assert.match(safetyApi, /if \(!alert\.action_taken \|\| !alert\.actioned_at\)/);
  assert.match(safetyApi, /lunch_break/);
  assert.match(safetyApi, /high_support_load/);
  assert.match(safetyApi, /age_transition/);
  assert.match(receptionApi, /Reception does not make a clinical assessment/);
  assert.match(receptionPage, /No clinical notes, diagnosis or risk judgement/);
  assert.match(memoryApi, /Only Irene’s director account can permanently purge/);
  assert.match(memoryApi, /Enter the exact title and a purge reason/);
  assert.match(memoryApi, /memory_permanently_purged/);
  assert.match(memoryApi, /outside this account’s role access/);
  assert.match(memoryApi, /demo-memory-seed-marker/);
  assert.match(memoryApi, /review_count=CAST\(review_count AS INTEGER\)\+1/);
  assert.match(memoryApi, /status_before_delete=status/);
  assert.match(memoryApi, /DELETE FROM practice_memory WHERE id=\?/);
});
