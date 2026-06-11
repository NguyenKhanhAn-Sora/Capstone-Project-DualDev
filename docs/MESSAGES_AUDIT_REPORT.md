# Báo cáo kiểm tra Messages — Cordigram (Web + Mobile + Backend)

> **Phạm vi:** Chỉ module **Messages** (DM, Server/Channel, Voice, Call, Inbox, Settings, Events, Boost). **Không** bao gồm mạng xã hội (Social feed/post).  
> **Ngày kiểm tra:** 03/2026  
> **Phương pháp:** Quét codebase, `flutter analyze lib/features/messages` (79 issues), rà soát gateway/service/controller, đối chiếu Web ↔ Mobile ↔ Backend.

---

## Bảng tổng hợp lỗi (ưu tiên theo mức độ)

| Mức độ | Loại lỗi | File | Dòng (gợi ý) | Mô tả | Nguyên nhân | Cách sửa |
|--------|----------|------|--------------|-------|-------------|----------|
| **Critical** | Security / API | `cordigram-backend/src/messages/messages.service.ts` | ~1930 | **IDOR tìm kiếm tin nhắn kênh** — bất kỳ user đăng nhập có thể search tin của server/kênh khác | `searchMessages()` không kiểm tra membership | Truyền `viewerId`, verify member + quyền kênh private trước query |
| **Critical** | Security / Call | `cordigram-backend/src/livekit/livekit.controller.ts` | ~23–38 | **`POST /livekit/token` cấp JWT cho mọi `roomName`** không xác minh quyền vào phòng DM/voice | Chỉ validate tên phòng, không check membership | Parse `dm-*` / `voice-*`, reuse logic `CallService` / channel access |
| **High** | Security | `cordigram-backend/src/direct-messages/direct-messages.gateway.ts` | ~497 | JWT fallback secret `'your_secret_key'` khi thiếu env | Hardcoded default | Fail fast nếu thiếu `JWT_SECRET` |
| **High** | Security | `cordigram-backend/src/direct-messages/direct-messages.gateway.ts` | ~489 | WebSocket chấp nhận JWT không lọc `type === 'access'` | Khác với `notifications.gateway` | Reject token không phải access |
| **High** | Security / Call | `cordigram-backend/src/direct-messages/direct-messages.gateway.ts` | ~1039 | **`ice-candidate` relay không verify session** — user bất kỳ gửi ICE tới peer | Thiếu check `DmCallSession` | Chỉ relay khi có session active giữa 2 user |
| **High** | Security / Call | `cordigram-backend/src/direct-messages/direct-messages.gateway.ts` | ~995 | **`call-reject` emit trước khi validate** — spam fake reject | Thứ tự xử lý sai | Validate callee + session trước emit |
| **High** | Security | `cordigram-backend/src/direct-messages/direct-messages.service.ts` | ~867 | **`addReaction()` không check participant** | Thiếu verify sender/receiver | Chỉ cho phép 2 bên hội thoại |
| **High** | Security | `cordigram-backend/src/direct-messages/direct-messages.service.ts` | ~184 | **Gửi DM không check block/ignore** | Không dùng `BlocksService` | Check block 2 chiều trước create |
| **High** | Security | `cordigram-backend/src/link-preview/link-preview.service.ts` | ~19 | **SSRF** — fetch URL tùy ý không chặn private IP | Thiếu blocklist (module comment có guard nhưng standalone không) | Port `isBlockedHost()` từ module comment |
| **High** | Security / API | `cordigram-backend/src/events/events.controller.ts` | ~28 | **GET events không check membership** | Controller không truyền userId | Verify member trước list/detail |
| **High** | Security | `cordigram-backend/src/channels/channels.controller.ts` | ~97 | **List/get channel không check membership** | Chỉ JWT guard | Gate read bằng `isMember` + private channel |
| **High** | Frontend / API | `cordigram-web/lib/servers-api.ts` | ~7, ~15 | **Hai base URL API** — export `apiBaseUrl` nhưng fetch dùng `NEXT_PUBLIC_API_BASE_URL` riêng | Shadow constant | Một env, một base URL cho toàn bộ messages |
| **High** | Frontend | `cordigram-web/app/(main)/messages/page.tsx` | ~8228 | **UI chặn sửa kênh stricter hơn backend** — cần cả `manageServer` + `manageChannels` | `canManageChannelsStructure` sai | Khớp backend: `isOwner \|\| canManageChannels` |
| **High** | Frontend / Socket | `cordigram-web/app/(main)/messages/page.tsx` | channel effects | **Tin kênh cũ hiện khi đổi channel** | Socket event không clear khi mismatch | Luôn `clearNewMessageChannel()` sau xử lý |
| **High** | Frontend | `cordigram-web/app/(main)/messages/page.tsx` | upload handlers | **DM attachment qua socket không rollback lỗi** | `emitSendMessage` chỉ warn khi disconnect | Dùng REST hoặc ack + rollback optimistic UI |
| **High** | Mobile / Call | `cordigram-mobile/.../call/dm_call_manager.dart` | onAuthChanged | **Voice channel không teardown khi logout** | Chỉ clear DM socket, không `VoiceChannelSessionController.leave()` | Gọi leave voice + clear PiP on logout |
| **High** | Mobile / Socket | `cordigram-mobile/.../direct_messages_realtime_service.dart` | disconnect | **Socket handlers không off hết** (`user-typing`, `user-profile-style-updated`) | Teardown không đối xứng connect | Mirror mọi `socket.on` bằng `socket.off` |
| **Medium** | Backend / Permission | `cordigram-backend/src/servers/servers.service.ts` | ~1753 | **`removeMemberFromServer` owner-only** vs `kickMember` dùng `kickMembers` | Legacy endpoint | Delegate kick permission + hierarchy |
| **Medium** | Backend / Permission | `cordigram-backend/src/servers/servers.service.ts` | ~219 | **Prune filter dùng `member.role` legacy** | Không dùng custom roles | Dùng `rolesService` |
| **Medium** | Backend / Socket | `cordigram-backend/src/direct-messages/direct-messages.gateway.ts` | ~563 | **Presence subscribe bất kỳ userId** | Không gate friendship/conversation | Giới hạn peer trong DM list |
| **Medium** | Backend / Socket | `cordigram-backend/src/dm-call/dm-call-session.service.ts` | ~108 | **Race concurrent call initiate** | Check-then-set không atomic | Redis `SET NX` làm gate bắt buộc production |
| **Medium** | Backend / Memory | `cordigram-backend/src/dm-call/dm-call-session.service.ts` | ~31 | **`persistedCallIds` Set không giới hạn** | Memory leak lâu dài | TTL / evict |
| **Medium** | Backend / Memory | `cordigram-backend/src/direct-messages/direct-messages.gateway.ts` | ~38 | **`dmPresenceSubs` leak** — không unsubscribe | Thiếu handler unsubscribe | Thêm `presence-unsubscribe`, cap size |
| **Medium** | Backend / API | `cordigram-backend/src/channels/channels.controller.ts` | ~27 | **Category body không DTO validate** | Inline `@Body()` object | DTO class + ValidationPipe |
| **Medium** | Database | `cordigram-backend/src/messages/message.schema.ts` | indexes | **Thiếu compound index** `{ channelId, createdAt }` | Chỉ index đơn | Thêm index cho pagination/search |
| **Medium** | Database | `cordigram-backend/src/direct-messages/direct-message.schema.ts` | indexes | **Thiếu index hội thoại/unread** | Query nhiều field | Compound indexes sender/receiver/read |
| **Medium** | Frontend | `cordigram-web/lib/servers-api.ts` | permissions fallback | **`canCreateInvite: true` khi API lỗi** | Fallback optimistic | Default false + retry |
| **Medium** | Frontend | `cordigram-web/components/ServerContextMenu/ServerContextMenu.tsx` | mark read | **「Đánh dấu đã đọc」server không làm gì** | Handler chỉ đóng menu | Mark all channels read hoặc xóa mục |
| **Medium** | Frontend | `cordigram-web/components/ServerContextMenu/ServerContextMenu.tsx` | mute events | **Checkbox「Tắt sự kiện mới」không wired** | Không onChange | Wire prefs hoặc ẩn |
| **Medium** | Frontend | `cordigram-web/app/(main)/messages/page.tsx` | showAllChannels | **Toggle「Hiện tất cả kênh」vô hiệu** | State không filter UI | Apply filter hoặc xóa |
| **Medium** | Frontend / Socket | `cordigram-web/hooks/use-channel-messages.ts` | reconnect | **Channel socket ít resilient hơn DM** (5 vs 20 retry) | Config khác nhau | Đồng bộ options + banner offline |
| **Medium** | Frontend | `cordigram-web/app/(main)/messages/page.tsx` | ~14k lines | **Monolith re-render toàn UI** | Một component khổng lồ | Tách sidebar/chat/calls, memo |
| **Medium** | Mobile / Permission | `cordigram-mobile/.../server_permissions.dart` | fromJson | **`canCreateInvite` default true** | Khác các flag khác (false) | Default false |
| **Medium** | Mobile / Permission | `cordigram-mobile/.../servers_service.dart` | getCurrentUserPermissions | **Lỗi API → ownerFallback toàn quyền** | Catch trả owner template | Unknown state + retry |
| **Medium** | Mobile / Call | `cordigram-mobile/.../voice_channel_session_controller.dart` | join | **Voice join không xin quyền mic/camera** | Thiếu permission_handler | Preflight như `NativeCallScreen` |
| **Medium** | Mobile / Socket | `cordigram-mobile/.../direct_messages_realtime_service.dart` | connect | **Presence không re-subscribe sau reconnect** | Chỉ subscribe sau load threads | Cache peer IDs, re-emit on connect |
| **Medium** | Mobile / Socket | `cordigram-mobile/.../channel_messages_realtime_service.dart` | disconnect | **Thiếu off `join-application-updated`** | Teardown không đủ | Thêm socket.off |
| **Medium** | Mobile / Error | `cordigram-mobile/.../messages_controller.dart` | refresh* | **Nuốt lỗi im lặng** `catch (_) {}` | Không UX lỗi | Flag error + snackbar/retry |
| **Medium** | UI/UX | `cordigram-web/components/ServerEvents/EventsPopup.tsx` | header | **Nút X đè「Tạo sự kiện」** (đã sửa gần đây) | absolute positioning | Header flex — **đã fix** |
| **Medium** | UI/UX | `cordigram-web/components/ServerContextMenu/ServerContextMenu.tsx` | position | **Menu tràn viewport server cuối list** (đã sửa) | Không clamp | useLayoutEffect clamp — **đã fix** |
| **Low** | Backend / Perf | `cordigram-backend/src/direct-messages/direct-messages.service.ts` | ~346 | **N+1 profile trong getConversation** | Map async per message | Batch fetch profiles |
| **Low** | Backend / Perf | `cordigram-backend/src/inbox/inbox.service.ts` | ~241 | **N+1 unread per channel** | Loop per channel | Aggregate query |
| **Low** | API | Backend schemas | — | **DM `type` vs channel `messageType`** | Schema lịch sử | Document / normalize response |
| **Low** | Frontend | `cordigram-web/hooks/calls/use-calls.ts` | — | **Dead code — socket DM thứ 2** | Không import | Xóa hoặc merge |
| **Low** | Frontend / Security | `cordigram-web/app/call/page.tsx` | URL | **JWT trong query `accessToken`** | Tab handoff | sessionStorage / short-lived ticket |
| **Low** | Mobile | `flutter analyze` | nhiều file | **79 issues** (0 error, 15 warning, 64 info) | Dead imports, deprecated Radio | Cleanup theo analyzer |
| **Low** | Mobile / Dead | `server_audit_log_screen.dart` | — | **Màn audit log không link hub** (đã ẩn cố ý) | Unwired | Giữ ẩn hoặc link khi cần |
| **Low** | UI/UX | `cordigram-mobile/.../voice_channel_room_screen.dart` | bottom bar | **5 nút 52px có thể overflow màn hẹp** | Row cố định | FittedBox / scroll |

