import type { ReactNode, SVGProps } from "react";

export type NavigationIconName = "activity" | "chevron" | "database" | "document" | "home" | "inbox" | "meeting" | "people" | "search" | "settings" | "task" | "upload" | "workspace";

export const workspaceModules = [
  { id: "dashboard", label: "Dashboard", icon: "home" },
  { id: "inbox", label: "Inbox", icon: "inbox" },
  { id: "documents", label: "Documents", icon: "document" },
  { id: "tasks", label: "Tasks", icon: "task" },
  { id: "meetings", label: "Meetings", icon: "meeting" },
  { id: "databases", label: "Databases", icon: "database" },
  { id: "activity", label: "Recent activity", icon: "activity" },
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: NavigationIconName }>;

export function NavigationIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: NavigationIconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg aria-hidden="true" viewBox="0 0 24 24" {...common} {...props}>{paths[name]}</svg>;
}

const paths: Record<NavigationIconName, ReactNode> = {
  home: <><path d="m3.5 10.5 8.5-7 8.5 7" /><path d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
  workspace: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  inbox: <><path d="M4 4.5h16v15H4z" /><path d="M4 14h4l1.5 2h5L16 14h4" /></>,
  document: <><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 16h6" /></>,
  task: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="m7 9 1.5 1.5L11 8M13.5 9H17M7 15l1.5 1.5L11 14M13.5 15H17" /></>,
  meeting: <><rect x="3.5" y="5.5" width="17" height="15" rx="2" /><path d="M7.5 3v5M16.5 3v5M3.5 10h17" /></>,
  database: <><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6M4 11.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
  activity: <><path d="M4 12h3l2-5 4 10 2-5h5" /><circle cx="12" cy="12" r="9" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.8V20" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.8-1.8l.9-1.9L15 4l-1.9.9A7 7 0 0 0 11.3 4L10.5 2h-3l-.7 2a7 7 0 0 0-1.8.8L3.1 4 1 6.1 1.9 8a7 7 0 0 0-.8 1.8l-2 .7v3l2 .7a7 7 0 0 0 .8 1.8L1 17.9 3.1 20l1.9-.9a7 7 0 0 0 1.8.8l.7 2h3l.8-2a7 7 0 0 0 1.8-.8l1.9.9 2.1-2.1-.9-1.9a7 7 0 0 0 .8-1.8z" transform="translate(2.5 0) scale(.8)" /></>,
  upload: <><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M4 14v6h16v-6" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
};
