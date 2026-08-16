import { describe, expect, it } from "vitest";

import {
  getKaneoProjectIdForWorkspace,
  getKaneoProjectKeyForWorkspace,
  KaneoRoutingError,
  mapProveItStatusToKaneo,
} from "@/lib/kaneo-routing";

describe("Kaneo workspace routing", () => {
  const projects = { business: "business-project", technology: "technology-project" };

  it("routes immutable Business and Technology workspace IDs", () => {
    expect(getKaneoProjectKeyForWorkspace("business")).toBe("business");
    expect(getKaneoProjectIdForWorkspace("technology", projects)).toBe("technology-project");
  });

  it.each(["", "company", "board", "custom-workspace"]) (
    "rejects unmapped workspace %j",
    (workspaceId) => {
      expect(() => getKaneoProjectKeyForWorkspace(workspaceId)).toThrow(KaneoRoutingError);
    }
  );
});

describe("Kaneo status mapping", () => {
  it("maps supported statuses without inventing an in-review mapping", () => {
    expect(mapProveItStatusToKaneo("todo")).toBe("to-do");
    expect(mapProveItStatusToKaneo("in_progress")).toBe("in-progress");
    expect(mapProveItStatusToKaneo("done")).toBe("done");
  });

  it("rejects blocked", () => {
    expect(() => mapProveItStatusToKaneo("blocked")).toThrow("not supported");
  });
});