---

# Tổng quan dự án (Messages)

| Tầng | Quy mô (ước lượng) | Đánh giá |
|------|-------------------|----------|
| **Backend** | ~15 module messaging (DM, messages, channels, roles, livekit, dm-call, events, inbox, …) | Logic nghiệp vụ đầy đủ; **nhiều lỗ hổng authorization** ở read/search/token |
| **Web** | `page.tsx` ~14k dòng + ~50 component messages | Feature-complete; **monolith**, silent errors, env API split |
| **Mobile** | `lib/features/messages` ~115 file | Parity ~90% web; **socket lifecycle + permission fallback** cần cứng hóa |
| **Realtime** | 2 namespace Socket.IO + LiveKit | Call cross-platform OK; **signaling cần harden** |
| **Database** | MongoDB schemas | Thiếu một số compound index; N+1 ở hot path |

### Đã sửa gần đây (trong phiên phát triển trước)

- `manageEvents` backend dùng `RolesService.hasPermission` (thay legacy owner/moderator)
- Category CRUD backend thêm `assertCanManageChannels`
- Web EventsPopup: ẩn「Tạo sự kiện」khi không có quyền; sửa header X overlap
- Web ServerContextMenu: clamp menu trong viewport
- Mobile display name style, sharePresence, profile editor nâng cấp

