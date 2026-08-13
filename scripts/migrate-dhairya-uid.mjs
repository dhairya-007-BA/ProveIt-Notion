import fs from "node:fs";

import {
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";

import {
  getAuth,
} from "firebase-admin/auth";

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

// ─────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────

// Old Firestore document containing
// Dhairya's original employee profile.
const OLD_UID =
  "Igrfte5FT4b0Qhi2A3IhGw6rjxw1";

// Dhairya's CURRENT Firebase Auth UID.
const NEW_UID =
  "M9KQhZF8rvRREsgDrTah80LEx513";

// ─────────────────────────────────────────────
// CREDENTIALS
// ─────────────────────────────────────────────

const serviceAccountPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!serviceAccountPath) {
  throw new Error(
    "GOOGLE_APPLICATION_CREDENTIALS is not set."
  );
}

const serviceAccount = JSON.parse(
  fs.readFileSync(
    serviceAccountPath,
    "utf8"
  )
);

// ─────────────────────────────────────────────
// FIREBASE ADMIN
// ─────────────────────────────────────────────

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount),
      });

const auth = getAuth(app);
const db = getFirestore(app);

// ─────────────────────────────────────────────
// MIGRATION
// ─────────────────────────────────────────────

async function migrate() {
  console.log("");
  console.log(
    "Starting Dhairya UID migration..."
  );

  console.log("Old UID:", OLD_UID);
  console.log("New UID:", NEW_UID);

  // ───────────────────────────────────────────
  // VERIFY CURRENT AUTH ACCOUNT
  // ───────────────────────────────────────────

  const authUser =
    await auth.getUser(NEW_UID);

  console.log("");
  console.log(
    "Current Authentication user found:"
  );

  console.log(authUser.uid);

  // ───────────────────────────────────────────
  // LOAD OLD FIRESTORE PROFILE
  // ───────────────────────────────────────────

  const oldUserRef =
    db.collection("users").doc(OLD_UID);

  const oldUserSnapshot =
    await oldUserRef.get();

  if (!oldUserSnapshot.exists) {
    throw new Error(
      "Old Dhairya Firestore profile was not found."
    );
  }

  const oldUser =
    oldUserSnapshot.data();

  // Safety check.
  if (
    oldUser?.employeeId !== "2-001" ||
    oldUser?.role !== "bod"
  ) {
    throw new Error(
      "Safety check failed. The old profile is not the expected 2-001 BOD profile."
    );
  }

  console.log("");
  console.log(
    "Old Firestore profile verified:"
  );

  console.log(
    oldUser.name,
    oldUser.employeeId,
    oldUser.role
  );

  // ───────────────────────────────────────────
  // CHECK DESTINATION
  // ───────────────────────────────────────────

  const newUserRef =
    db.collection("users").doc(NEW_UID);

  const newUserSnapshot =
    await newUserRef.get();

  if (newUserSnapshot.exists) {
    throw new Error(
      "A Firestore profile already exists under the new UID. Migration stopped to avoid overwriting it."
    );
  }

  // ───────────────────────────────────────────
  // CHECK OLD MEMBERSHIPS
  // ───────────────────────────────────────────

  const membershipsSnapshot =
    await db
      .collection(
        "workspaceMemberships"
      )
      .where(
        "userId",
        "==",
        OLD_UID
      )
      .get();

  console.log("");
  console.log(
    "Old explicit memberships found:",
    membershipsSnapshot.size
  );

  // ───────────────────────────────────────────
  // WRITE MIGRATION
  // ───────────────────────────────────────────

  const batch = db.batch();

  batch.set(newUserRef, {
    ...oldUser,

    migratedFromUid: OLD_UID,

    migratedAt:
      FieldValue.serverTimestamp(),

    updatedAt:
      FieldValue.serverTimestamp(),
  });

  // BOD access in our architecture is
  // role-based, so stale explicit memberships
  // referencing the old UID are unnecessary.
  membershipsSnapshot.docs.forEach(
    (membershipDocument) => {
      batch.delete(
        membershipDocument.ref
      );
    }
  );

  await batch.commit();

  console.log("");
  console.log(
    "New Firestore profile created."
  );

  // ───────────────────────────────────────────
  // VERIFY RESULT
  // ───────────────────────────────────────────

  const verificationSnapshot =
    await newUserRef.get();

  if (!verificationSnapshot.exists) {
    throw new Error(
      "Verification failed: new Firestore profile does not exist."
    );
  }

  const verification =
    verificationSnapshot.data();

  if (
    verification?.employeeId !==
      "2-001" ||
    verification?.role !== "bod" ||
    verification?.active !== true
  ) {
    throw new Error(
      "Verification failed: migrated profile does not contain the expected active BOD data."
    );
  }

  console.log("");
  console.log(
    "Migration verification passed."
  );

  console.log("");
  console.log(
    "OLD profile retained:",
    OLD_UID
  );

  console.log(
    "NEW profile created:",
    NEW_UID
  );

  console.log("");
  console.log(
    "Do NOT delete the old profile yet."
  );

  console.log(
    "First sign in as Dhairya and verify BOD access."
  );
}

migrate()
  .then(() => {
    console.log("");
    console.log(
      "Migration completed successfully."
    );

    process.exit(0);
  })
  .catch((error) => {
    console.error("");
    console.error(
      "Migration failed:"
    );

    console.error(error);

    process.exit(1);
  });