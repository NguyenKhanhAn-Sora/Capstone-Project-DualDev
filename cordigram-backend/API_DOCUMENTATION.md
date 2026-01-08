# Cordigram Chat API Documentation

## Overview
Backend API for managing Servers, Channels, and Messages in Cordigram chat application.

---

## API Endpoints

### SERVERS

#### Create Server
**POST** `/servers`
```json
{
  "name": "My Server",
  "description": "Server description",
  "avatarUrl": "https://example.com/avatar.png"
}
```
**Response:** Server object with default channels (text "general" and voice "general")

#### Get My Servers
**GET** `/servers`
**Response:** Array of servers where user is a member

#### Get Server by ID
**GET** `/servers/:id`
**Response:** Server object with channels populated

#### Update Server
**PATCH** `/servers/:id`
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "avatarUrl": "https://example.com/new-avatar.png"
}
```
**Response:** Updated server object

#### Delete Server
**DELETE** `/servers/:id`
**Note:** Only server owner can delete

---

### CHANNELS

#### Create Channel
**POST** `/servers/:serverId/channels`
```json
{
  "name": "announcements",
  "type": "text",
  "description": "Important announcements"
}
```
**Response:** Channel object

#### Get Channels by Server
**GET** `/servers/:serverId/channels`
**Query params:** 
- `type`: "text" or "voice" (optional - filter by type)

**Response:** Array of channels

#### Get Channel by ID
**GET** `/servers/:serverId/channels/:id`
**Response:** Channel object

#### Update Channel
**PATCH** `/servers/:serverId/channels/:id`
```json
{
  "name": "new-name",
  "description": "new description"
}
```
**Response:** Updated channel object

#### Delete Channel
**DELETE** `/servers/:serverId/channels/:id`
**Note:** Cannot delete default channels, only creator can delete

---

### MESSAGES

#### Create Message
**POST** `/channels/:channelId/messages`
```json
{
  "content": "Hello, everyone!",
  "attachments": []
}
```
**Response:** Message object

#### Get Messages by Channel
**GET** `/channels/:channelId/messages`
**Query params:**
- `limit`: 50 (default) - number of messages to fetch
- `skip`: 0 (default) - pagination offset

**Response:** Array of messages (sorted by newest first)

#### Get Message by ID
**GET** `/channels/:channelId/messages/:id`
**Response:** Message object

#### Update Message
**PATCH** `/channels/:channelId/messages/:id`
```json
{
  "content": "Updated message content"
}
```
**Response:** Updated message object with `isEdited: true`

#### Delete Message
**DELETE** `/channels/:channelId/messages/:id`
**Note:** Message is soft-deleted (marked as deleted but not removed)

#### Add/Remove Reaction
**POST** `/channels/:channelId/messages/:id/reactions/:emoji`
Example: `/channels/xxx/messages/yyy/reactions/👍`
**Response:** Message object with updated reactions
**Note:** Calling same endpoint twice removes the reaction

---

## Database Schema

### Server
- `name`: String (required)
- `description`: String (nullable)
- `avatarUrl`: String (nullable)
- `ownerId`: ObjectId (User reference)
- `members`: Array of objects with userId, role, joinedAt
- `channels`: Array of ObjectIds (Channel references)
- `memberCount`: Number
- `isActive`: Boolean
- `timestamps`: createdAt, updatedAt

### Channel
- `name`: String (required)
- `type`: 'text' | 'voice' (required)
- `description`: String (nullable)
- `serverId`: ObjectId (Server reference)
- `createdBy`: ObjectId (User reference)
- `isDefault`: Boolean (true for auto-generated channels)
- `permissions`: Array of objects with userId and permissions
- `messageCount`: Number
- `isActive`: Boolean
- `timestamps`: createdAt, updatedAt

### Message
- `channelId`: ObjectId (Channel reference)
- `senderId`: ObjectId (User reference)
- `content`: String (required)
- `attachments`: Array of strings (URLs)
- `reactions`: Array of objects with userId and emoji
- `isEdited`: Boolean
- `editedAt`: Date (nullable)
- `isDeleted`: Boolean
- `timestamps`: createdAt, updatedAt

---

## Logic Flow

### When User Logs In:
1. Frontend requests user's servers: `GET /servers`
2. Each server contains channels array with text and voice channels
3. Display servers in left sidebar (below logo and create button)

### When User Creates Server:
1. Frontend: `POST /servers` with server name
2. Backend automatically creates:
   - Text channel named "general" (isDefault: true)
   - Voice channel named "general" (isDefault: true)
3. Server object returned with channels populated
4. Frontend adds to servers list in sidebar

### When User Creates Channel:
1. Frontend: `POST /servers/:serverId/channels` with name and type
2. Channel added to server's channels array
3. Frontend displays in appropriate section (text or voice)

### When User Sends Message:
1. Frontend: `POST /channels/:channelId/messages` with content
2. Backend creates message with senderId
3. Backend increments channel's messageCount
4. Message returned with sender info populated
5. Frontend displays in chat area with proper styling (sent/received)

---

## Integration with Frontend

### 1. Fetch Servers on App Load
```javascript
const servers = await fetch('/servers', {
  headers: { Authorization: `Bearer ${token}` }
});
```

### 2. Fetch Channels for Selected Server
```javascript
const channels = await fetch(`/servers/${serverId}/channels`, {
  headers: { Authorization: `Bearer ${token}` }
});
```

### 3. Fetch Messages for Selected Channel
```javascript
const messages = await fetch(
  `/channels/${channelId}/messages?limit=50&skip=0`,
  { headers: { Authorization: `Bearer ${token}` } }
);
```

### 4. Send Message
```javascript
const message = await fetch(
  `/channels/${channelId}/messages`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: messageText })
  }
);
```

---

## Error Responses

- `400 Bad Request`: Invalid input data
- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: User doesn't have permission for this action
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

All error responses include a message field explaining the error.
