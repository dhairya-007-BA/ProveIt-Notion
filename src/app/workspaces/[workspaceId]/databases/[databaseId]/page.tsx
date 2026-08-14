"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import Sidebar from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";
import { Comments } from "@/components/comments";

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
  options?: SelectOption[];
}

interface SelectOption {
  id: string;
  name: string;
  color?: SemanticColor;
}

type SemanticColor = "gray" | "blue" | "teal" | "green" | "yellow" | "orange" | "red" | "purple" | "pink";

interface DatabaseData {
  name: string;
  description: string;
  workspaceId: string;
  createdBy: string;
  properties: DatabaseProperty[];
}

interface DatabaseRow {
  id: string;
  values: Record<string, string | number | boolean | null>;
  createdAt?: Date;
  updatedAt?: Date;
}

type SortDirection = "asc" | "desc";

interface ActiveSort {
  propertyId: string;
  direction: SortDirection;
}

type FilterOperator =
  | "contains"
  | "does_not_contain"
  | "is"
  | "is_not"
  | "is_empty"
  | "is_not_empty"
  | "equals"
  | "not_equals"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "before"
  | "after"
  | "on_or_before"
  | "on_or_after"
  | "is_checked"
  | "is_unchecked";

interface DatabaseFilter {
  id: string;
  propertyId: string;
  operator: FilterOperator;
  value?: string;
}

interface DatabaseView {
  id: string;
  name: string;
  databaseId: string;
  workspaceId: string;
  type: "table";
  filters?: DatabaseFilter[];
  sort?: ActiveSort | null;
  visiblePropertyIds?: string[];
  propertyOrder?: string[];
  createdBy: string;
}

const semanticColors: SemanticColor[] = ["gray", "blue", "teal", "green", "yellow", "orange", "red", "purple", "pink"];
const semanticColorStyle = (color?: SemanticColor) => ({
  backgroundColor: `var(--tag-${color || "gray"}-bg)`,
  color: `var(--tag-${color || "gray"}-fg)`,
});

const searchablePropertyTypes: PropertyType[] = [
  "title",
  "text",
  "email",
  "url",
  "phone",
];

function filterOperators(propertyType: PropertyType): { value: FilterOperator; label: string }[] {
  if (propertyType === "number") return [
    { value: "equals", label: "=" }, { value: "not_equals", label: "≠" },
    { value: "greater_than", label: ">" }, { value: "greater_than_or_equal", label: "≥" },
    { value: "less_than", label: "<" }, { value: "less_than_or_equal", label: "≤" },
    { value: "is_empty", label: "Is empty" }, { value: "is_not_empty", label: "Is not empty" },
  ];
  if (propertyType === "date") return [
    { value: "is", label: "Is" }, { value: "before", label: "Is before" },
    { value: "after", label: "Is after" }, { value: "on_or_before", label: "Is on or before" },
    { value: "on_or_after", label: "Is on or after" }, { value: "is_empty", label: "Is empty" },
    { value: "is_not_empty", label: "Is not empty" },
  ];
  if (propertyType === "checkbox") return [
    { value: "is_checked", label: "Is checked" }, { value: "is_unchecked", label: "Is unchecked" },
  ];
  if (propertyType === "select") return [
    { value: "is", label: "Is" }, { value: "is_not", label: "Is not" },
    { value: "is_empty", label: "Is empty" }, { value: "is_not_empty", label: "Is not empty" },
  ];
  return [
    { value: "contains", label: "Contains" }, { value: "does_not_contain", label: "Does not contain" },
    { value: "is", label: "Is" }, { value: "is_not", label: "Is not" },
    { value: "is_empty", label: "Is empty" }, { value: "is_not_empty", label: "Is not empty" },
  ];
}

function operatorNeedsValue(operator: FilterOperator) {
  return !["is_empty", "is_not_empty", "is_checked", "is_unchecked"].includes(operator);
}

