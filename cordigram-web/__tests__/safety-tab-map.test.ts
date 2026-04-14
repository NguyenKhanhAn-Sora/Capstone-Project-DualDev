import { mapSectionToSafetyTab } from "@/components/ServerSafetySection/safety-tab-map";

describe("mapSectionToSafetyTab", () => {
  it("maps automod section to automod tab", () => {
    expect(mapSectionToSafetyTab("automod")).toBe("automod");
  });

  it("maps privileges section to privileges tab", () => {
    expect(mapSectionToSafetyTab("privileges")).toBe("privileges");
  });

  it("maps safety section to spam tab", () => {
    expect(mapSectionToSafetyTab("safety")).toBe("spam");
  });
});

