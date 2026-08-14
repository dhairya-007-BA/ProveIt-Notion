"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Comments } from "@/components/comments";

type Property = {
  id: string;
  name: string;
  type: string;
  options?: SelectOption[];
};

type SelectOption = {
  id: string;
  name: string;
};

type DatabaseData = {
  name?: string;
  properties?: Property[];
};

type RowData = {
  values?: Record<string, unknown>;
};

export default function RowPage() {
  const params = useParams();

  const workspaceId = params.workspaceId as string;
  const databaseId = params.databaseId as string;
  const rowId = params.rowId as string;

  const [database, setDatabase] = useState<DatabaseData | null>(null);
  const [row, setRow] = useState<RowData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        const databaseRef = doc(
          db,
          "databases",
          databaseId
        );

        const rowRef = doc(
          db,
          "databases",
          databaseId,
          "rows",
          rowId
        );

        const [databaseSnapshot, rowSnapshot] =
          await Promise.all([
            getDoc(databaseRef),
            getDoc(rowRef),
          ]);

        if (!databaseSnapshot.exists()) {
          setError("Database not found");
          return;
        }

        if (!rowSnapshot.exists()) {
          setError("Row not found");
          return;
        }

        setDatabase(
          databaseSnapshot.data() as DatabaseData
        );

        setRow(
          rowSnapshot.data() as RowData
        );
      } catch (err) {
        console.error(err);
        setError("Could not load row");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [databaseId, rowId]);

  async function updateValue(
    propertyId: string,
    value: string | number | boolean | null
  ) {
    if (!row) return;

    const rowRef = doc(
      db,
      "databases",
      databaseId,
      "rows",
      rowId
    );

    try {
      await updateDoc(rowRef, {
        [`values.${propertyId}`]: value,
        updatedAt: serverTimestamp(),
      });

      setRow((current) => {
        if (!current) return current;

        return {
          ...current,
          values: {
            ...(current.values ?? {}),
            [propertyId]: value,
          },
        };
      });
    } catch (err) {
      console.error("Could not update value:", err);
      alert("Could not save value");
    }
  }

  if (loading) {
    return (
      <main className="p-10">
        Loading...
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-10">
        <p className="text-red-600">
          {error}
        </p>
      </main>
    );
  }

  if (!row || !database) {
    return null;
  }

  const properties = database.properties ?? [];
  const values = row.values ?? {};

  const title =
    typeof values.title === "string"
      ? values.title
      : "";

  return (
    <main className="min-h-screen bg-[#fbfbfa]">
      <div className="mx-auto max-w-3xl px-6 py-6 md:px-10 md:py-10">

        <Link
          href={`/workspaces/${workspaceId}/databases/${databaseId}`}
          className="rounded px-1 py-1 text-sm text-[#787774] transition hover:bg-black/[0.05] hover:text-[#37352f]"
        >
          ← Back to database
        </Link>

        <div className="mt-10">

          <div className="text-4xl">
            📄
          </div>

          {/* TITLE */}

          <input
            type="text"
            value={title}
            placeholder="Untitled"
            onChange={(event) => {
              const newValue = event.target.value;

              setRow((current) => {
                if (!current) return current;

                return {
                  ...current,
                  values: {
                    ...(current.values ?? {}),
                    title: newValue,
                  },
                };
              });
            }}
            onBlur={(event) => {
              updateValue(
                "title",
                event.target.value
              );
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            className="
              mt-4
              w-full
              border-none
              bg-transparent
              text-4xl
              font-bold
              text-[#37352f]
              outline-none
              placeholder:text-[#b4b3af]
            "
          />

        </div>

        {/* PROPERTIES */}

        <div className="mt-10 max-w-2xl rounded-md border border-black/[0.09] bg-white px-4">

          {properties
            .filter(
              (property) =>
                property.id !== "title"
            )
            .map((property) => {

              const currentValue =
                values[property.id];

              return (
                <div
                  key={property.id}
                  className="
                    flex
                    items-center
                    border-b
                    border-black/[0.08]
                    py-2.5
                  "
                >

                  {/* PROPERTY NAME */}

                  <div className="w-48 shrink-0 text-sm text-[#787774]">
                    {property.name}
                  </div>

                  {/* NUMBER */}

                  {property.type === "select" ? (

                    <select
                      aria-label={property.name}
                      value={
                        typeof currentValue === "string"
                          ? currentValue
                          : ""
                      }
                      onChange={(event) =>
                        updateValue(
                          property.id,
                          event.target.value
                        )
                      }
                      className="flex-1 rounded border-none bg-transparent px-2 py-1.5 text-sm text-[#37352f] outline-none hover:bg-[#f1f1ef] focus:bg-[#f1f1ef]"
                    >
                      <option value="">Empty</option>
                      {typeof currentValue === "string" &&
                        currentValue &&
                        !(property.options || []).some(
                          (option) => option.id === currentValue
                        ) && (
                          <option value={currentValue}>
                            {`Legacy: ${currentValue}`}
                          </option>
                        )}
                      {(property.options || []).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>

                  ) : property.type === "number" ? (

                    <input
                      type="number"
                      value={
                        typeof currentValue === "number"
                          ? currentValue
                          : ""
                      }
                      placeholder="Empty"
                      onChange={(event) => {
                        const raw =
                          event.target.value;

                        const newValue =
                          raw === ""
                            ? null
                            : Number(raw);

                        setRow((current) => {
                          if (!current) return current;

                          return {
                            ...current,
                            values: {
                              ...(current.values ?? {}),
                              [property.id]:
                                newValue,
                            },
                          };
                        });
                      }}
                      onBlur={(event) => {
                        const raw =
                          event.target.value;

                        updateValue(
                          property.id,
                          raw === ""
                            ? null
                            : Number(raw)
                        );
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                      className="
                        flex-1
                        border-none
                        bg-transparent
                        px-2
                        py-2
                        text-sm
                        text-gray-900
                        outline-none
                        hover:bg-gray-50
                        focus:bg-gray-50
                      "
                    />

                  ) : (

                    /* TEXT */

                    <input
                      type="text"
                      value={
                        typeof currentValue === "string"
                          ? currentValue
                          : ""
                      }
                      placeholder="Empty"
                      onChange={(event) => {
                        const newValue =
                          event.target.value;

                        setRow((current) => {
                          if (!current) return current;

                          return {
                            ...current,
                            values: {
                              ...(current.values ?? {}),
                              [property.id]:
                                newValue,
                            },
                          };
                        });
                      }}
                      onBlur={(event) => {
                        updateValue(
                          property.id,
                          event.target.value
                        );
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                      className="
                        flex-1
                        border-none
                        bg-transparent
                        px-2
                        py-2
                        text-sm
                        text-gray-900
                        outline-none
                        hover:bg-gray-50
                        focus:bg-gray-50
                      "
                    />

                  )}

                </div>
              );
            })}

        </div>

        <Comments
          workspaceId={workspaceId}
          entityType="database-row"
          entityId={`${databaseId}:${rowId}`}
        />

      </div>
    </main>
  );
}
