"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  onAuthStateChanged,
  User,
} from "firebase/auth";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import {
  auth,
  db,
} from "@/lib/firebase";

import {
  ProveItUser,
  UserGroup,
} from "@/types/user";

type AuthContextValue = {
  firebaseUser: User | null;
  profile: ProveItUser | null;
  loading: boolean;

  /*
   * Allows us to reload the employee's
   * Firestore profile after they change
   * their password.
   */
  refreshProfile: () => Promise<void>;
};

const AuthContext =
  createContext<AuthContextValue>({
    firebaseUser: null,
    profile: null,
    loading: true,
    refreshProfile: async () => {},
  });

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [
    firebaseUser,
    setFirebaseUser,
  ] = useState<User | null>(
    null
  );

  const [
    profile,
    setProfile,
  ] =
    useState<ProveItUser | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  /*
   * Loads the employee profile stored
   * in Firestore.
   */
  async function loadProfile(
    user: User
  ) {
    const userRef =
      doc(
        db,
        "users",
        user.uid
      );

    const userSnap =
      await getDoc(userRef);

    if (!userSnap.exists()) {
      setProfile(null);
      return;
    }

    const data =
      userSnap.data();

    setProfile({
      uid:
        user.uid,

      employeeId:
        data.employeeId || "",

      name:
        data.name || "",

      email:
        data.email ||
        undefined,

      phoneNumber:
        data.phoneNumber ||
        undefined,

      department:
        data.department ||
        undefined,

      /*
       * Firestore currently stores this
       * field as "role".
       *
       * The frontend calls it "group".
       */
      group:
        data.role as UserGroup,

      active:
        data.active === true,

      capabilities:
        data.capabilities || undefined,

      /*
       * Existing employees that do not
       * yet have this Firestore field
       * are treated as NOT requiring
       * a password change.
       *
       * This prevents existing accounts
       * from suddenly being locked out.
       */
      mustChangePassword:
        data.mustChangePassword ===
        true,

      workspaceMemberships:
        data.workspaceMemberships ||
        undefined,

      createdAt:
        data.createdAt?.toDate(),

      updatedAt:
        data.updatedAt?.toDate(),
    });
  }

  /*
   * Used after password setup/reset
   * to immediately reload the user's
   * Firestore profile.
   */
  async function refreshProfile() {
    const currentUser =
      auth.currentUser;

    if (!currentUser) {
      setProfile(null);
      return;
    }

    try {
      await loadProfile(
        currentUser
      );
    } catch (error) {
      console.error(
        "Failed to refresh user profile:",
        error
      );

      setProfile(null);
    }
  }

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          setFirebaseUser(
            user
          );

          if (!user) {
            setProfile(null);
            setLoading(false);
            return;
          }

          try {
            setLoading(true);

            await loadProfile(
              user
            );
          } catch (error) {
            console.error(
              "Failed to load user profile:",
              error
            );

            setProfile(null);
          } finally {
            setLoading(false);
          }
        }
      );

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(
    AuthContext
  );
}
