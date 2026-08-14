import { getApps, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

/*
 * Browser tests opt into local Firebase emulators explicitly. Production and
 * ordinary development continue to use the configured Firebase project.
 */
if (
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
) {
  const emulatorHost =
    process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST ||
    "127.0.0.1";

  connectAuthEmulator(
    auth,
    `http://${emulatorHost}:9099`,
    { disableWarnings: true }
  );

  connectFirestoreEmulator(
    db,
    emulatorHost,
    8080
  );
}