---

# Lỗi Critical

1. **IDOR search tin nhắn kênh** — rò rỉ nội dung server private cho user ngoài server.
2. **LiveKit token không authorize room** — join phòng DM/voice của người khác nếu biết `roomName`.

→ **Không được deploy production** cho đến khi sửa 2 mục này.

---

# Lỗi Backend

- Permission legacy `member.role` còn ở prune, removeMember, một số path cũ.
- Gateway DM: global broadcast presence/reaction (legacy), ICE/call-reject chưa verify session.
- `createDirectMessage` cho phép client gửi `type: 'call'` qua REST.
- `call-end` tin tưởng `durationSec` từ client.
- `getConversation()` nuốt lỗi → trả `[]` (UI hiểu nhầm empty).
- Events GET thiếu membership (POST create đã fix `manageEvents`).

---

# Lỗi API

- **Web env split:** `NEXT_PUBLIC_API_BASE` (api.ts, socket) vs `NEXT_PUBLIC_API_BASE_URL` (servers-api internal fetch).
- Channel category/reorder body không qua DTO → thiếu validate length/format.
- Polls `throw new Error('Forbidden')` → HTTP 500 thay vì 403.
- Field naming: `type` (DM) vs `messageType` (channel) — mobile xử lý cả hai, dễ lệch khi thêm client mới.
- `updateDirectMessage` body `@Body() any` — bypass DTO.

