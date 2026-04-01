import type { ServerSettingsSection } from "@/components/ServerSettingsPanel/ServerSettingsPanel";

export type SafetyTab = "spam" | "automod" | "privileges";

export function mapSectionToSafetyTab(section: ServerSettingsSection): SafetyTab {
  if (section === "automod") return "automod";
  if (section === "privileges") return "privileges";
  return "spam";
}

