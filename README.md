<div align="center">

# 🌐 Cordigram

### A full-stack social media platform inspired by Instagram & Discord

*Built as a capstone project at VTC Academy — designed, developed, and deployed end-to-end by a two-person team over 6 months.*

<br/>

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Flutter](https://img.shields.io/badge/Flutter-02569B?style=for-the-badge&logo=flutter&logoColor=white)](https://flutter.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://socket.io/)

</div>

---

## 📖 Overview

**Cordigram** is a modern social media platform that combines the visual content-sharing experience of **Instagram** with the community-based server/channel system of **Discord** — all in one unified application.

The goal of this project was not to compete with existing platforms, but to deeply study and re-implement their core mechanics as a learning exercise — building every layer from scratch: database design, REST API, real-time communication, media handling, payments, and cross-platform mobile development.

> Built by a 2-person team as a graduation capstone project at **VTC Academy**, 2026.

---

## Key Features

### Users & Authentication
- Email/password registration with OTP email verification
- Google OAuth 2.0 single sign-on
- JWT-based authentication with refresh token rotation
- Creator verification badge system
- User blocking, muting, and privacy settings

### Social Content
- **Posts** — image/video posts with captions, hashtags, visibility settings, and scheduled publishing
- **Reels** — short-form video feed with auto-generated captions (Whisper AI)
- **Interactions** — like, comment, save, repost, share
- **Polls** — create interactive polls within posts
- **Hashtags** — trending hashtags with impression tracking
- **Multi-language content** — auto-translate posts via DeepL API

### Messaging
- **Direct Messages (DM)** — real-time one-on-one chat
- **Servers & Channels** — Discord-style community spaces with role-based access
- **Channel messaging** — text, images, and media in channels
- **Server invites** — shareable invite links with expiration control

### Live & Calls
- **Livestreaming** — broadcast live to followers or within a server (LiveKit)
- **Video & Audio calls** — P2P and group calls with real-time signaling (LiveKit + WebRTC)

### Notifications
- Real-time push notifications (Socket.IO + Firebase FCM)
- Notification types: follows, likes, comments, mentions, DMs, livestreams
- Granular notification mute controls per user/channel

### Discovery
- **Explore feed** — algorithm-driven content discovery
- **Following feed** — chronological posts from followed accounts
- **Search** — unified search across users, posts, reels, and hashtags

### Monetization
- **Ads system** — create and manage ad campaigns with targeting
- **Stripe payments** — checkout flow for ad campaigns and premium features
- **Boost** — premium profile upgrades (animated GIF avatar, custom banner)

### Admin & Moderation
- Content moderation panel (review flagged posts, comments, users)
- Report handling system (post / comment / user / problem reports)
- Automated media analysis (AWS Rekognition)
- Moderation action logs with full audit trail
- Broadcast system notices to all users
- Creator verification review queue

---

## Tech Stack

### Backend — `cordigram-backend`
| Layer | Technology |
|-------|-----------|
| Framework | NestJS (TypeScript) |
| Database | MongoDB + Mongoose ODM |
| Cache | Redis (ioredis) |
| Real-time | Socket.IO + WebSockets |
| Auth | Passport.js, JWT, Google OAuth 2.0 |
| Media Storage | Cloudinary, AWS S3 |
| Live / Calls | LiveKit Server SDK |
| Payments | Stripe |
| Task Queue | BullMQ |
| Email | Nodemailer |
| AI / Captions | OpenAI Whisper |
| Translation | DeepL API |
| Content Safety | AWS Rekognition |
| Testing | Jest |

### Web Frontend — `cordigram-web`
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Real-time | Socket.IO Client, LiveKit JS SDK |
| i18n | next-intl |
| Testing | Playwright (E2E), Vitest (Unit) |

### Mobile — `cordigram-mobile`
| Layer | Technology |
|-------|-----------|
| Framework | Flutter (Dart 3.9+) |
| Platforms | iOS & Android |
| Real-time | socket_io_client |
| Live / Calls | livekit_client |
| Push Notifications | Firebase Cloud Messaging |
| Media | camera, image_picker, video_player |
| Local Storage | shared_preferences |

### Admin Dashboard — `cordigram-admin`
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Clients                            │
│   ┌──────────────┐  ┌───────────┐  ┌─────────────────┐ │
│   │  Web (Next)  │  │  Mobile   │  │  Admin (Next)   │ │
│   │              │  │ (Flutter) │  │                 │ │
│   └──────┬───────┘  └─────┬─────┘  └────────┬────────┘ │
└──────────┼────────────────┼─────────────────┼───────────┘
           │                │                 │
           ▼                ▼                 ▼
┌──────────────────────────────────────────────────────────┐
│               NestJS REST API + Socket.IO                │
│                   (cordigram-backend)                    │
│                                                          │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│   │  MongoDB │  │  Redis   │  │  BullMQ  │              │
│   └──────────┘  └──────────┘  └──────────┘              │
└────────────────────────┬─────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     ┌─────────┐   ┌──────────┐   ┌──────────┐
     │LiveKit  │   │Cloudinary│   │  Stripe  │
     │(Video)  │   │/ AWS S3  │   │(Payments)│
     └─────────┘   └──────────┘   └──────────┘
```

---

## 📁 Project Structure

```
Capstone-Project-DualDev/
├── cordigram-backend/          # NestJS REST API & WebSocket server
│   └── src/
│       ├── auth/               # Authentication & authorization
│       ├── users/              # User management & profiles
│       ├── posts/              # Posts, reels, interactions
│       ├── comments/           # Comments & reactions
│       ├── messages/           # Server channel messaging
│       ├── direct-messages/    # One-on-one DMs
│       ├── servers/            # Community servers
│       ├── channels/           # Server channels
│       ├── livestream/         # Live streaming
│       ├── call/               # Video & audio calls
│       ├── notifications/      # Real-time notifications
│       ├── hashtags/           # Hashtag tracking
│       ├── search/             # Global search
│       ├── payments/           # Stripe integration
│       ├── moderation/         # Content moderation
│       ├── admin/              # Admin operations
│       └── ...
│
├── cordigram-web/              # Next.js web application
│   └── app/
│       ├── (auth)/             # Login, signup, OAuth
│       ├── (main)/             # Authenticated user routes
│       │   ├── page.tsx        # Home feed
│       │   ├── explore/        # Explore page
│       │   ├── reels/          # Reels feed
│       │   ├── messages/       # DM & server messaging
│       │   ├── search/         # Search
│       │   ├── profile/        # User profiles
│       │   ├── livestream/     # Live streams
│       │   ├── boost/          # Premium features
│       │   └── ads/            # Ad management
│       └── (admin)/            # Admin dashboard routes
│
├── cordigram-mobile/           # Flutter mobile app (iOS & Android)
│   └── lib/
│       ├── screens/            # App screens
│       ├── widgets/            # Reusable UI components
│       ├── services/           # API & socket services
│       └── models/             # Data models
│
└── cordigram-admin/            # Standalone admin dashboard (Next.js)
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- Flutter 3.9+
- MongoDB (local or Atlas)
- Redis

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/Capstone-Project-DualDev.git
cd Capstone-Project-DualDev
```

### 2. Backend setup
```bash
cd cordigram-backend
cp .env.example .env        # Fill in your environment variables
npm install
npm run start:dev
```

### 3. Web setup
```bash
cd cordigram-web
cp .env.example .env.local  # Fill in your environment variables
npm install
npm run dev
```

### 4. Mobile setup
```bash
cd cordigram-mobile
flutter pub get
flutter run
```

### 5. Admin dashboard setup
```bash
cd cordigram-admin
cp .env.example .env.local
npm install
npm run dev
```

## 📱 Screenshots

> *Coming soon — UI screenshots across web and mobile*

---

## 🎓 What I Learned

Building Cordigram from scratch across four separate applications taught me:

- **System design at scale** — designing a normalized yet performant MongoDB schema for a complex social graph with 50+ collections
- **Real-time architecture** — handling concurrent WebSocket connections for chat, notifications, and live features with Socket.IO
- **Cross-platform development** — building the same product experience for web (Next.js) and mobile (Flutter) simultaneously
- **Third-party integrations** — Stripe payments, LiveKit video, Cloudinary/S3 media, Firebase FCM, DeepL translation, and Whisper captioning
- **Moderation systems** — designing scalable content moderation with both automated (AWS Rekognition) and manual admin workflows
- **Full ownership** — from database schema through REST API, real-time events, frontend UI, mobile app, and admin tooling — all end-to-end

---

## 🔭 Future Roadmap

- [ ] **Custom AI model** — train a dedicated recommendation model for personalized feeds instead of relying on heuristics
- [ ] **Stories** — ephemeral 24-hour content similar to Instagram Stories
- [ ] **Advanced content moderation AI** — self-hosted model for image/video safety classification
- [ ] **Microservices migration** — split the monolithic backend into independent services for better scalability
- [ ] **CDN & performance** — edge caching and global media delivery optimization

---

## 👨‍💻 Team

| Name | Role |
|------|------|
| Nguyễn Khánh An | Fullstack Developer |
| *(teammate name)* | Fullstack Developer |

> Graduation Project — VTC Academy, Ho Chi Minh City, 2025

---

<div align="center">

*If you find this project interesting, feel free to ⭐ star the repo!*

</div>
