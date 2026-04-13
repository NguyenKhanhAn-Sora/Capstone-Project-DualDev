import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "locales");

const keys = [
  [
    "manageServer",
    "Manage Server",
    "Allows members to edit the server name, image, and basic settings.",
    "This is a powerful permission. Grant carefully.",
  ],
  [
    "manageChannels",
    "Manage Channels",
    "Allows members to create, edit, and delete channels.",
    "This is a powerful permission. Grant carefully.",
  ],
  [
    "manageEvents",
    "Manage Events",
    "Allows members to create, edit, and delete server events.",
  ],
  [
    "createInvite",
    "Create Invite",
    "Allows members to invite new people to this server.",
  ],
  [
    "changeNickname",
    "Change Nickname",
    "Allows members to change their own nickname in this server.",
  ],
  [
    "manageNicknames",
    "Manage Nicknames",
    "Allows members to change other members nicknames.",
  ],
  [
    "kickMembers",
    "Kick, approve and reject members",
    "Kick removes members; they can rejoin with a new invite. If the server uses join applications, this permission approves or rejects requests.",
  ],
  [
    "banMembers",
    "Ban members",
    "Allows members to permanently ban others and remove their message history from this server.",
  ],
  [
    "timeoutMembers",
    "Timeout members",
    "When timed out, users cannot send messages, reply, react, or speak in voice/stage.",
  ],
  [
    "mentionEveryone",
    "Mention @everyone, @here and all roles",
    "Allows @everyone/@here and mentioning mentionable roles.",
    "Only grant to trusted members.",
  ],
  [
    "sendMessages",
    "Send messages and create posts",
    "Allows sending messages in text channels and posts in forum channels.",
  ],
  [
    "sendMessagesInThreads",
    "Send messages in threads and posts",
    "Allows sending messages in threads and forum posts.",
  ],
  [
    "createPublicThreads",
    "Create public threads",
    "Allows creating threads visible to everyone in the channel.",
  ],
  [
    "createPrivateThreads",
    "Create private threads",
    "Allows creating invite-only threads.",
  ],
  [
    "embedLinks",
    "Embed links",
    "Shows rich embeds for links shared in chat.",
  ],
  [
    "attachFiles",
    "Attach files",
    "Allows uploading files or media in chat.",
  ],
  [
    "addReactions",
    "Add reactions",
    "Allows adding new emoji reactions to messages.",
  ],
  [
    "manageMessages",
    "Manage messages",
    "Allows deleting or removing embeds from other members messages.",
  ],
  [
    "pinMessages",
    "Pin messages",
    "Allows pinning or unpinning any message.",
  ],
  [
    "viewMessageHistory",
    "Read message history",
    "Allows reading earlier messages. Without it, only messages while online may be visible.",
  ],
  [
    "sendVoiceMessages",
    "Send voice messages",
    "Allows sending voice messages.",
  ],
  [
    "createPolls",
    "Create polls",
    "Allows creating polls.",
  ],
  [
    "connect",
    "Connect",
    "Allows joining voice and hearing others.",
  ],
  ["speak", "Speak", "Allows speaking in voice. Without it, users are muted until someone unmutes them."],
  [
    "video",
    "Video",
    "Allows video, screen share, or streaming in this server.",
  ],
  [
    "muteMembers",
    "Mute members",
    "Allows muting other members in voice channels.",
  ],
  [
    "deafenMembers",
    "Deafen members",
    "Allows deafening others so they cannot hear or speak.",
  ],
  [
    "moveMembers",
    "Move members",
    "Allows disconnecting or moving members between voice channels you can access.",
  ],
  [
    "setVoiceChannelStatus",
    "Set voice channel status",
    "Allows creating and editing voice channel status.",
  ],
];

function buildItems(lang) {
  const items = {};
  for (const row of keys) {
    const [k, l, d, w] = row;
    if (lang === "en") {
      items[k] = { label: l, description: d };
      if (w) items[k].warning = w;
    }
  }
  return items;
}

function mergeEn() {
  const p = path.join(localesDir, "en.json");
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const items = buildItems("en");
  j.chat.explore = {
    backToChat: "← Back to chat",
    title: "Explore",
    subtitle:
      "Find reviewed communities to join. If a server uses Apply to join, you must submit an application first.",
    loading: "Loading…",
    loadError: "Could not load",
    empty: "No approved servers to show yet.",
    members: "{count} members",
    badgeApply: " • Apply to join",
    badgeInviteOnly: " • Invite only",
    join: "Join",
    inviteOnly: "Invite only",
    inviteOnlyTitle: "This server is invite-only",
  };
  j.chat.sidebar = {
    contextExplore: "Explore",
    contextServer: "Server",
    contextDm: "Direct messages",
    inboxAria: "Inbox",
    createServerTitle: "Create server",
    settingsAria: "Settings",
    exploreOpen: "Explore",
    exploreClose: "Close Explore",
  };
  j.chat.toasts = {
    messageRemovedAll: "Message removed for everyone",
    messageDeletedSelf: "You deleted a message",
  };
  j.chat.channelUi = {
    sectionChat: "Text channels",
    sectionVoice: "Voice channels",
    defaultCategoryLabel: "Channels",
  };
  j.chat.roleEditor = {
    back: "Back",
    editTitle: "EDIT ROLE - ",
    tabDisplay: "Display",
    tabPermissions: "Permissions",
    tabMembers: "Manage members ({count})",
    esc: "ESC",
    deleteRoleTitle: "Delete role",
    confirmDeleteRole: 'Are you sure you want to delete the role "{name}"?',
    errorDeleteRole: "Could not delete role",
    newRoleName: "new role",
    errorCreateRole: "Could not create role",
    viewServerByRole: "View server by role",
    delete: "Delete",
  };
  j.chat.rolePermissions = {
    sections: {
      serverManagement: "SERVER MANAGEMENT PERMISSIONS",
      member: "MEMBER PERMISSIONS",
      textChannel: "TEXT CHANNEL PERMISSIONS",
      voiceChannel: "VOICE CHANNEL PERMISSIONS",
    },
    searchPlaceholder: "Search permissions",
    noResults: 'No permissions match "{query}"',
    unsavedBar: "Careful — you have unsaved changes!",
    reset: "Reset",
    saving: "Saving...",
    saveChanges: "Save changes",
    saveFailed: "Could not save changes",
    items,
  };
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
  console.log("merged en.json");
}

mergeEn();
