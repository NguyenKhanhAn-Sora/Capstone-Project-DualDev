import type { ServerSettingsSection } from "@/components/ServerSettingsPanel/ServerSettingsPanel";

export type SafetyTab = "spam" | "automod";

export function mapSectionToSafetyTab(section: ServerSettingsSection): SafetyTab {
  if (section === "automod") return "automod";
  return "spam";
}

