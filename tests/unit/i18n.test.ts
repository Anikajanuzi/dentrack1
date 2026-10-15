import { describe, expect, it } from "vitest";
import { translate, translatePlural } from "@/lib/i18n/translate";

describe("translate", () => {
  it("returns English unchanged and fills placeholders", () => {
    expect(translate("en", "Tray {0}", { 0: "#007" })).toBe("Tray #007");
  });
  it("translates UI strings to Albanian", () => {
    expect(translate("sq", "Dashboard")).toBe("Paneli");
    expect(translate("sq", "Tray {0} is available", { 0: "#012" })).toBe("Tabaka #012 është e lirë");
  });
  it("falls back to English for unknown strings", () => {
    expect(translate("sq", "Some brand-new label")).toBe("Some brand-new label");
  });
  it("picks plural forms", () => {
    expect(translatePlural("sq", 1, "{n} case", "{n} cases")).toBe("1 rast");
    expect(translatePlural("sq", 4, "{n} case", "{n} cases")).toBe("4 raste");
  });
  it("translates messages produced by the database", () => {
    expect(translate("sq", "Tray #004 is already occupied")).toBe("Tabaka #004 është tashmë e zënë");
    expect(translate("sq", "Case C-2026-0012 placed in tray #004")).toBe("Rasti C-2026-0012 u vendos në tabakanë #004");
    expect(translate("sq", "Case C-2026-0012 moved from tray #004 to #009")).toBe("Rasti C-2026-0012 u zhvendos nga tabaka #004 te #009");
    expect(translate("sq", "Case C-2026-0012 moved from Received to Quality Check")).toBe("Rasti C-2026-0012 kaloi nga Marrë te Kontrolli i cilësisë");
    expect(translate("sq", "C-2026-0012 is due 18 Oct")).toBe("C-2026-0012 ka afatin 18 tet");
    expect(translate("sq", "Allocation of 120.00 exceeds the outstanding balance of 80.00 on INV-2026-0003"))
      .toBe("Shuma 120.00 e kalon bilancin e papaguar 80.00 te INV-2026-0003");
  });
});
