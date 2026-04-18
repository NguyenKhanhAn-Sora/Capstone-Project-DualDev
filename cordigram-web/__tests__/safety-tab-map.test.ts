import { mapSectionToSafetyTab } from "@/components/ServerSafetySection/safety-tab-map";

describe("mapSectionToSafetyTab", () => {
  it("maps automod section to automod tab", () => {
    expect(mapSectionToSafetyTab("automod")).toBe("automod");
  });

  it("maps profile section to spam tab (default)", () => {
    expect(mapSectionToSafetyTab("profile")).toBe("spam");
  });

  it("maps safety section to spam tab", () => {
    expect(mapSectionToSafetyTab("safety")).toBe("spam");
  });
});

