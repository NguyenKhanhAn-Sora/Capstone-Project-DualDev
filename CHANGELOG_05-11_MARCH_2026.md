# Tổng hợp chức năng phát triển (5–11 tháng 3 năm 2026)

Tài liệu tổng hợp toàn bộ chức năng đã triển khai trong khoảng thời gian từ **5/3/2026** đến **11/3/2026** cho dự án Cordigram (backend + web).

---

## 1. Menu ngữ cảnh thành viên (nút 3 chấm)

- **Vị trí:** Danh sách thành viên máy chủ (Server Members) — cột Tín hiệu, nút ba chấm bên cạnh mỗi thành viên.
- **Nội dung menu:**
  - **Cho mọi người:** Hồ sơ, Nhắn tin, Đổi biệt danh, Bỏ qua, Chặn (Chặn hiển thị màu đỏ).
  - **Chỉ chủ server:** Mở trong Chế Độ Hiển Thị Mod, Hạn chế [username], Đuổi [username], Cấm [username], Chuyển Quyền Sở Hữu (các mục nguy hiểm màu đỏ).

**File liên quan:** `cordigram-web/components/MemberContextMenu/`

---

## 2. Popup hồ sơ thành viên (Hồ sơ)

- **Kích hoạt:** Chọn **Hồ sơ** trong menu 3 chấm hoặc bấm **icon người** (iconBtn) bên cạnh tên thành viên.
- **Nội dung:**
  - Banner, avatar, tên hiển thị, username.
  - **Follow / Đã follow:** Thay "Thêm Bạn" bằng **Follow**; nếu đã follow thì hiển thị **Đã follow** (màu xám).
  - Tab **Follower chung** thay cho "Không có bạn chung".
  - **Nhắn tin:** Mở DM với thành viên đó (chuyển sang trang tin nhắn và load hội thoại).
  - Gia nhập từ (server + Discord), Vai trò, Ghi chú (chỉ mình bạn thấy).

**File liên quan:** `cordigram-web/components/MemberProfilePopup/`, `cordigram-web/lib/api.ts` (checkFollowStatus, followUser, unfollowUser)

---

## 3. Đổi biệt danh

- Chỉ **chủ server** mới có quyền đổi biệt danh cho thành viên trong máy chủ.
- Hiện tại có xử lý placeholder/thông báo; phần lưu biệt danh theo server có thể bổ sung sau (backend + modal).

---

## 4. Bỏ qua (Ignore) và popup Bỏ qua

- **Popup "Bỏ qua [tên]?":**
  - Ẩn hồ sơ và tin nhắn của họ.
  - Tắt thông báo và hoạt động (DM, kênh chat, kênh thoại trong server).
  - Ai cũng có thể bỏ qua nhau (không chỉ chủ server).
  - Phần **"Vẫn không đủ sao? Thay vào đó, hãy chặn"**: nút **Chặn** (không còn "Xem chi tiết"). Chặn = không nhận tin nhắn/cuộc gọi từ người đó (DM và kênh trong server).

- **Backend – Bỏ qua được lưu:**
  - Schema `Ignored` (userId, ignoredUserId).
  - API: `POST /users/:id/ignore`, `DELETE /users/:id/ignore`, `GET /users/ignored-ids`, `GET /users/:id/is-ignored`.
  - Tin nhắn từ người bị bỏ qua **không hiển thị** trong DM và kênh chat server (lọc ở backend).

**File liên quan:** `cordigram-backend/src/users/ignored.schema.ts`, `ignored.service.ts`, `cordigram-web/components/IgnoreUserPopup/`, `cordigram-web/lib/api.ts` (ignoreUser, unignoreUser, checkIgnoreStatus)

---

## 5. Chế độ “Đã bỏ qua” – Hủy bỏ / Khôi phục

- Nếu user **đã bỏ qua** thành viên đó, khi mở lại mục Bỏ qua sẽ hiển thị:
  - **"Bạn đã bỏ qua [tên]"**
  - Mô tả: Khôi phục để nhắn tin và nhận thông báo như bình thường (DM và kênh chat server).
  - Nút **Hủy bỏ** và **Khôi phục**.
- **Khôi phục:** Gọi unignore → tin nhắn và thông báo từ người đó hiển thị lại bình thường.

---

## 6. Hộp thư đến – Tab “Chưa đọc”

- **DM:** Thông báo dạng **"[displayName] nhắn tin cho bạn"** + nội dung tin nhắn bên dưới.
- **Server:** Thông báo **"tên server, #tên kênh"** + nội dung tin nhắn bên dưới.
- Tin từ người bị **bỏ qua** không xuất hiện trong Chưa đọc.
- Click vào mục → nhảy tới DM hoặc kênh tương ứng; DM mở đúng hội thoại và load tin nhắn.

**File liên quan:** `cordigram-backend/src/inbox/inbox.service.ts` (getUnread), `cordigram-web/components/MessagesInbox/`, `cordigram-web/lib/inbox-api.ts`

---

## 7. Sửa lỗi: Tin nhắn người bị bỏ qua vẫn hiện

