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
    // a second joiner who is never approved during these tests, so chat-room checks stay honest
    await setDoc(doc(db, "profiles/pending2"), { fullName: "Still Waiting", status: "pending", isDistinguished: false, userId: "pendingUid2" });
    await setDoc(doc(db, "members/pendingUid2"), { profileId: "pending2" });
    // a college-listed profile waiting to be claimed
    await setDoc(doc(db, "profiles/seeded1"), { fullName: "Listed Alumnus", status: "approved", isDistinguished: true, userId: null });
    await setDoc(doc(db, "claims", SEEDED_EMAIL), { profileId: "seeded1" });
    // a chat room with one message from the member and one from somebody else
    await setDoc(doc(db, "rooms/r1"), { name: "Batch of 2004", kind: "Batch", messageCount: 0 });
    await setDoc(doc(db, "rooms/r1/messages/m1"), { text: "hello", authorId: "memberUid", authorName: "Verified Member", createdAt: 1 });
    await setDoc(doc(db, "rooms/r1/messages/m5"), { text: "theirs", authorId: "otherUid", authorName: "Other", createdAt: 5 });
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

console.log("\nAnnouncements");
await it("anyone can read the noticeboard", () => assertSucceeds(getDoc(doc(stranger(), "announcements/x"))));
await it("a stranger cannot post one", () => assertFails(setDoc(doc(stranger(), "announcements/x"), { title: "Fake", body: "b" })));
await it("an ordinary member cannot post one", () => assertFails(setDoc(doc(member(), "announcements/y"), { title: "Fake", body: "b" })));
await it("an administrator can post one", () => assertSucceeds(setDoc(doc(admin(), "announcements/z"), { title: "Notice", body: "b", createdAt: 1 })));

// ── Messages an administrator sends to one member ──
// Unlike the noticeboard these hold a member's own email address, so they must never be public.
const AMSG = { profileId: "pending1", to: "new@example.com", subject: "About your degree", body: "Which year?", createdAt: 1, sentAt: null };
await it("a stranger cannot read a message sent to a member", () => assertFails(getDoc(doc(stranger(), "messages/m1"))));
await it("a stranger cannot write one", () => assertFails(setDoc(doc(stranger(), "messages/m1"), AMSG)));
await it("an ordinary member cannot read them", () => assertFails(getDoc(doc(member(), "messages/m1"))));
await it("an ordinary member cannot read the whole list", () => assertFails(getDocs(collection(member(), "messages"))));
await it("an ordinary member cannot write one", () => assertFails(setDoc(doc(member(), "messages/m2"), AMSG)));
await it("the member it is about still cannot read it", () => assertFails(getDoc(doc(asUser("pendingUid", "new@example.com"), "messages/m1"))));
await it("an administrator can send one", () => assertSucceeds(setDoc(doc(admin(), "messages/m1"), AMSG)));
await it("an administrator can read them", () => assertSucceeds(getDoc(doc(admin(), "messages/m1"))));
await it("nobody can rewrite a message after it is sent, not even an administrator",
  () => assertFails(updateDoc(doc(admin(), "messages/m1"), { body: "changed" })));
await it("an administrator can delete one", () => assertSucceeds(deleteDoc(doc(admin(), "messages/m1"))));

console.log("\nChat rooms");
await it("a stranger cannot read a room", () => assertFails(getDoc(doc(stranger(), "rooms/r1"))));
await it("a stranger cannot read its messages", () => assertFails(getDoc(doc(stranger(), "rooms/r1/messages/m1"))));
await it("someone not yet approved cannot read messages", () => assertFails(getDoc(doc(asUser("pendingUid2", "waiting@example.com"), "rooms/r1/messages/m1"))));
await it("someone not yet approved cannot read the room", () => assertFails(getDoc(doc(asUser("pendingUid2", "waiting@example.com"), "rooms/r1"))));
await it("someone not yet approved cannot post", () => assertFails(setDoc(doc(asUser("pendingUid2", "waiting@example.com"), "rooms/r1/messages/m9"), { text: "hi", authorId: "pendingUid2", authorName: "W", createdAt: 9 })));
await it("a verified member CAN read messages", () => assertSucceeds(getDoc(doc(member(), "rooms/r1/messages/m1"))));
await it("a verified member can post a message", () => assertSucceeds(setDoc(doc(member(), "rooms/r1/messages/m2"), { text: "hi", authorId: "memberUid", authorName: "Verified Member", createdAt: 2 })));
await it("but cannot post one under somebody else's name", () => assertFails(setDoc(doc(member(), "rooms/r1/messages/m3"), { text: "hi", authorId: "someoneElse", authorName: "X", createdAt: 3 })));
await it("cannot post an empty message", () => assertFails(setDoc(doc(member(), "rooms/r1/messages/m4"), { text: "", authorId: "memberUid", authorName: "V", createdAt: 4 })));
await it("cannot edit a message after posting", () => assertFails(updateDoc(doc(member(), "rooms/r1/messages/m1"), { text: "changed" })));
await it("can delete their own message", () => assertSucceeds(deleteDoc(doc(member(), "rooms/r1/messages/m2"))));
await it("cannot delete somebody else's", () => assertFails(deleteDoc(doc(member(), "rooms/r1/messages/m5"))));
await it("an administrator can delete any message", () => assertSucceeds(deleteDoc(doc(admin(), "rooms/r1/messages/m5"))));
await it("a member cannot rename a room", () => assertFails(updateDoc(doc(member(), "rooms/r1"), { name: "Hijacked" })));
await it("a member cannot create a room", () => assertFails(setDoc(doc(member(), "rooms/r2"), { name: "Mine", kind: "Batch" })));
await it("an administrator can create a room", () => assertSucceeds(setDoc(doc(admin(), "rooms/r3"), { name: "Seeds", kind: "Subject / Discipline", messageCount: 0 })));

console.log(`\n${passed} passed, ${failed} failed\n`);
await env.cleanup();
process.exit(failed ? 1 : 0);
