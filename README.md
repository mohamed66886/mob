# AttendQR Mobile (Expo)

React Native native mobile app for AttendQR backend (no WebView).

## 1) Configure API URL

Create `.env` in this folder and set your backend URL:

```env
EXPO_PUBLIC_API_URL=https://attendqr.tech/api
```

Notes:
- Production API is `https://attendqr.tech/api`.
- For local testing only, you can override with `http://localhost:5001/api` (iOS simulator), `http://10.0.2.2:5001/api` (Android emulator), or your machine LAN IP on physical devices.

## 2) Start app

```bash
npm install
npm run start
```

Then press:
- `i` for iOS simulator
- `a` for Android emulator
- Or scan QR from Expo Go

## 3) Current implemented flow

- Native login screen with `/api/auth/login`
- QR login scanner on native login screen (reads JSON QR with `username` + `password`)
- Secure token storage with `expo-secure-store`
- Restore session on app open
- Native tabs: Home, Pages, Account
- Role-based pages list (admin/doctor/other)
- Placeholder details screen for each page route
- Native scanner page for attendance QR scanning (doctor/assistant)
- Workspace room chat with realtime socket receive/send
- Workspace attachments upload and send (`/workspaces/rooms/:roomId/messages/upload`)
- Offline queue for workspace messages with auto-resend on reconnect
- Inline image preview for image attachments in workspace chat
- Logout (clear secure token)

## Next suggested steps

- Implement each page native UI to match web behavior
- Start with high-priority pages: Dashboard, Attendance, Lectures, Students
- Add camera QR scanning and notifications
- Add realtime workspace chat/calls

## 4) Codemagic CI (Android + iOS)

This repository now includes a root `codemagic.yaml` workflow:

- Workflow name: `mobile_android_release`
- Working directory: `mobile`
- Output artifact: Android release APK
- Workflow name: `mobile_ios_release`
- Working directory: `mobile`
- Output artifact: iOS IPA

Before running the workflow in Codemagic, add environment variable:

```env
EXPO_PUBLIC_API_URL=https://attendqr.tech/api
```

You can also copy from `.env.example` inside this folder.

For iOS workflow, also configure:

- App Store Connect integration named `codemagic_app_store_connect`
- Signing assets/profile access in environment group `ios_signing`
