# vrchat-friends-ui

Standalone React, TypeScript, Vite, and shadcn/ui interface for VRChat friends.

## Run

```sh
npm install
npm run dev
```

The dashboard opens at http://localhost:8080. Without an account token it shows clearly labeled sample friends. Use Connect VRChat to connect through the companion API at https://localhost:7154.

Features: online filters, friend search, grid/list views, browser-saved favorites, profile dialogs, and one-minute refreshes.

## Checks

```sh
npm run build
npm test
npx tsc --noEmit -p tsconfig.app.json
```

This project is independent of the neighboring vrchat-chat-buddy-main source folder.

## Friend locations

The light, Apple-inspired dashboard preserves each friend's `location` returned by the companion API. It shows shared world/instance IDs, access labels, and server regions, and groups only identical full locations. Private, traveling, offline, and unavailable locations are handled separately. Search matches names, worlds, world IDs, and instance details.

The companion API now exposes GET /vrchat/worlds/{worldId} using the signed-in VRChat session. The dashboard fetches each unique world once and caches its name and thumbnail for ten minutes. Cards and profile details display the real thumbnail with a clear fallback for unavailable pictures. Private locations are never looked up. Restart DashboardVRChat.Api after installing this update. Sample mode retains labeled illustrations because its world IDs are fictional.

The friends endpoint loads up to 100 online and 100 offline friends per refresh. Counts describe loaded results. Refresh runs every minute; failures retain the last successful data with a visible stale-data notice.


## Notifications

Use the bell in the top bar to open the notification center. Incoming VRChat notifications refresh every 30 seconds while the page is visible. Group changes, completed boop batches, and connection transitions appear as app activity with toast feedback. The app retains the latest 50 activity items locally, plus local read/dismiss state. Preview and live activity are separate. Mark read, dismiss, and Clear all only change this browser; they do not accept invitations, acknowledge boops, or dismiss notifications in VRChat. Incoming notifications require the updated companion API and a signed-in session.

## Expanded VRChat inbox

The inbox combines the legacy notification feed (up to 100 items) and Notification V2 (up to 100 items). V2 includes group invitations, announcements and other available notices. It retains full titles, messages, images, detail fields and safe links to VRChat. Filters separate invitations, groups, boops and app activity. A failed feed produces a warning while the other feed remains usable. Preview mode does not fetch your real inbox. This shows notifications currently returned by VRChat; it is not a complete archive of expired notices or all historical group posts.
