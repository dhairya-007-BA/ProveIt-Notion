import "server-only";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";

import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const expectedFirebaseAdminProjectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID ??
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
  (process.env.FIRESTORE_EMULATOR_HOST
    ? "proveit-test"
    : undefined) ??
  "proveit-internal";

const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

const credential =
  clientEmail && privateKey
    ? cert({
        projectId: expectedFirebaseAdminProjectId,
        clientEmail,
        privateKey,
      })
    : applicationDefault();

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential,
        projectId: expectedFirebaseAdminProjectId,
      });

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);

export const firebaseAdminProjectId =
  adminApp.options.projectId ??
  expectedFirebaseAdminProjectId;