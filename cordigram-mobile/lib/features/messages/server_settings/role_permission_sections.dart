/// Section grouping mirrors web `permission-layout.ts` (labels Vietnamese).
library;

class PermissionItemDef {
  const PermissionItemDef(this.key, this.label, {this.warn = false});

  final String key;
  final String label;
  final bool warn;
}

class PermissionSectionDef {
  const PermissionSectionDef(this.title, this.items);

  final String title;
  final List<PermissionItemDef> items;
}

final List<PermissionSectionDef> kRolePermissionSections = [
  PermissionSectionDef('Quản lý máy chủ', [
    PermissionItemDef('manageServer', 'Quản lý máy chủ', warn: true),
    PermissionItemDef('manageChannels', 'Quản lý kênh', warn: true),
    PermissionItemDef('manageEvents', 'Quản lý sự kiện'),
    PermissionItemDef('manageExpressions', 'Quản lý biểu cảm'),
  ]),
  PermissionSectionDef('Thành viên', [
    PermissionItemDef('createInvite', 'Tạo lời mời'),
    PermissionItemDef('changeNickname', 'Đổi biệt danh'),
    PermissionItemDef('manageNicknames', 'Quản lý biệt danh'),
    PermissionItemDef('kickMembers', 'Kick thành viên'),
    PermissionItemDef('banMembers', 'Ban thành viên'),
    PermissionItemDef('timeoutMembers', 'Timeout thành viên'),
  ]),
  PermissionSectionDef('Kênh tin nhắn', [
    PermissionItemDef('mentionEveryone', 'Mention @everyone', warn: true),
    PermissionItemDef('sendMessages', 'Gửi tin nhắn'),
    PermissionItemDef('sendMessagesInThreads', 'Gửi trong luồng'),
    PermissionItemDef('embedLinks', 'Nhúng liên kết'),
    PermissionItemDef('attachFiles', 'Đính kèm tệp'),
    PermissionItemDef('addReactions', 'Thêm reaction'),
    PermissionItemDef('manageMessages', 'Quản lý tin nhắn'),
    PermissionItemDef('pinMessages', 'Ghim tin nhắn'),
    PermissionItemDef('viewMessageHistory', 'Xem lịch sử'),
    PermissionItemDef('sendVoiceMessages', 'Gửi voice'),
    PermissionItemDef('createPolls', 'Tạo bình chọn'),
  ]),
  PermissionSectionDef('Kênh thoại', [
    PermissionItemDef('connect', 'Kết nối'),
    PermissionItemDef('speak', 'Nói'),
    PermissionItemDef('video', 'Video'),
    PermissionItemDef('muteMembers', 'Tắt mic thành viên'),
    PermissionItemDef('deafenMembers', 'Deafen thành viên'),
    PermissionItemDef('moveMembers', 'Di chuyển thành viên'),
    PermissionItemDef(
      'setVoiceChannelStatus',
      'Đặt trạng thái kênh thoại',
    ),
  ]),
];
