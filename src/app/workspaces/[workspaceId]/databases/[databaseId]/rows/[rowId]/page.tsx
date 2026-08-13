"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Property = {
  id: string;
  name: string;
  type: string;
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
    value: string | number | null
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
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-10 py-8">

        <Link
          href={`/workspaces/${workspaceId}/databases/${databaseId}`}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← Back to database
        </Link>

        <div className="mt-12">

          <div className="text-5xl">
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
              text-gray-900
              outline-none
              placeholder:text-gray-300
            "
          />

        </div>

        {/* PROPERTIES */}

        <div className="mt-10 max-w-2xl">

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
                    border-gray-100
                    py-3
                  "
                >

                  {/* PROPERTY NAME */}

                  <div className="w-56 shrink-0 text-sm text-gray-500">
                    {property.name}
                  </div>

                  {/* NUMBER */}

                  {property.type === "number" ? (

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

      </div>
    </main>
  );
}