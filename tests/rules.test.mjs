// Offline tests for firestore.rules — run with: npm test
// These prove the portal's privacy promises hold for every kind of visitor:
// a stranger, a pending joiner, a verified member, an administrator.
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "cpca-test",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8085 },
});

const ADMIN_EMAIL = "admin@example.com";
const MEMBER_EMAIL = "member@example.com";
const SEEDED_EMAIL = "seeded@example.com";

// Signed-in contexts. email_verified matters: the rules ignore unverified addresses.
const stranger = () => env.unauthenticatedContext().firestore();
const asUser = (uid, email, verified = true) =>
  env.authenticatedContext(uid, email ? { email, email_verified: verified } : {}).firestore();

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "admins", ADMIN_EMAIL), { role: "administrator" });
    await setDoc(doc(db, "profiles/approved1"), { fullName: "Approved Alumnus", status: "approved", isDistinguished: true, userId: null, headline: "Seed entrepreneur" });
    await setDoc(doc(db, "profiles/approved1/private/contact"), { email: "a@example.com", phone: "99999 00000", visibility: "members", stats: [{ employees: 10, turnover: "5 Cr" }] });
    await setDoc(doc(db, "profiles/publiccard"), { fullName: "Open Alumnus", status: "approved", isDistinguished: false, userId: null });
    await setDoc(doc(db, "profiles/publiccard/private/contact"), { email: "open@example.com", visibility: "public" });
    await setDoc(doc(db, "profiles/hiddencard"), { fullName: "Private Alumnus", status: "approved", isDistinguished: false, userId: null });
    await setDoc(doc(db, "profiles/hiddencard/private/contact"), { email: "hidden@example.com", visibility: "hidden" });
    await setDoc(doc(db, "profiles/pending1"), { fullName: "New Joiner", status: "pending", isDistinguished: false, userId: "pendingUid" });
    // a verified member who owns a profile
    await setDoc(doc(db, "profiles/member1"), { fullName: "Verified Member", status: "approved", isDistinguished: false, userId: "memberUid" });
    await setDoc(doc(db, "members/memberUid"), { profileId: "member1" });
    await setDoc(doc(db, "members/pendingUid"), { profileId: "pending1" });
    // a college-listed profile waiting to be claimed
    await setDoc(doc(db, "profiles/seeded1"), { fullName: "Listed Alumnus", status: "approved", isDistinguished: true, userId: null });
    await setDoc(doc(db, "claims", SEEDED_EMAIL), { profileId: "seeded1" });
  });
}

let passed = 0, failed = 0;
async function it(name, fn) {
  try { await fn(); console.log("  ✓ " + name); passed++; }
  catch (e) { console.error("  ✗ " + name + "\n      " + (e.message || e).split("\n")[0]); failed++; }
}

await seed();

console.log("\nA stranger (nobody signed in)");
await it("can read an approved profile", () => assertSucceeds(getDoc(doc(stranger(), "profiles/approved1"))));
await it("cannot read a pending profile", () => assertFails(getDoc(doc(stranger(), "profiles/pending1"))));
await it("cannot read a members-only contact card", () => assertFails(getDoc(doc(stranger(), "profiles/approved1/private/contact"))));
await it("CAN read a card its owner made public", () => assertSucceeds(getDoc(doc(stranger(), "profiles/publiccard/private/contact"))));
await it("cannot read a hidden card", () => assertFails(getDoc(doc(stranger(), "profiles/hiddencard/private/contact"))));
await it("cannot edit anyone's profile", () => assertFails(updateDoc(doc(stranger(), "profiles/approved1"), { headline: "defaced" })));
await it("cannot create a profile", () => assertFails(setDoc(doc(stranger(), "profiles/newone"), { fullName: "X", status: "approved", isDistinguished: true, userId: null })));
await it("cannot list the claim keys (the college's email list)", () => assertFails(getDocs(collection(stranger(), "claims"))));
await it("cannot read one claim key", () => assertFails(getDoc(doc(stranger(), "claims", SEEDED_EMAIL))));
await it("cannot list members", () => assertFails(getDocs(collection(stranger(), "members"))));
await it("cannot make itself an administrator", () => assertFails(setDoc(doc(stranger(), "admins", "attacker@example.com"), { x: 1 })));

