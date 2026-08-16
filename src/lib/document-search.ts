export type SearchableDocument = { title: string };

export function filterDocuments<T extends SearchableDocument>(documents: T[], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return needle ? documents.filter((document) => document.title.toLocaleLowerCase().includes(needle)) : documents;
}