---

# Lỗi Database

| Vấn đề | Ảnh hưởng | Khuyến nghị |
|--------|-----------|-------------|
| Thiếu `{ channelId: 1, createdAt: -1 }` | Search/pagination chậm khi scale | Migration index |
| Thiếu DM conversation compound indexes | Unread/list chậm | Thêm sender/receiver/read indexes |
| N+1 getConversation, inbox unread, mod member list | Latency tăng theo số tin/kênh | Batch queries |
| `members.role` legacy vs custom roles | Data không đồng bộ UI permission | Computed từ rolesService |

Không dùng SQL migration (MongoDB) — cần script index + monitor `explain()`.

---

# Lỗi Frontend

### Web
- Monolith `page.tsx` — khó test, re-render nặng, dễ regression.
- Nhiều `.catch(() => {})` — mất mạng/API lỗi không báo user.
- `isConnected` (DM socket) không dùng cho UI offline.
- Permission fallback context menu/server khi API fail → hiện quyền sai.
- Duplicate `join-channel` effects (3 chỗ).
- JWT call tab trong URL.

### Mobile
- `flutter analyze`: 79 issues (chủ yếu info deprecated Radio/Dropdown).
- `use_build_context_synchronously` ở create-server dialog, join flow, channel scroll.
- Dead code: unused picker flags, settings helpers, unused imports.
- Pinned messages dùng root Navigator thay vì `pushMessages`.
- `MessagesController` không disconnect socket (by design cho call) — cần ref-count.

---

# Lỗi UI/UX

| Vấn đề | Nền tảng | Trạng thái |
|--------|----------|------------|
| Events popup X đè nút Tạo | Web | **Đã sửa** |
| Server context menu tràn màn hình | Web | **Đã sửa** |
| Giao diện settings overflow (Galaxy) | Mobile | Đã cải thiện trước đó — cần test lại nhiều device |
| Voice room bottom bar overflow | Mobile | Chưa sửa |
|「Đánh dấu đã đọc」server vô nghĩa | Web | Chưa sửa |
| Checkbox mute events / show all channels | Web | Chưa wired |
| Modal z-index không thống nhất | Web | Low — chồng modal settings |

---

# Lỗi Socket / Call