console.log("\nA signed-in person who is not yet approved");
const pending = () => asUser("pendingUid", "pending@example.com");
await it("can read their own pending profile", () => assertSucceeds(getDoc(doc(pending(), "profiles/pending1"))));
await it("cannot read a members-only contact card", () => assertFails(getDoc(doc(pending(), "profiles/approved1/private/contact"))));
await it("can edit their own profile", () => assertSucceeds(updateDoc(doc(pending(), "profiles/pending1"), { headline: "Agronomist" })));
await it("cannot approve themselves", () => assertFails(updateDoc(doc(pending(), "profiles/pending1"), { status: "approved" })));
await it("cannot award themselves the Pride badge", () => assertFails(updateDoc(doc(pending(), "profiles/pending1"), { isDistinguished: true })));
await it("cannot edit somebody else's profile", () => assertFails(updateDoc(doc(pending(), "profiles/approved1"), { headline: "defaced" })));
await it("cannot take over an unclaimed profile that is not theirs", () => assertFails(updateDoc(doc(pending(), "profiles/seeded1"), { userId: "pendingUid" })));

console.log("\nA verified member");
const member = () => asUser("memberUid", MEMBER_EMAIL);
await it("CAN read a members-only contact card", () => assertSucceeds(getDoc(doc(member(), "profiles/approved1/private/contact"))));
await it("cannot read a hidden card", () => assertFails(getDoc(doc(member(), "profiles/hiddencard/private/contact"))));
await it("can edit their own contact card", () => assertSucceeds(setDoc(doc(member(), "profiles/member1/private/contact"), { email: MEMBER_EMAIL, visibility: "members" })));
await it("cannot edit somebody else's contact card", () => assertFails(setDoc(doc(member(), "profiles/approved1/private/contact"), { email: "x@example.com", visibility: "public" })));
await it("cannot edit somebody else's profile", () => assertFails(updateDoc(doc(member(), "profiles/approved1"), { headline: "defaced" })));
await it("cannot delete somebody else's profile", () => assertFails(deleteDoc(doc(member(), "profiles/approved1"))));
await it("cannot suspend another member", () => assertFails(updateDoc(doc(member(), "profiles/approved1"), { status: "suspended" })));
await it("cannot make itself an administrator", () => assertFails(setDoc(doc(member(), "admins", MEMBER_EMAIL), { x: 1 })));
await it("cannot read the claim keys", () => assertFails(getDoc(doc(member(), "claims", SEEDED_EMAIL))));

console.log("\nClaiming a profile from the college's list");
const seededPerson = () => asUser("seededUid", SEEDED_EMAIL);
await it("the listed alumnus can read their own claim key", () => assertSucceeds(getDoc(doc(seededPerson(), "claims", SEEDED_EMAIL))));
await it("and can take over the profile the college recorded for them", () => assertSucceeds(updateDoc(doc(seededPerson(), "profiles/seeded1"), { userId: "seededUid" })));
await it("but cannot also award themselves the badge while claiming", async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), "profiles/seeded1"), { fullName: "Listed Alumnus", status: "approved", isDistinguished: false, userId: null }));
  await assertFails(updateDoc(doc(seededPerson(), "profiles/seeded1"), { userId: "seededUid", isDistinguished: true }));
});
await it("somebody with an unverified email cannot claim it", () => assertFails(updateDoc(doc(asUser("fakeUid", SEEDED_EMAIL, false), "profiles/seeded1"), { userId: "fakeUid" })));

console.log("\nAn administrator");
const admin = () => asUser("adminUid", ADMIN_EMAIL);
await it("can approve a pending member", () => assertSucceeds(updateDoc(doc(admin(), "profiles/pending1"), { status: "approved" })));
await it("can award the Pride of CPCA badge", () => assertSucceeds(updateDoc(doc(admin(), "profiles/pending1"), { isDistinguished: true })));
await it("can read any contact card", () => assertSucceeds(getDoc(doc(admin(), "profiles/hiddencard/private/contact"))));
await it("can import a profile and its claim key", async () => {
  await assertSucceeds(setDoc(doc(admin(), "profiles/imported1"), { fullName: "Imported", status: "approved", isDistinguished: true, userId: null }));
  await assertSucceeds(setDoc(doc(admin(), "claims", "imported@example.com"), { profileId: "imported1" }));
});
await it("can appoint another administrator", () => assertSucceeds(setDoc(doc(admin(), "admins", "second@example.com"), { role: "administrator" })));
await it("an administrator with an UNVERIFIED email gets nothing", () =>
  assertFails(updateDoc(doc(asUser("adminUid", ADMIN_EMAIL, false), "profiles/approved1"), { status: "suspended" })));

console.log(`\n${passed} passed, ${failed} failed\n`);
await env.cleanup();
process.exit(failed ? 1 : 0);