function numericValue(value: string | number | boolean | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesFilter(row: DatabaseRow, filter: DatabaseFilter, property: DatabaseProperty) {
  const value = row.values[property.id];
  const empty = isEmptyValue(value);

  if (filter.operator === "is_empty") return empty;
  if (filter.operator === "is_not_empty") return !empty;
  if (filter.operator === "is_checked") return value === true;
  if (filter.operator === "is_unchecked") return value === false;
  if (!filter.value?.trim()) return true;

  if (property.type === "number") {
    const rowNumber = numericValue(value);
    const filterNumber = numericValue(filter.value);
    if (rowNumber === null || filterNumber === null) return false;
    if (filter.operator === "equals") return rowNumber === filterNumber;
    if (filter.operator === "not_equals") return rowNumber !== filterNumber;
    if (filter.operator === "greater_than") return rowNumber > filterNumber;
    if (filter.operator === "greater_than_or_equal") return rowNumber >= filterNumber;
    if (filter.operator === "less_than") return rowNumber < filterNumber;
    return rowNumber <= filterNumber;
  }

  if (property.type === "date") {
    const rowDate = typeof value === "string" ? value : "";
    const filterDate = filter.value;
    if (!rowDate) return false;
    if (filter.operator === "is") return rowDate === filterDate;
    if (filter.operator === "before") return rowDate < filterDate;
    if (filter.operator === "after") return rowDate > filterDate;
    if (filter.operator === "on_or_before") return rowDate <= filterDate;
    return rowDate >= filterDate;
  }

  if (property.type === "select") {
    if (typeof value !== "string") return false;
    return filter.operator === "is" ? value === filter.value : value !== filter.value;
  }

  const rowText = String(value || "").trim().toLocaleLowerCase();
  const filterText = filter.value.trim().toLocaleLowerCase();
  if (filter.operator === "contains") return rowText.includes(filterText);
  if (filter.operator === "does_not_contain") return !rowText.includes(filterText);
  if (filter.operator === "is") return rowText === filterText;
  return rowText !== filterText;
}

function isEmptyValue(value: string | number | boolean | null | undefined) {
  return value === undefined || value === null || value === "";
}

function visiblePropertyValue(
  row: DatabaseRow,
  property: DatabaseProperty
) {
  const value = row.values[property.id];

  if (property.type === "select" && typeof value === "string") {
    return property.options?.find((option) => option.id === value)?.name || value;
  }

  return value;
}

function compareRows(
  left: DatabaseRow,
  right: DatabaseRow,
  property: DatabaseProperty,
  direction: SortDirection
) {
  const leftValue = visiblePropertyValue(left, property);
  const rightValue = visiblePropertyValue(right, property);

  if (isEmptyValue(leftValue) || isEmptyValue(rightValue)) {
    if (isEmptyValue(leftValue) && isEmptyValue(rightValue)) return 0;
    return isEmptyValue(leftValue) ? 1 : -1;
  }

  let result: number;

  if (property.type === "checkbox") {
    result = Number(Boolean(leftValue)) - Number(Boolean(rightValue));
  } else if (property.type === "number") {
    result = Number(leftValue) - Number(rightValue);
  } else {
    result = String(leftValue).localeCompare(String(rightValue), undefined, {
      sensitivity: "base",
      numeric: true,
    });
  }

  return direction === "asc" ? result : -result;
}

function directionLabel(propertyType: PropertyType, direction: SortDirection) {
  const ascending = direction === "asc";

  if (propertyType === "number") return ascending ? "Lowest → Highest" : "Highest → Lowest";
  if (propertyType === "date") return ascending ? "Oldest → Newest" : "Newest → Oldest";
  if (propertyType === "checkbox") return ascending ? "Unchecked → Checked" : "Checked → Unchecked";
  return ascending ? "A → Z" : "Z → A";
}

export default function DatabasePage() {
  const params = useParams<{
    workspaceId: string;
    databaseId: string;
  }>();

  const router = useRouter();
  const searchParams = useSearchParams();
  const rowPaneOpenedFromParent = useRef(false);

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

  const [optionName, setOptionName] =
    useState("");

  const [searchQuery, setSearchQuery] = useState("");

  const [activeSort, setActiveSort] =
    useState<ActiveSort | null>(null);

  const [sortOpen, setSortOpen] =
    useState(false);

  const [filters, setFilters] =
    useState<DatabaseFilter[]>([]);

  const [filterOpen, setFilterOpen] =
    useState(false);

  const [views, setViews] = useState<DatabaseView[]>([]);
  const [activeViewId, setActiveViewId] = useState("default");
  const [visiblePropertyIds, setVisiblePropertyIds] = useState<string[]>([]);
  const [propertiesOpen, setPropertiesOpen] = useState(false);

  const [editingOptionId, setEditingOptionId] =
    useState<string | null>(null);

  const [editingOptionName, setEditingOptionName] =
    useState("");

  const displayRows = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
    const allProperties = database?.properties || [];
    const properties = visiblePropertyIds.length
      ? allProperties.filter((property) => visiblePropertyIds.includes(property.id))
      : allProperties;
    const searchedRows = normalizedSearch
      ? rows.filter((row) => properties.some((property) =>
        searchablePropertyTypes.includes(property.type) &&
        String(visiblePropertyValue(row, property) || "")
          .toLocaleLowerCase()
          .includes(normalizedSearch)
      ))
      : rows;

    const filteredRows = searchedRows.filter((row) => filters.every((filter) => {
      const property = properties.find((candidate) => candidate.id === filter.propertyId);
      return !property || matchesFilter(row, filter, property);
    }));

    if (!activeSort) return filteredRows;

    const property = properties.find(
      (candidate) => candidate.id === activeSort.propertyId
    );

    if (!property) return filteredRows;

    return [...filteredRows].sort((left, right) =>
      compareRows(left, right, property, activeSort.direction)
    );
  }, [activeSort, database?.properties, filters, rows, searchQuery, visiblePropertyIds]);

  const visibleProperties = useMemo(() => {
    const allProperties = database?.properties || [];
    const ids = visiblePropertyIds.length ? visiblePropertyIds : allProperties.map((property) => property.id);
    return ids.map((id) => allProperties.find((property) => property.id === id)).filter((property): property is DatabaseProperty => Boolean(property));
  }, [database?.properties, visiblePropertyIds]);

  function addFilter() {
    const property = database?.properties[0];
    if (!property) return;
    setFilters((current) => [...current, {
      id: crypto.randomUUID(),
      propertyId: property.id,
      operator: filterOperators(property.type)[0].value,
    }]);
  }

  function updateFilter(filterId: string, updates: Partial<DatabaseFilter>) {
    setFilters((current) => current.map((filter) => filter.id === filterId ? { ...filter, ...updates } : filter));
  }

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

    const unsubscribe = onSnapshot(
      doc(db, "databases", databaseId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setDatabase(null);
          setError("Database not found.");
          setLoading(false);
          return;
        }

        const data = snapshot.data();

        setDatabase({
          name: data.name || "Untitled database",
          description: data.description || "",
          workspaceId: data.workspaceId,
          createdBy: data.createdBy,
          properties: (data.properties as DatabaseProperty[] | undefined) || [
            { id: "title", name: "Name", type: "title" },
          ],
        });
        setLoading(false);
      },
      (listenerError) => {
        console.error("Failed to load database:", listenerError);
        setError("Database could not be loaded.");
        setLoading(false);
      }
    );

    return unsubscribe;
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

  useEffect(() => {
    if (!firebaseUser || !databaseId) return;
    return onSnapshot(
      query(
        collection(db, "databaseViews"),
        where("databaseId", "==", databaseId),
        where("workspaceId", "==", workspaceId)
      ),
      (snapshot) => setViews(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as DatabaseView))),
      () => setError("Saved views could not be loaded.")
    );
  }, [firebaseUser, databaseId, workspaceId]);

  function applyView(view: DatabaseView | null) {
    const properties = database?.properties || [];
    const validIds = new Set(properties.map((property) => property.id));
    const nextFilters = (view?.filters || []).filter((filter) => validIds.has(filter.propertyId)).map((filter) => {
      const property = properties.find((candidate) => candidate.id === filter.propertyId)!;
      return filterOperators(property.type).some((operator) => operator.value === filter.operator)
        ? filter : { ...filter, operator: filterOperators(property.type)[0].value, value: undefined };
    });
    setFilters(nextFilters);
    setActiveSort(view?.sort && validIds.has(view.sort.propertyId) ? view.sort : null);
    setVisiblePropertyIds((view?.propertyOrder || view?.visiblePropertyIds || properties.map((property) => property.id)).filter((id) => validIds.has(id)));
  }

  function switchView(viewId: string) {
    setActiveViewId(viewId);
    applyView(viewId === "default" ? null : views.find((view) => view.id === viewId) || null);
  }

  async function createView() {
    if (!database || !firebaseUser) return;
    const name = window.prompt("Name this view", "Untitled view")?.trim();
    if (!name) return;
    const created = await addDoc(collection(db, "databaseViews"), {
      name, databaseId, workspaceId: database.workspaceId, type: "table", filters,
      sort: activeSort, visiblePropertyIds: visibleProperties.map((property) => property.id),
      propertyOrder: visibleProperties.map((property) => property.id), createdBy: firebaseUser.uid,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    setActiveViewId(created.id);
  }

  async function saveActiveView() {
    if (activeViewId === "default" || !database) return;
    await updateDoc(doc(db, "databaseViews", activeViewId), {
      filters, sort: activeSort, visiblePropertyIds: visibleProperties.map((property) => property.id),
      propertyOrder: visibleProperties.map((property) => property.id), updatedAt: serverTimestamp(),
    });
  }

  async function renameActiveView() {
    const view = views.find((candidate) => candidate.id === activeViewId);
    const name = view && window.prompt("Rename view", view.name)?.trim();
    if (view && name) await updateDoc(doc(db, "databaseViews", view.id), { name, updatedAt: serverTimestamp() });
  }

  async function duplicateActiveView() {
    if (activeViewId === "default") { await createView(); return; }
    const view = views.find((candidate) => candidate.id === activeViewId);
    if (!view || !firebaseUser) return;
    const created = await addDoc(collection(db, "databaseViews"), { ...view, name: `${view.name} copy`, createdBy: firebaseUser.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    setActiveViewId(created.id);
  }

  async function deleteActiveView() {
    if (activeViewId === "default") return;
    await deleteDoc(doc(db, "databaseViews", activeViewId));
    switchView("default");
  }

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
    setOptionName("");
    setEditingOptionId(null);
    setEditingOptionName("");
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

        ...(propertyType === "select"
          ? { options: [] }
          : {}),
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

              options:
                editPropertyType === "select"
                  ? property.options || []
                  : property.options,
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

      if (editingProperty.type !== editPropertyType) {
        setFilters((current) => current.filter(
          (filter) => filter.propertyId !== editingProperty.id
        ));

        if (activeSort?.propertyId === editingProperty.id) {
          setActiveSort(null);
        }
      }

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

  async function saveSelectOptions(
    propertyId: string,
    options: SelectOption[]
  ) {
    if (!database || savingProperty) {
      return;
    }

    try {
      setSavingProperty(true);
      setError("");

      const newProperties = database.properties.map(
        (property) =>
          property.id === propertyId
            ? { ...property, options }
            : property
      );

      await updateDoc(
        doc(db, "databases", databaseId),
        {
          properties: newProperties,
          updatedAt: serverTimestamp(),
        }
      );

      setDatabase({ ...database, properties: newProperties });
      setEditingProperty((current) =>
        current?.id === propertyId
          ? { ...current, options }
          : current
      );
    } catch (saveError) {
      console.error("Failed to update Select options:", saveError);
      setError("Select options could not be saved.");
    } finally {
      setSavingProperty(false);
    }
  }

  async function addSelectOption() {
    if (!editingProperty || editingProperty.type !== "select") {
      return;
    }

    const name = optionName.trim();
    const options = editingProperty.options || [];

    if (!name) {
      setError("Option names cannot be blank.");
      return;
    }

    if (options.some((option) => option.name.toLowerCase() === name.toLowerCase())) {
      setError("Option names must be unique.");
      return;
    }

    await saveSelectOptions(editingProperty.id, [
      ...options,
      { id: crypto.randomUUID(), name },
    ]);
    setOptionName("");
  }

  async function renameSelectOption(option: SelectOption) {
    if (!editingProperty || editingProperty.type !== "select") {
      return;
    }

    const name = editingOptionName.trim();
    const options = editingProperty.options || [];

    if (!name) {
      setError("Option names cannot be blank.");
      return;
    }

    if (options.some((candidate) => candidate.id !== option.id && candidate.name.toLowerCase() === name.toLowerCase())) {
      setError("Option names must be unique.");
      return;
    }

    await saveSelectOptions(
      editingProperty.id,
      options.map((candidate) =>
        candidate.id === option.id ? { ...candidate, name } : candidate
      )
    );
    setEditingOptionId(null);
    setEditingOptionName("");
  }

  async function recolorSelectOption(option: SelectOption, color: SemanticColor) {
    if (!editingProperty || editingProperty.type !== "select") return;
    await saveSelectOptions(editingProperty.id, (editingProperty.options || []).map((candidate) => candidate.id === option.id ? { ...candidate, color } : candidate));
  }

  async function deleteSelectOption(option: SelectOption) {
    if (!editingProperty || editingProperty.type !== "select") {
      return;
    }

    const usedBy = rows.filter(
      (row) => row.values[editingProperty.id] === option.id
    ).length;

    if (usedBy > 0) {
      setError(
        `"${option.name}" is in use by ${usedBy} row${usedBy === 1 ? "" : "s"}. Clear or reassign it before deleting.`
      );
      return;
    }

    await saveSelectOptions(
      editingProperty.id,
      (editingProperty.options || []).filter(
        (candidate) => candidate.id !== option.id
      )
    );
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

      setFilters((current) => current.filter(
        (filter) => filter.propertyId !== editingProperty.id
      ));

      if (activeSort?.propertyId === editingProperty.id) {
        setActiveSort(null);
      }

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
            value === undefined || value === null
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
      const stringValue =
        typeof value === "string" ? value : "";
      const options = property.options || [];
      const matchingOption = options.find(
        (option) => option.id === stringValue
      );

      return (
        <select
          aria-label={`${property.name} for row ${row.id}`}
          value={stringValue}
          onChange={(event) =>
            updateCell(
              row.id,
              property.id,
              event.target.value
            )
          }
          data-select-color={matchingOption?.color || "gray"}
          style={semanticColorStyle(matchingOption?.color)}
          className="h-full w-full rounded px-3 py-2 text-sm outline-none"
        >
          <option value="">Select...</option>
          {!matchingOption && stringValue && (
            <option value={stringValue}>
              {`Legacy: ${stringValue}`}
            </option>
          )}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
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
            : value === undefined || value === null
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

  const selectedRow = rows.find((row) => row.id === searchParams.get("row")) ?? null;

  /*
   * Main UI
   */

  return (
    <main className="flex min-h-screen bg-[#fbfbfa]">

      <Sidebar />

      <section className="min-w-0 flex-1 overflow-hidden">

        <div className="border-b border-black/[0.09] bg-white/80 px-6 py-3 backdrop-blur md:px-10">

          <Link
            href={`/workspaces/${workspaceId}/databases`}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            ← Databases
          </Link>

        </div>

        <div className="px-6 py-10 md:px-10">

          <div className="mx-auto max-w-[1500px]">

            {error && (
              <div className="mb-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* DATABASE HEADER */}

            <div className="mb-7">

              <div className="mb-3 text-4xl">
                ▦
              </div>

              <input
                value={database.name}
                onChange={(event) =>
                  updateDatabaseName(
                    event.target.value
                  )
                }
                className="w-full border-none bg-transparent text-4xl font-bold tracking-[-0.03em] text-[#37352f] outline-none placeholder:text-[#b4b3af]"
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
                className="mt-2 w-full border-none bg-transparent text-sm text-[#787774] outline-none placeholder:text-[#9b9a97]"
                placeholder="Add a description..."
              />

            </div>

            {/* TOOLBAR */}

            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.09]">

              <div className="flex min-w-0 items-center gap-2">
                <span className="border-b-2 border-[#37352f] px-3 py-2 text-sm font-medium text-[#37352f]">▦ Table</span>
                <select aria-label="Saved view" value={activeViewId} onChange={(event) => switchView(event.target.value)} className="max-w-44 truncate rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm">
                  <option value="default">All records</option>
                  {views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
                </select>
                <button type="button" onClick={() => void createView()} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">+ View</button>
              </div>

              <div className="relative flex flex-wrap items-center gap-2 pb-1">
                <div className="flex h-8 items-center rounded-md border border-black/[0.1] bg-white px-2 shadow-sm focus-within:border-[var(--focus)] focus-within:ring-2 focus-within:ring-[var(--focus)]/20">
                  <span aria-hidden className="mr-1 text-xs text-[var(--subtle)]">⌕</span>
                  <input
                    aria-label="Search rows"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search"
                    className="w-28 bg-transparent text-sm outline-none placeholder:text-[var(--subtle)] sm:w-40"
                  />
                  {searchQuery && <button type="button" aria-label="Clear search" onClick={() => setSearchQuery("")} className="ml-1 rounded px-1 text-xs text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]">×</button>}
                </div>
                {activeViewId !== "default" && <><button type="button" onClick={() => void saveActiveView()} className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--hover)]">Save view</button><button type="button" onClick={() => void renameActiveView()} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">Rename</button><button type="button" onClick={() => void duplicateActiveView()} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">Duplicate</button><button type="button" onClick={() => void deleteActiveView()} className="text-sm text-[var(--danger)]">Delete</button></>}
                <button type="button" aria-expanded={propertiesOpen} onClick={() => { setPropertiesOpen((current) => !current); setFilterOpen(false); setSortOpen(false); }} className="rounded-md border border-black/[0.1] bg-white px-2.5 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--hover)]">Properties</button>
                <button type="button" aria-expanded={filterOpen} aria-haspopup="dialog" onClick={() => { setFilterOpen((current) => !current); setSortOpen(false); setPropertiesOpen(false); }} className={`rounded-md border px-2.5 py-1.5 text-sm transition ${filters.length ? "border-[var(--focus)] bg-[var(--selected)] text-[var(--foreground)]" : "border-black/[0.1] bg-white text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"}`}>≡ Filter{filters.length ? ` · ${filters.length}` : ""}</button>
                <button type="button" aria-expanded={sortOpen} aria-haspopup="dialog" onClick={() => { setSortOpen((current) => !current); setFilterOpen(false); }} className={`rounded-md border px-2.5 py-1.5 text-sm transition ${activeSort ? "border-[var(--focus)] bg-[var(--selected)] text-[var(--foreground)]" : "border-black/[0.1] bg-white text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"}`}>↕ Sort</button>
                {propertiesOpen && <div role="dialog" aria-label="Properties" className="absolute right-0 top-10 z-20 w-64 rounded-lg border border-[var(--border)] bg-white p-3 shadow-[var(--shadow-md)]"><div className="flex items-center justify-between"><p className="text-sm font-medium">Properties</p><button type="button" aria-label="Close properties menu" onClick={() => setPropertiesOpen(false)}>×</button></div><p className="mt-1 text-xs text-[var(--muted)]">Hidden properties remain filterable and editable from row details; table search uses visible text properties.</p><div className="mt-3 space-y-2">{database.properties.map((property) => <label key={property.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visibleProperties.some((candidate) => candidate.id === property.id)} onChange={(event) => setVisiblePropertyIds((current) => { const ids = current.length ? current : database.properties.map((candidate) => candidate.id); return event.target.checked ? [...ids, property.id] : ids.filter((id) => id !== property.id); })} />{property.name}</label>)}</div></div>}
                {filterOpen && <div role="dialog" aria-label="Filter rows" className="absolute right-0 top-10 z-20 w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-[var(--border)] bg-white p-3 shadow-[var(--shadow-md)]"><div className="flex items-center justify-between"><p className="text-sm font-medium">Filter rows</p><button type="button" aria-label="Close filter menu" onClick={() => setFilterOpen(false)} className="rounded px-1 text-[var(--subtle)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]">×</button></div><div className="mt-3 space-y-3">{filters.map((filter) => { const property = database.properties.find((candidate) => candidate.id === filter.propertyId) || database.properties[0]; const operators = filterOperators(property.type); const configuredOptionIds = new Set((property.options || []).map((option) => option.id)); const legacyValues = Array.from(new Set(rows.map((row) => row.values[property.id]).filter((value): value is string => typeof value === "string" && value !== "" && !configuredOptionIds.has(value)))); return <div key={filter.id} data-testid="filter-row" className="rounded-lg border border-[var(--border)] bg-[#fafaf9] p-2"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"><select aria-label="Filter property" value={filter.propertyId} onChange={(event) => { const nextProperty = database.properties.find((candidate) => candidate.id === event.target.value); if (nextProperty) updateFilter(filter.id, { propertyId: nextProperty.id, operator: filterOperators(nextProperty.type)[0].value, value: undefined }); }} className="proveit-control min-w-0 px-2 py-2 text-sm">{database.properties.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><select aria-label="Filter operator" value={filter.operator} onChange={(event) => updateFilter(filter.id, { operator: event.target.value as FilterOperator, value: operatorNeedsValue(event.target.value as FilterOperator) ? filter.value : undefined })} className="proveit-control min-w-0 px-2 py-2 text-sm">{operators.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}</select>{operatorNeedsValue(filter.operator) && (property.type === "select" ? <select aria-label="Filter value" value={filter.value || ""} onChange={(event) => updateFilter(filter.id, { value: event.target.value })} className="proveit-control min-w-0 px-2 py-2 text-sm"><option value="">Choose…</option>{(property.options || []).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}{legacyValues.map((value) => <option key={value} value={value}>{`Legacy: ${value}`}</option>)}</select> : <input aria-label="Filter value" type={property.type === "number" ? "number" : property.type === "date" ? "date" : "text"} value={filter.value || ""} onChange={(event) => updateFilter(filter.id, { value: event.target.value })} placeholder="Value" className="proveit-control min-w-0 px-2 py-2 text-sm" />)}{!operatorNeedsValue(filter.operator) && <span className="hidden sm:block" />}<button type="button" aria-label="Remove filter" onClick={() => setFilters((current) => current.filter((candidate) => candidate.id !== filter.id))} className="rounded-md px-2 text-sm text-[var(--subtle)] hover:bg-red-50 hover:text-[var(--danger)]">×</button></div></div>; })}</div><div className="mt-4 flex items-center justify-between gap-2"><button type="button" onClick={addFilter} className="proveit-secondary-button min-h-8 px-2.5 py-1 text-xs">+ Add filter</button><div className="flex gap-2"><button type="button" onClick={() => setFilters([])} disabled={!filters.length} className="proveit-secondary-button min-h-8 px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50">Clear all</button><button type="button" onClick={() => setFilterOpen(false)} className="proveit-primary-button min-h-8 px-2.5 py-1 text-xs">Done</button></div></div></div>}
                {sortOpen && <div role="dialog" aria-label="Sort rows" className="absolute right-0 top-10 z-20 w-72 rounded-lg border border-[var(--border)] bg-white p-3 shadow-[var(--shadow-md)]"><div className="flex items-center justify-between"><p className="text-sm font-medium">Sort rows</p><button type="button" aria-label="Close sort menu" onClick={() => setSortOpen(false)} className="rounded px-1 text-[var(--subtle)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]">×</button></div><label className="mt-3 block text-xs font-medium text-[var(--muted)]">Property<select aria-label="Sort property" value={activeSort?.propertyId || ""} onChange={(event) => { const propertyId = event.target.value; setActiveSort(propertyId ? { propertyId, direction: activeSort?.direction || "asc" } : null); }} className="proveit-control mt-1.5 w-full px-2.5 py-2 text-sm"><option value="">Choose a property</option>{database.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>{activeSort && (() => { const property = database.properties.find((candidate) => candidate.id === activeSort.propertyId); return property ? <label className="mt-3 block text-xs font-medium text-[var(--muted)]">Direction<select aria-label="Sort direction" value={activeSort.direction} onChange={(event) => setActiveSort({ ...activeSort, direction: event.target.value as SortDirection })} className="proveit-control mt-1.5 w-full px-2.5 py-2 text-sm"><option value="asc">{directionLabel(property.type, "asc")}</option><option value="desc">{directionLabel(property.type, "desc")}</option></select></label> : null; })()}<div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setActiveSort(null)} disabled={!activeSort} className="proveit-secondary-button min-h-8 px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50">Clear sort</button><button type="button" onClick={() => setSortOpen(false)} className="proveit-primary-button min-h-8 px-2.5 py-1 text-xs">Done</button></div></div>}
                <button
                  type="button"
                  onClick={createRow}
                  disabled={creatingRow}
                  className="rounded-md bg-[#252525] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
                >
                  {creatingRow
                    ? "Adding..."
                    : "New"}
                </button>

              </div>

            </div>

            {/* TABLE */}

            <div className="overflow-x-auto rounded-md border border-black/[0.12] bg-white">

              <table className="min-w-full border-collapse">

                <thead>

                  <tr className="bg-[#fbfbfa]">

                    {visibleProperties.map(
                      (property) => (

                        <th
                          key={property.id}
                          className="min-w-[190px] border-b border-r border-black/[0.09] px-2 py-1.5 text-left text-xs font-medium text-[#787774]"
                        >

                          <button
                            type="button"
                            onClick={() =>
                              openPropertyEditor(
                                property
                              )
                            }
                            className="flex w-full items-center gap-2 rounded px-1 py-1 text-left transition hover:bg-black/[0.05]"
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

                    <th className="w-12 border-b border-black/[0.09]">

                      <button
                        type="button"
                        onClick={() =>
                          setAddingProperty(
                            true
                          )
                        }
                        className="flex h-full w-full items-center justify-center px-4 py-2 text-[#9b9a97] hover:bg-black/[0.05] hover:text-[#37352f]"
                        title="Add property"
                      >
                        +
                      </button>

                    </th>

                  </tr>

                </thead>

                <tbody>

                  {displayRows.map(
                    (row) => (

                      <tr
                        key={row.id}
                        className="group transition hover:bg-[#f7f7f5]"
                      >

                        {visibleProperties.map(
                          (property) => (

                            <td
                              key={
                                property.id
                              }
                              className="h-9 border-b border-r border-black/[0.09] p-0"
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
                                    href={`/workspaces/${workspaceId}/databases/${databaseId}?row=${row.id}`}
                                    onClick={() => { rowPaneOpenedFromParent.current = true; }}
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

                        <td className="border-b border-black/[0.09] text-center">

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
                        visibleProperties
                          .length + 1
                      }
                      className="border-b border-black/[0.09]"
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
              {displayRows.length}{" "}
              {displayRows.length === 1
                ? "row"
                : "rows"}
              {displayRows.length !== rows.length && ` of ${rows.length}`}
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
                aria-label="Close new property dialog"
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
                aria-label="Close property editor"
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

            {editingProperty.type === "select" && (
              <div className="mt-5 border-t border-gray-100 pt-5">
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Options
                </label>

                <div className="space-y-2">
                  {(editingProperty.options || []).map((option) => (
                    <div
                      key={option.id}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5"
                    >
                      {editingOptionId === option.id ? (
                        <input
                          aria-label={`Rename ${option.name}`}
                          value={editingOptionName}
                          onChange={(event) =>
                            setEditingOptionName(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              renameSelectOption(option);
                            }
                          }}
                          className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate px-1 text-sm text-gray-700">
                          {option.name}
                        </span>
                      )}

                      <select aria-label={`Color for ${option.name}`} value={option.color || "gray"} onChange={(event) => void recolorSelectOption(option, event.target.value as SemanticColor)} className="rounded border border-[var(--border)] px-1 py-1 text-xs" style={semanticColorStyle(option.color)}>
                        {semanticColors.map((color) => <option key={color} value={color}>{color}</option>)}
                      </select>

                      {editingOptionId === option.id ? (
                        <button
                          type="button"
                          aria-label={`Save ${option.name}`}
                          onClick={() => renameSelectOption(option)}
                          className="px-1 text-xs text-gray-600 hover:text-gray-900"
                        >
                          Save
                        </button>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Rename ${option.name}`}
                          onClick={() => {
                            setEditingOptionId(option.id);
                            setEditingOptionName(option.name);
                          }}
                          className="px-1 text-xs text-gray-500 hover:text-gray-900"
                        >
                          Rename
                        </button>
                      )}

                      <button
                        type="button"
                        aria-label={`Delete ${option.name}`}
                        onClick={() => deleteSelectOption(option)}
                        className="px-1 text-xs text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex gap-2">
                  <input
                    aria-label="Option name"
                    value={optionName}
                    onChange={(event) => setOptionName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        addSelectOption();
                      }
                    }}
                    placeholder="Add an option"
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  />
                  <button
                    type="button"
                    disabled={savingProperty}
                    onClick={addSelectOption}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Add option
                  </button>
                </div>
              </div>
            )}

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

      {selectedRow && <aside aria-label="Row detail pane" className="fixed inset-y-0 right-0 z-20 w-full max-w-[52vw] overflow-y-auto border-l border-black/[0.1] bg-white px-6 py-5 shadow-sm"><div className="flex items-center justify-between"><button aria-label="Close row pane" onClick={() => { if (rowPaneOpenedFromParent.current) { rowPaneOpenedFromParent.current = false; router.back(); } else { router.push(`/workspaces/${workspaceId}/databases/${databaseId}`); } }} className="text-sm text-[#787774]">× Close</button><Link aria-label="Expand row" href={`/workspaces/${workspaceId}/databases/${databaseId}/rows/${selectedRow.id}`} className="text-sm text-[#787774]">↗ Expand</Link></div><h2 className="mt-8 text-3xl font-semibold">{String(selectedRow.values.title || "Untitled")}</h2><div className="mt-6 border-y border-black/[0.08] py-2">{database.properties.filter((property) => property.type !== "title").map((property) => <div key={property.id} className="flex min-h-10 items-center"><span className="w-40 shrink-0 text-sm text-[#787774]">{property.name}</span><div className="min-w-0 flex-1">{renderCell(selectedRow, property)}</div></div>)}</div><Comments workspaceId={workspaceId} entityType="database-row" entityId={`${databaseId}:${selectedRow.id}`} /></aside>}
    </main>
  );
}
