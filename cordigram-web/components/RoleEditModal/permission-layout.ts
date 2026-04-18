import type { RolePermissions } from "@/lib/servers-api";

export type PermissionLayoutSection = {
  sectionKey: "serverManagement" | "member" | "textChannel" | "voiceChannel";
  keys: Array<{
    key: keyof RolePermissions;
    hasWarning?: boolean;
  }>;
};

/** Thứ tự và nhóm quyền — chuỗi hiển thị lấy từ i18n `chat.rolePermissions.items.<key>.*` */
export const PERMISSION_LAYOUT: PermissionLayoutSection[] = [
  {
    sectionKey: "serverManagement",
    keys: [
      { key: "manageServer", hasWarning: true },
      { key: "manageChannels", hasWarning: true },
      { key: "manageEvents" },
      { key: "manageExpressions" },
    ],
  },
  {
    sectionKey: "member",
    keys: [
      { key: "createInvite" },
      { key: "changeNickname" },
      { key: "manageNicknames" },
      { key: "kickMembers" },
      { key: "banMembers" },
      { key: "timeoutMembers" },
    ],
  },
  {
    sectionKey: "textChannel",
    keys: [
      { key: "mentionEveryone", hasWarning: true },
      { key: "sendMessages" },
      { key: "sendMessagesInThreads" },
      { key: "embedLinks" },
      { key: "attachFiles" },
      { key: "addReactions" },
      { key: "manageMessages" },
      { key: "pinMessages" },
      { key: "viewMessageHistory" },
      { key: "sendVoiceMessages" },
      { key: "createPolls" },
    ],
  },
  {
    sectionKey: "voiceChannel",
    keys: [
      { key: "connect" },
      { key: "speak" },
      { key: "video" },
      { key: "muteMembers" },
      { key: "deafenMembers" },
      { key: "moveMembers" },
      { key: "setVoiceChannelStatus" },
    ],
  },
];
