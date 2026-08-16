"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";

import {
  createMembership,
  getMembershipsForWorkspace,
  removeMembership,
  updateMembershipRole,
} from "@/lib/memberships";

import { getUsers } from "@/lib/users";

import {
  MembershipRole,
  WorkspaceMembership,
} from "@/types/membership";

import { ProveItUser } from "@/types/user";

interface WorkspaceMembersProps {
  workspaceId: string;
  workspaceName: string;
}

const ROLE_OPTIONS: MembershipRole[] = [
  "viewer",
  "member",
  "manager",
  "admin",
];

export default function WorkspaceMembers({
  workspaceId,
  workspaceName,
}: WorkspaceMembersProps) {
  const { profile } = useAuth();

  const [memberships, setMemberships] = useState<
    WorkspaceMembership[]
  >([]);

  const [users, setUsers] = useState<ProveItUser[]>([]);

  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const [selectedUserId, setSelectedUserId] =
    useState("");

  const [selectedRole, setSelectedRole] =
    useState<MembershipRole>("member");

  const isBOD = profile?.group === "bod";

  async function loadData() {
    if (!isBOD) {
      return;
    }

    try {
      setLoading(true);

      const [membershipData, userData] =
        await Promise.all([
          getMembershipsForWorkspace(workspaceId),
          getUsers(),
        ]);

      setMemberships(membershipData);
      setUsers(userData);
    } catch (error) {
      console.error(
        "Failed to load workspace members:",
        error
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
    // loadData uses the current workspace/profile inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, isBOD]);

  async function handleAddMember() {
    if (
      !profile ||
      !isBOD ||
      !selectedUserId
    ) {
      return;
    }

    try {
      await createMembership({
        workspaceId,
        userId: selectedUserId,
        role: selectedRole,
        createdBy: profile.uid,
      });

      setSelectedUserId("");
      setSelectedRole("member");
      setAdding(false);

      await loadData();
    } catch (error) {
      console.error(
        "Failed to add workspace member:",
        error
      );
    }
  }

  async function handleRoleChange(
    membershipId: string,
    role: MembershipRole
  ) {
    if (!isBOD) {
      return;
    }

    try {
      await updateMembershipRole(
        membershipId,
        role
      );

      await loadData();
    } catch (error) {
      console.error(
        "Failed to change membership role:",
        error
      );
    }
  }

  async function handleRemoveMember(
    membershipId: string
  ) {
    if (!isBOD) {
      return;
    }

    try {
      await removeMembership(membershipId);

      await loadData();
    } catch (error) {
      console.error(
        "Failed to remove workspace member:",
        error
      );
    }
  }

  function getUser(userId: string) {
    return users.find(
      (user) => user.uid === userId
    );
  }

  const availableUsers = users.filter(
    (user) =>
      user.active &&
      user.group !== "bod" &&
      !memberships.some(
        (membership) =>
          membership.userId === user.uid
      )
  );

  if (!isBOD) {
    return null;
  }

  if (workspaceId === "board") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold">
          Board access
        </h2>

        <p className="mt-2 text-sm leading-6 text-gray-500">
          Access to the Board workspace is controlled by
          the organization-level BOD role. Regular employees
          cannot be manually added to this workspace.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
        <div>
          <h2 className="text-lg font-semibold">
            Members
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Manage access to {workspaceName}.
          </p>
        </div>

        {workspaceId !== "company" && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Add member
          </button>
        )}
      </div>

      {workspaceId === "company" && (
        <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
          <p className="text-sm text-gray-600">
            Company is available automatically to every
            active ProveIt employee.
          </p>
        </div>
      )}

      {adding && (
        <div className="border-b border-gray-100 bg-gray-50 px-6 py-5">
          <div className="flex gap-3">
            <select
              value={selectedUserId}
              onChange={(event) =>
                setSelectedUserId(
                  event.target.value
                )
              }
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">
                Select employee
              </option>

              {availableUsers.map((user) => (
                <option
                  key={user.uid}
                  value={user.uid}
                >
                  {user.name} — {user.employeeId}
                </option>
              ))}
            </select>

            <select
              value={selectedRole}
              onChange={(event) =>
                setSelectedRole(
                  event.target.value as MembershipRole
                )
              }
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm capitalize"
            >
              {ROLE_OPTIONS.map((role) => (
                <option
                  key={role}
                  value={role}
                >
                  {role}
                </option>
              ))}
            </select>

            <button
              onClick={() => {
                setAdding(false);
                setSelectedUserId("");
                setSelectedRole("member");
              }}
              className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-200"
            >
              Cancel
            </button>

            <button
              onClick={handleAddMember}
              disabled={!selectedUserId}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-6 text-sm text-gray-500">
          Loading members...
        </div>
      ) : memberships.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm font-medium">
            No explicit members
          </p>

          <p className="mt-1 text-sm text-gray-500">
            BOD members still have administrative
            access automatically.
          </p>
        </div>
      ) : (
        <div>
          {memberships.map((membership) => {
            const user = getUser(
              membership.userId
            );

            return (
              <div
                key={membership.id}
                className="flex items-center justify-between border-b border-gray-100 px-6 py-4 last:border-b-0"
              >
                <div>
                  <p className="font-medium">
                    {user?.name ||
                      "Unknown employee"}
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    {user?.employeeId ||
                      membership.userId}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={membership.role}
                    onChange={(event) =>
                      handleRoleChange(
                        membership.id,
                        event.target
                          .value as MembershipRole
                      )
                    }
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm capitalize"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option
                        key={role}
                        value={role}
                      >
                        {role}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() =>
                      handleRemoveMember(
                        membership.id
                      )
                    }
                    className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