| # | Vấn đề | Mức |
|---|--------|-----|
| 1 | LiveKit token không check room membership | Critical |
| 2 | ICE relay không verify call session | High |
| 3 | call-reject spoof / call-answer không try/catch | High |
| 4 | DM call session race multi-tab/multi-instance | Medium |
| 5 | Presence subscribe quá rộng + leak subs map | Medium |
| 6 | Mobile: presence không re-subscribe sau reconnect | Medium |
| 7 | Mobile: voice session sống sau logout | High |
| 8 | Web: channel socket stale message on switch | High |
| 9 | Web: DM media send qua socket không error UX | High |
| 10 | Web ↔ Mobile call interop | **Hoạt động** (cùng signaling + LiveKit naming) |

**Single active call:** Backend có `DmCallSessionService` + `call-busy` — **cơ bản OK**, cần Redis bắt buộc production.

---

# Lỗi Bảo mật (tóm tắt)

| Mức | Số lượng (ước lượng) | Ví dụ |
|-----|---------------------|-------|
| Critical | 2 | Search IDOR, LiveKit token |
| High | 10+ | ICE relay, reaction IDOR, SSRF link-preview, block DM, JWT fallback |
| Medium | 8+ | Presence leak, client call duration, legacy role prune |

**Authentication:** JWT trên REST/socket — OK cơ bản; cần thống nhất validate token type.  
**Authorization:** Custom roles **đã có** (`RolesService`) nhưng **chưa áp dụng đồng đều** trên read/search/token/signaling.

---

# Tối ưu hiệu năng

1. Compound indexes MongoDB (channel + DM).
2. Batch profile fetch trong `getConversation`.
3. Aggregate inbox unread thay vì N+1 per channel.
4. Tách `page.tsx` web → giảm re-render.
5. Mobile: tránh rebuild list chat không cần `notifyListeners()`.
6. Gateway: bỏ `server.emit` global presence (chỉ emit subscriber).

---

# Đề xuất Refactor

| Ưu tiên | Hạng mục |
|---------|----------|
| P0 | Security patch list (Critical + High security) |
| P1 | Thống nhất `apiBaseUrl` web; permission helpers shared web/mobile |
| P2 | Tách `MessagesPage` → `MessagesSidebar`, `MessagesChat`, `MessagesCallLayer` |
| P3 | `PermissionService` backend — một hàm authorize cho REST + socket + LiveKit |
| P4 | Mobile socket ref-count + unified teardown on logout |
| P5 | DTO validation toàn bộ channel/category endpoints |
| P6 | Cleanup analyzer warnings + dead code |

---

# Điểm sẵn sàng Production (Messages only)

## **58 / 100**

| Tiêu chí | Điểm | Ghi chú |
|----------|------|---------|
| Chức năng core (DM, channel, voice, call) | 78/100 | Feature parity web/mobile tốt |
| Bảo mật & authorization | **35/100** | Critical IDOR + LiveKit blocker |
| Ổn định / error handling | 55/100 | Silent catch nhiều |
| Realtime / Call | 65/100 | Interop OK; signaling cần harden |
| UI/UX | 70/100 | Một số dead menu; overflow mobile voice |
| Hiệu năng / scale | 60/100 | N+1 + thiếu index |
| Code maintainability | 45/100 | Web monolith 14k lines |
| Test / CI coverage messages | 40/100 | Ít test tự động phạm vi messages |

### Kết luận

- **Demo / nội bộ / capstone:** Có thể chạy nếu biết rủi ro bảo mật.
- **Production công khai:** **Chưa sẵn sàng** — bắt buộc sửa Critical + High security trước.
- **Roadmap ngắn (2–3 tuần):** P0 security → API URL unify → socket lifecycle mobile → index DB → tách page.tsx.

---

# Checklist sửa theo thứ tự (actionable)

- [ ] **P0** Fix IDOR `searchMessages` + membership check events/channels read
- [ ] **P0** Authorize `POST /livekit/token` theo room type
- [ ] **P0** Harden call signaling (ICE, reject, answer)
- [ ] **P1** Unify `NEXT_PUBLIC_API_BASE` trên web
- [ ] **P1** Fix permission UI (`canManageChannelsStructure`, invite fallback)
- [ ] **P1** Mobile logout → leave voice; socket off + presence resubscribe
- [ ] **P2** Wire hoặc xóa dead context menu items (web)
- [ ] **P2** MongoDB compound indexes
- [ ] **P3** Refactor `page.tsx` + error surfacing
- [ ] **P3** Flutter analyzer cleanup (warnings)

---

*Báo cáo này tập trung Messages; không thay thế pentest chuyên sâu hoặc load test production.*