- **Trước:** Chỉ ẩn thông báo trong hộp thư; tin trong DM/kênh vẫn hiện.
- **Sau:** Backend lọc tin nhắn theo danh sách ignore:
  - **DM:** `DirectMessagesService.getConversation()` không trả về tin có senderId nằm trong danh sách bỏ qua của người xem.
  - **Kênh:** `MessagesService.getMessagesByChannelId(..., viewerId)` loại tin từ người bị viewer bỏ qua.

---

## 8. Sửa lỗi WebSocket – ChannelMessagesGateway

- **Lỗi:** `TypeError: Cannot read properties of undefined (reading 'join')` tại `handleJoinChannel`.
- **Cách sửa:** Dùng `@ConnectedSocket()` để lấy đúng socket client; thêm kiểm tra `client?.join` / `client?.leave` trước khi gọi.

**File:** `cordigram-backend/src/messages/channel-messages.gateway.ts`

---

## 9. Hộp thư – Chấm đỏ thay badge

- Xóa badge (chấm góc trên phải nút).
- Hiển thị **chấm đỏ bên phải** nút hộp thư khi có thông báo (Dành cho Bạn chưa xem).

**File:** `cordigram-web/app/(main)/messages/messages.module.css`, `page.tsx` (inboxBtnWrap, inboxDot)

---

## 10. Danh sách DM – Chấm đỏ và số tin chưa đọc

- **Danh sách bạn (friends list):** Mỗi cuộc hội thoại có tin chưa đọc → hiển thị **chấm đỏ + số** bên phải dòng.
- **Khi mở chat:** Gọi clear unread (optimistic) → chấm/số của cuộc hội thoại đó biến mất; tin được đánh dấu đọc (mark as read) như hiện tại.
- **Tin mới qua WebSocket:** Nếu đang xem cuộc khác thì tăng unread count cho cuộc nhận tin.
- **API:** `getConversationList` (GET /direct-messages/conversations) trả về unreadCount theo từng user; frontend dùng để hiển thị và cập nhật.
- **Đã bỏ:** Chấm đỏ/số bên cạnh tiêu đề "DIRECT MESSAGES" (chỉ giữ chấm + số trên từng dòng bạn bè).

**File:** `cordigram-web/app/(main)/messages/page.tsx` (dmUnreadCounts, getConversationList), `cordigram-web/lib/api.ts`, `messages.module.css`

---

## 11. Chuyển quyền sở hữu máy chủ

- **Quy tắc:** A (chủ) chuyển cho B → **B thành chủ**, **A thành thành viên**.
- **Backend:**
  - `ServersService.transferOwnership(serverId, currentOwnerUserId, newOwnerId)`.
  - Chỉ chủ hiện tại gọi được; newOwnerId phải là thành viên và không phải chủ hiện tại.
  - Cập nhật `server.ownerId` và role trong `members`: chủ cũ → `member`, người nhận → `owner`.
  - API: `PATCH /servers/:id/transfer-ownership` body `{ newOwnerId: string }`.
- **Frontend:**
  - Trong menu 3 chấm của thành viên (chỉ khi bạn là chủ): mục **Chuyển Quyền Sở Hữu** (chỉ hiện với thành viên khác, không phải chủ, không phải mình).
  - Chọn → mở **popup xác nhận:** "Chuyển quyền sở hữu máy chủ cho [tên]? Người này sẽ trở thành chủ máy chủ, bạn sẽ trở thành thành viên." → **Hủy bỏ** / **Chuyển quyền**.
  - Sau khi chuyển thành công: gọi `onOwnershipTransferred()` → đóng panel cài đặt server và refresh danh sách server.
- **Icon (iconBtn) cạnh tên thành viên:** Bấm vào → mở **popup hồ sơ** thành viên (giống chọn "Hồ sơ" trong menu).

**File:** `cordigram-backend/src/servers/servers.service.ts`, `servers.controller.ts`, `cordigram-web/lib/servers-api.ts` (transferServerOwnership), `cordigram-web/components/ServerMembersSection/`

---

## Tóm tắt file / module chính

| Khu vực | File / thư mục |
|--------|-----------------|
| Menu thành viên | `MemberContextMenu/` |
| Popup hồ sơ | `MemberProfilePopup/` |
| Popup bỏ qua | `IgnoreUserPopup/` |
| Backend ignore | `users/ignored.schema.ts`, `ignored.service.ts`, users.controller (ignore/unignore, is-ignored, ignored-ids) |
| Lọc DM/kênh theo ignore | `direct-messages.service.ts`, `messages.service.ts` (getConversation, getMessagesByChannelId + viewerId) |
| Inbox Chưa đọc | `inbox/inbox.service.ts` (getUnread), `MessagesInbox/`, `inbox-api.ts` |
| WebSocket kênh | `channel-messages.gateway.ts` (@ConnectedSocket) |
| Unread DM UI | `messages/page.tsx` (dmUnreadCounts, getConversationList), `messages.module.css` |
| Chuyển quyền sở hữu | `servers.service.ts`, `servers.controller.ts`, `ServerMembersSection` (popup + onTransferOwnership, iconBtn → profile) |

---

*Tài liệu tổng hợp theo nội dung phát triển từ 5–11/3/2026.*
