import "server-only";

import {
  applicationDefault,
  getApps,
  initializeApp,
} from "firebase-admin/app";

import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const expectedFirebaseAdminProjectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID ??
  "proveit-internal";

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: applicationDefault(),
        projectId:
          expectedFirebaseAdminProjectId,
      });

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);

// This is intentionally safe to include in operational diagnostics. It is
// configuration metadata, not a credential.
export const firebaseAdminProjectId =
  adminApp.options.projectId ??
  expectedFirebaseAdminProjectId;
