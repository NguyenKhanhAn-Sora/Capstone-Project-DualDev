import fs from "fs";
import path from "path";

const files = [
  "components/ServerJoinApplicationsPanel/ServerJoinApplicationsPanel.tsx",
  "components/VoiceRecorder.tsx",
  "components/ServerEvents/EventImageEditor.tsx",
  "components/ServerMembersSection/ServerMembersSection.tsx",
  "components/CreateServerModal/CreateServerModal.tsx",
  "components/CreateServerModal/ServerCustomization.tsx",
  "components/ChannelContextMenu/ChannelContextMenu.tsx",
  "components/CommunitySection/CommunitySection.tsx",
  "app/(main)/ads/create/page.tsx",
  "components/ChannelUserProfile/ChannelUserProfileRoot.tsx",
  "app/(main)/messages/page.tsx",
  "components/ServerInteractionsSection/ServerInteractionsSection.tsx",
  "components/RoleEditModal/MembersTab.tsx",
  "components/ServerMembersSidebar/ServerMembersSidebar.tsx",
  "components/RoleEditModal/PermissionsTab.tsx",
  "components/ServerEvents/CreateEventWizard.tsx",
  "components/RolesSection/RolesSection.tsx",
  "components/RoleEditModal/RoleEditModal.tsx",
  "components/ServerAccessSection/ServerAccessSection.tsx",
  "components/RoleEditModal/DisplayTab.tsx",
];

const importLine =
  'import { appAlert, appConfirm, appPrompt } from "@/lib/app-dialog";';

for (const rel of files) {
  const fp = path.join(process.cwd(), rel);
  if (!fs.existsSync(fp)) {
    console.log("MISSING", rel);
    continue;
  }
  let src = fs.readFileSync(fp, "utf8");
  if (
    !/\balert\s*\(|window\.alert|window\.confirm|\bconfirm\s*\(|window\.prompt/.test(
      src,
    )
  ) {
    continue;
  }

  if (!src.includes("@/lib/app-dialog")) {
    if (src.startsWith('"use client";\n\n')) {
      src = src.replace('"use client";\n\n', `"use client";\n\n${importLine}\n`);
    } else if (src.startsWith('"use client";\r\n\r\n')) {
      src = src.replace(
        '"use client";\r\n\r\n',
        `"use client";\r\n\r\n${importLine}\r\n`,
      );
    } else if (src.startsWith('"use client";\n')) {
      src = src.replace('"use client";\n', `"use client";\n${importLine}\n`);
    }
  }

  src = src.replace(/window\.alert\s*\(/g, "appAlert(");
  src = src.replace(/\balert\s*\(/g, "appAlert(");
  src = src.replace(/window\.confirm\s*\(/g, "await appConfirm(");
  src = src.replace(/(?<!await )\bconfirm\s*\(/g, "await appConfirm(");
  src = src.replace(/window\.prompt\s*\(/g, "await appPrompt(");

  fs.writeFileSync(fp, src, "utf8");
  console.log("updated", rel);
}
