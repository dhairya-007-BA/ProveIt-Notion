"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import Sidebar from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";

type PropertyType =
  | "title"
  | "text"
  | "number"
  | "select"
  | "date"
  | "checkbox"
  | "url"
  | "email"
  | "phone";

interface DatabaseProperty {
  id: string;
  name: string;
  type: PropertyType;
}

interface DatabaseData {
  name: string;
  description: string;
  workspaceId: string;
  createdBy: string;
  properties: DatabaseProperty[];
}

interface DatabaseRow {
  id: string;
  values: Record<string, string | number | boolean>;
  createdAt?: Date;
  updatedAt?: Date;
}

export default function DatabasePage() {
  const params = useParams<{
    workspaceId: string;
    databaseId: string;
  }>();

  const router = useRouter();

  const {
    firebaseUser,
    profile,
    loading: authLoading,
  } = useAuth();

  const workspaceId = params.workspaceId;
  const databaseId = params.databaseId;

  const [database, setDatabase] =
    useState<DatabaseData | null>(null);

  const [rows, setRows] =
    useState<DatabaseRow[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [creatingRow, setCreatingRow] =
    useState(false);

  const [addingProperty, setAddingProperty] =
    useState(false);

  const [propertyName, setPropertyName] =
    useState("");

  const [propertyType, setPropertyType] =
    useState<PropertyType>("text");

  /*
   * Property editor
   */

  const [editingProperty, setEditingProperty] =
    useState<DatabaseProperty | null>(null);

  const [editPropertyName, setEditPropertyName] =
    useState("");

  const [editPropertyType, setEditPropertyType] =
    useState<PropertyType>("text");

  const [savingProperty, setSavingProperty] =
    useState(false);

  /*
   * Authentication
   */

  useEffect(() => {
    if (!authLoading && !firebaseUser) {
      router.replace("/login");
    }
  }, [
    authLoading,
    firebaseUser,
    router,
  ]);

  /*
   * Load database
   */

  useEffect(() => {
    if (
      authLoading ||
      !firebaseUser ||
      !profile ||
      !databaseId
    ) {
      return;
    }

    async function loadDatabase() {
      try {
        setLoading(true);
        setError("");

        const databaseRef = doc(
          db,
          "databases",
          databaseId
        );

        const snapshot =
          await getDoc(databaseRef);

        if (!snapshot.exists()) {
          setError("Database not found.");
          setLoading(false);
          return;
        }

        const data = snapshot.data();

        setDatabase({
          name:
            data.name ||
            "Untitled database",

          description:
            data.description || "",

          workspaceId:
            data.workspaceId,

          createdBy:
            data.createdBy,

          properties:
            data.properties || [
              {
                id: "title",
                name: "Name",
                type: "title",
              },
            ],
        });
      } catch (error) {
        console.error(
          "Failed to load database:",
          error
        );

        setError(
          "Database could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDatabase();
  }, [
    authLoading,
    firebaseUser,
    profile,
    databaseId,
  ]);

  /*
   * Realtime rows
   */

  useEffect(() => {
    if (!firebaseUser || !databaseId) {
      return;
    }

    const rowsQuery = query(
      collection(
        db,
        "databases",
        databaseId,
        "rows"
      ),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      rowsQuery,

      (snapshot) => {
        const results =
          snapshot.docs.map(
            (rowSnapshot) => {
              const data =
                rowSnapshot.data();

              return {
                id: rowSnapshot.id,

                values:
                  data.values || {},

                createdAt:
                  data.createdAt
                    ?.toDate(),

                updatedAt:
                  data.updatedAt
                    ?.toDate(),
              };
            }
          );

        setRows(results);
      },

      (error) => {
        console.error(
          "Failed to load rows:",
          error
        );

        setError(
          "Database rows could not be loaded."
        );
      }
    );

    return () => {
      unsubscribe();
    };
  }, [
    firebaseUser,
    databaseId,
  ]);

  /*
   * Database name
   */

  async function updateDatabaseName(
    name: string
  ) {
    if (!database) {
      return;
    }

    setDatabase({
      ...database,
      name,
    });

    try {
      await updateDoc(
        doc(
          db,
          "databases",
          databaseId
        ),
        {
          name,
          updatedAt:
            serverTimestamp(),
        }
      );
    } catch (error) {
      console.error(
        "Failed to update database name:",
        error
      );

      setError(
        "Database name could not be saved."
      );
    }
  }

  /*
   * Database description
   */

  async function updateDescription(
    description: string
  ) {
    if (!database) {
      return;
    }

    setDatabase({
      ...database,
      description,
    });

    try {
      await updateDoc(
        doc(
          db,
          "databases",
          databaseId
        ),
        {
          description,
          updatedAt:
            serverTimestamp(),
        }
      );
    } catch (error) {
      console.error(
        "Failed to update description:",
        error
      );

      setError(
        "Description could not be saved."
      );
    }
  }

  /*
   * Create row
   */

  async function createRow() {
    if (
      !firebaseUser ||
      creatingRow
    ) {
      return;
    }

    try {
      setCreatingRow(true);
      setError("");

      const initialValues:
        Record<
          string,
          string | number | boolean
        > = {};

      database?.properties.forEach(
        (property) => {
          if (
            property.type ===
            "checkbox"
          ) {
            initialValues[
              property.id
            ] = false;
          } else {
            initialValues[
              property.id
            ] = "";
          }
        }
      );

      await addDoc(
        collection(
          db,
          "databases",
          databaseId,
          "rows"
        ),
        {
          values:
            initialValues,

          createdBy:
            firebaseUser.uid,

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );
    } catch (error) {
      console.error(
        "Failed to create row:",
        error
      );

      setError(
        "Row could not be created."
      );
    } finally {
      setCreatingRow(false);
    }
  }

  /*
   * Update cell
   */

  async function updateCell(
    rowId: string,
    propertyId: string,
    value:
      | string
      | number
      | boolean
  ) {
    setRows(
      (currentRows) =>
        currentRows.map(
          (row) => {
            if (row.id !== rowId) {
              return row;
            }

            return {
              ...row,

              values: {
                ...row.values,
                [propertyId]:
                  value,
              },
            };
          }
        )
    );

    try {
      const rowRef = doc(
        db,
        "databases",
        databaseId,
        "rows",
        rowId
      );

      await updateDoc(
        rowRef,
        {
          [`values.${propertyId}`]:
            value,

          updatedAt:
            serverTimestamp(),
        }
      );
    } catch (error) {
      console.error(
        "Failed to update cell:",
        error
      );

      setError(
        "Cell could not be saved."
      );
    }
  }

  /*
   * Delete row
   */

  async function removeRow(
    rowId: string
  ) {
    const confirmed =
      window.confirm(
        "Delete this row?"
      );

    if (!confirmed) {
      return;
    }

    try {
      await deleteDoc(
        doc(
          db,
          "databases",
          databaseId,
          "rows",
          rowId
        )
      );
    } catch (error) {
      console.error(
        "Failed to delete row:",
        error
      );

      setError(
        "Row could not be deleted."
      );
    }
  }

  /*
   * Open property editor
   */

  function openPropertyEditor(
    property: DatabaseProperty
  ) {
    setEditingProperty(property);

    setEditPropertyName(
      property.name
    );

    setEditPropertyType(
      property.type
    );
  }

  /*
   * Create property
   */

  async function createProperty() {
    if (
      !database ||
      !propertyName.trim()
    ) {
      return;
    }

    const propertyId =
      `property_${Date.now()}`;

    const newProperty:
      DatabaseProperty = {
        id: propertyId,

        name:
          propertyName.trim(),

        type:
          propertyType,
      };

    const newProperties = [
      ...database.properties,
      newProperty,
    ];

    try {
      await updateDoc(
        doc(
          db,
          "databases",
          databaseId
        ),
        {
          properties:
            newProperties,

          updatedAt:
            serverTimestamp(),
        }
      );

      setDatabase({
        ...database,

        properties:
          newProperties,
      });

      setPropertyName("");
      setPropertyType("text");
      setAddingProperty(false);
    } catch (error) {
      console.error(
        "Failed to create property:",
        error
      );

      setError(
        "Property could not be created."
      );
    }
  }

  /*
   * Save property
   */

  async function saveProperty() {
    if (
      !database ||
      !editingProperty ||
      !editPropertyName.trim() ||
      savingProperty
    ) {
      return;
    }

    try {
      setSavingProperty(true);
      setError("");

      const newProperties =
        database.properties.map(
          (property) => {
            if (
              property.id !==
              editingProperty.id
            ) {
              return property;
            }

            return {
              ...property,

              name:
                editPropertyName.trim(),

              /*
               * The title column must
               * remain a title.
               */
              type:
                property.type === "title"
                  ? "title"
                  : editPropertyType,
            };
          }
        );

      await updateDoc(
        doc(
          db,
          "databases",
          databaseId
        ),
        {
          properties:
            newProperties,

          updatedAt:
            serverTimestamp(),
        }
      );

      setDatabase({
        ...database,
        properties:
          newProperties,
      });

      setEditingProperty(null);
    } catch (error) {
      console.error(
        "Failed to update property:",
        error
      );

      setError(
        "Property could not be updated."
      );
    } finally {
      setSavingProperty(false);
    }
  }

  /*
   * Delete property
   */

  async function removeProperty() {
    if (
      !database ||
      !editingProperty
    ) {
      return;
    }

    /*
     * Protect primary title column.
     */
    if (
      editingProperty.type ===
      "title"
    ) {
      setError(
        "The Name property cannot be deleted."
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${editingProperty.name}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setSavingProperty(true);
      setError("");

      const newProperties =
        database.properties.filter(
          (property) =>
            property.id !==
            editingProperty.id
        );

      await updateDoc(
        doc(
          db,
          "databases",
          databaseId
        ),
        {
          properties:
            newProperties,

          updatedAt:
            serverTimestamp(),
        }
      );

      setDatabase({
        ...database,

        properties:
          newProperties,
      });

      setEditingProperty(null);
    } catch (error) {
      console.error(
        "Failed to delete property:",
        error
      );

      setError(
        "Property could not be deleted."
      );
    } finally {
      setSavingProperty(false);
    }
  }

  /*
   * Render database cell
   */

  function renderCell(
    row: DatabaseRow,
    property: DatabaseProperty
  ) {
    const value =
      row.values[property.id];

    if (
      property.type ===
      "checkbox"
    ) {
      return (
        <div className="flex h-full items-center justify-center">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) =>
              updateCell(
                row.id,
                property.id,
                event.target.checked
              )
            }
            className="h-4 w-4 cursor-pointer"
          />
        </div>
      );
    }

    if (
      property.type ===
      "number"
    ) {
      return (
        <input
          type="number"
          value={
            value === undefined
              ? ""
              : String(value)
          }
          onChange={(event) =>
            updateCell(
              row.id,
              property.id,

              event.target.value === ""
                ? ""
                : Number(
                    event.target.value
                  )
            )
          }
          className="h-full w-full bg-transparent px-3 py-2 text-sm outline-none"
          placeholder="Empty"
        />
      );
    }

    if (
      property.type ===
      "date"
    ) {
      return (
        <input
          type="date"
          value={
            typeof value === "string"
              ? value
              : ""
          }
          onChange={(event) =>
            updateCell(
              row.id,
              property.id,
              event.target.value
            )
          }
          className="h-full w-full bg-transparent px-3 py-2 text-sm outline-none"
        />
      );
    }

    if (
      property.type ===
      "select"
    ) {
      return (
        <input
          type="text"
          value={
            typeof value === "string"
              ? value
              : ""
          }
          onChange={(event) =>
            updateCell(
              row.id,
              property.id,
              event.target.value
            )
          }
          placeholder="Select..."
          className="h-full w-full bg-transparent px-3 py-2 text-sm outline-none"
        />
      );
    }

    return (
      <input
        type={
          property.type === "email"
            ? "email"
            : property.type === "url"
              ? "url"
              : property.type === "phone"
                ? "tel"
                : "text"
        }
        value={
          typeof value === "string"
            ? value
            : value === undefined
              ? ""
              : String(value)
        }
        onChange={(event) =>
          updateCell(
            row.id,
            property.id,
            event.target.value
          )
        }
        placeholder={
          property.type === "title"
            ? "Untitled"
            : "Empty"
        }
        className={`h-full w-full bg-transparent px-3 py-2 text-sm outline-none ${
          property.type === "title"
            ? "font-medium"
            : ""
        }`}
      />
    );
  }

  /*
   * Loading
   */

  if (
    authLoading ||
    loading
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">
          Loading database...
        </p>
      </main>
    );
  }

  if (
    !firebaseUser ||
    !profile
  ) {
    return null;
  }

  /*
   * Missing database
   */

  if (!database) {
    return (
      <main className="flex min-h-screen bg-gray-50">
        <Sidebar />

        <section className="flex-1 p-10">
          <div className="mx-auto max-w-6xl">

            <Link
              href={`/workspaces/${workspaceId}/databases`}
              className="text-sm text-gray-500"
            >
              ← Back to databases
            </Link>

            <div className="mt-10 rounded-xl border border-gray-200 bg-white p-8">

              <p className="text-red-600">
                {error ||
                  "Database not found."}
              </p>

            </div>

          </div>
        </section>
      </main>
    );
  }

  /*
   * Main UI
   */

  return (
    <main className="flex min-h-screen bg-gray-50">

      <Sidebar />

      <section className="min-w-0 flex-1 overflow-hidden">

        <div className="border-b border-gray-200 bg-white px-10 py-4">

          <Link
            href={`/workspaces/${workspaceId}/databases`}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            ← Databases
          </Link>

        </div>

        <div className="px-10 py-10">

          <div className="mx-auto max-w-[1500px]">

            {error && (
              <div className="mb-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* DATABASE HEADER */}

            <div className="mb-8">

              <div className="mb-4 text-5xl">
                ▦
              </div>

              <input
                value={database.name}
                onChange={(event) =>
                  updateDatabaseName(
                    event.target.value
                  )
                }
                className="w-full border-none bg-transparent text-4xl font-bold tracking-tight text-gray-900 outline-none"
                placeholder="Untitled database"
              />

              <input
                value={
                  database.description
                }
                onChange={(event) =>
                  updateDescription(
                    event.target.value
                  )
                }
                className="mt-3 w-full border-none bg-transparent text-sm text-gray-500 outline-none"
                placeholder="Add a description..."
              />

            </div>

            {/* TOOLBAR */}

            <div className="mb-3 flex items-center justify-between">

              <div className="flex items-center gap-2">

                <button
                  type="button"
                  className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700"
                >
                  Table
                </button>

                <button
                  type="button"
                  className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                >
                  + Add view
                </button>

              </div>

              <div className="flex items-center gap-2">

                <button
                  type="button"
                  className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                >
                  Filter
                </button>

                <button
                  type="button"
                  className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                >
                  Sort
                </button>

                <button
                  type="button"
                  onClick={createRow}
                  disabled={creatingRow}
                  className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {creatingRow
                    ? "Adding..."
                    : "New"}
                </button>

              </div>

            </div>

            {/* TABLE */}

            <div className="overflow-x-auto border border-gray-200 bg-white">

              <table className="min-w-full border-collapse">

                <thead>

                  <tr className="bg-gray-50">

                    {database.properties.map(
                      (property) => (

                        <th
                          key={property.id}
                          className="min-w-[220px] border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-500"
                        >

                          <button
                            type="button"
                            onClick={() =>
                              openPropertyEditor(
                                property
                              )
                            }
                            className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-gray-100"
                            title={`Edit ${property.name}`}
                          >

                            <span className="text-gray-400">

                              {property.type === "title"
                                ? "Aa"
                                : property.type === "number"
                                  ? "#"
                                  : property.type === "date"
                                    ? "◷"
                                    : property.type === "checkbox"
                                      ? "☑"
                                      : property.type === "select"
                                        ? "●"
                                        : property.type === "url"
                                          ? "↗"
                                          : property.type === "email"
                                            ? "@"
                                            : property.type === "phone"
                                              ? "☎"
                                              : "Aa"}

                            </span>

                            <span>
                              {property.name}
                            </span>

                            <span className="ml-auto text-gray-300">
                              ▾
                            </span>

                          </button>

                        </th>

                      )
                    )}

                    <th className="w-12 border-b border-gray-200">

                      <button
                        type="button"
                        onClick={() =>
                          setAddingProperty(
                            true
                          )
                        }
                        className="flex h-full w-full items-center justify-center px-4 py-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900"
                        title="Add property"
                      >
                        +
                      </button>

                    </th>

                  </tr>

                </thead>

                <tbody>

                  {rows.map(
                    (row) => (

                      <tr
                        key={row.id}
                        className="group hover:bg-gray-50"
                      >

                        {database.properties.map(
                          (property) => (

                            <td
                              key={
                                property.id
                              }
                              className="h-10 border-b border-r border-gray-200 p-0"
                            >

                              {property.type ===
                              "title" ? (

                                <div className="flex h-full items-center">

                                  <div className="min-w-0 flex-1">
                                    {renderCell(
                                      row,
                                      property
                                    )}
                                  </div>

                                  <Link
                                    href={`/workspaces/${workspaceId}/databases/${databaseId}/rows/${row.id}`}
                                    className="mr-2 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                    title="Open row"
                                  >
                                    ↗
                                  </Link>

                                </div>

                              ) : (

                                renderCell(
                                  row,
                                  property
                                )

                              )}

                            </td>

                          )
                        )}

                        <td className="border-b border-gray-200 text-center">

                          <button
                            type="button"
                            onClick={() =>
                              removeRow(
                                row.id
                              )
                            }
                            className="px-3 text-xs text-gray-300 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
                          >
                            ×
                          </button>

                        </td>

                      </tr>

                    )
                  )}

                  {/* NEW ROW */}

                  <tr>

                    <td
                      colSpan={
                        database.properties
                          .length + 1
                      }
                      className="border-b border-gray-200"
                    >

                      <button
                        type="button"
                        onClick={createRow}
                        disabled={
                          creatingRow
                        }
                        className="w-full px-4 py-2 text-left text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                      >
                        + New
                      </button>

                    </td>

                  </tr>

                </tbody>

              </table>

            </div>

            <div className="mt-3 text-xs text-gray-400">
              {rows.length}{" "}
              {rows.length === 1
                ? "row"
                : "rows"}
            </div>

          </div>

        </div>

      </section>

      {/* CREATE PROPERTY MODAL */}

      {addingProperty && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">

          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">

            <div className="flex items-center justify-between">

              <h2 className="text-lg font-semibold">
                New property
              </h2>

              <button
                type="button"
                onClick={() =>
                  setAddingProperty(
                    false
                  )
                }
                className="text-gray-400 hover:text-gray-900"
              >
                ×
              </button>

            </div>

            <div className="mt-6">

              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Property name
              </label>

              <input
                autoFocus
                value={propertyName}
                onChange={(event) =>
                  setPropertyName(
                    event.target.value
                  )
                }
                placeholder="Property name"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />

            </div>

            <div className="mt-5">

              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Property type
              </label>

              <select
                value={propertyType}
                onChange={(event) =>
                  setPropertyType(
                    event.target
                      .value as PropertyType
                  )
                }
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
              >

                <option value="text">
                  Text
                </option>

                <option value="number">
                  Number
                </option>

                <option value="select">
                  Select
                </option>

                <option value="date">
                  Date
                </option>

                <option value="checkbox">
                  Checkbox
                </option>

                <option value="url">
                  URL
                </option>

                <option value="email">
                  Email
                </option>

                <option value="phone">
                  Phone
                </option>

              </select>

            </div>

            <div className="mt-6 flex justify-end gap-2">

              <button
                type="button"
                onClick={() =>
                  setAddingProperty(
                    false
                  )
                }
                className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  !propertyName.trim()
                }
                onClick={
                  createProperty
                }
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Create property
              </button>

            </div>

          </div>

        </div>

      )}

      {/* EDIT PROPERTY MODAL */}

      {editingProperty && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">

          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">

            <div className="flex items-center justify-between">

              <div>

                <h2 className="text-lg font-semibold text-gray-900">
                  Edit property
                </h2>

                <p className="mt-1 text-xs text-gray-400">
                  Configure this database column.
                </p>

              </div>

              <button
                type="button"
                onClick={() =>
                  setEditingProperty(
                    null
                  )
                }
                className="text-xl text-gray-400 hover:text-gray-900"
              >
                ×
              </button>

            </div>

            {/* PROPERTY NAME */}

            <div className="mt-6">

              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Property name
              </label>

              <input
                autoFocus
                value={
                  editPropertyName
                }
                onChange={(event) =>
                  setEditPropertyName(
                    event.target.value
                  )
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />

            </div>

            {/* PROPERTY TYPE */}

            <div className="mt-5">

              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Property type
              </label>

              {editingProperty.type ===
              "title" ? (

                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                  Aa &nbsp; Title
                </div>

              ) : (

                <select
                  value={
                    editPropertyType
                  }
                  onChange={(event) =>
                    setEditPropertyType(
                      event.target
                        .value as PropertyType
                    )
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
                >

                  <option value="text">
                    Text
                  </option>

                  <option value="number">
                    Number
                  </option>

                  <option value="select">
                    Select
                  </option>

                  <option value="date">
                    Date
                  </option>

                  <option value="checkbox">
                    Checkbox
                  </option>

                  <option value="url">
                    URL
                  </option>

                  <option value="email">
                    Email
                  </option>

                  <option value="phone">
                    Phone
                  </option>

                </select>

              )}

            </div>

            {editingProperty.type ===
              "title" && (

              <p className="mt-3 text-xs leading-5 text-gray-400">
                The primary title property
                cannot be deleted or changed
                to another type.
              </p>

            )}

            {/* ACTIONS */}

            <div className="mt-7 flex items-center justify-between border-t border-gray-100 pt-5">

              <div>

                {editingProperty.type !==
                  "title" && (

                  <button
                    type="button"
                    disabled={
                      savingProperty
                    }
                    onClick={
                      removeProperty
                    }
                    className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                  >
                    Delete property
                  </button>

                )}

              </div>

              <div className="flex gap-2">

                <button
                  type="button"
                  onClick={() =>
                    setEditingProperty(
                      null
                    )
                  }
                  className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={
                    savingProperty ||
                    !editPropertyName.trim()
                  }
                  onClick={
                    saveProperty
                  }
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingProperty
                    ? "Saving..."
                    : "Save"}
                </button>

              </div>

            </div>

          </div>

        </div>

      )}

    </main>
  );
}