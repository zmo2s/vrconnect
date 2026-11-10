# vrconnect overlay (SteamVR)

Your VRChat friends and **where to go**, in a `vrconnect` tab of the SteamVR dashboard — no need to take the headset off.

- **Lists on the left**: *Where to go*, *Friends online*, and each of your **VRChat favorite-friend groups**
  (with `online/total`). Click one to show its people on the right: online members first with their status and world,
  then offline members in grey.
- **Scrollbar** on long lists: arrows (one row), click the track (one page), drag the blue bar, or push the
  thumbstick / trackpad up and down while pointing at the panel.
- **Where to go**: instances with friends, best first (more friends, open, room left), with the live head-count `12/32`
  and the world's picture as the card background (pictures are cached in `%LOCALAPPDATA%\VRChatDashboard\overlay-images`).
- **Friends online**: Join me first, VRChat status colours, the world each friend is in. Names in any script
  (Japanese, Chinese, Cyrillic, decorative symbols) are drawn with whichever Windows font has the characters.
  Friends show their initial: VRChat's friend list no longer includes avatar pictures (the fields come back empty).
- **Join** on open places with room: sends *you* an invite to that instance. Accept it from your VRChat notifications to go there.
- **Ask invite** on friends in a private world (and on places you can't walk into): asks that friend to invite you.
- **Refresh** button (point and click with the controller). The panel also refreshes every 20 s while it is open.
- A message at the bottom confirms each action, or says why VRChat refused it.

### Alerts in the headset

Even with the SteamVR menu closed, a banner shows up just below your view for 6 seconds when:

- one of your **VRChat favorites** comes online (members of your favorite-friend groups), or
- **3 or more friends gather** in a place you can join (open, not full).

It stays quiet on purpose: nothing at startup, at most one alert per friend or place every 15 minutes, 3 at a time.
The overlay checks every minute in the background. Turn alerts off with `--no-alerts`.

## Run it

1. Start the dashboard with `START.bat` and sign in to VRChat in the browser.
   When SteamVR is installed, `START.bat` also starts the overlay, in the same console as the API and the UI.
2. Start SteamVR whenever you like: the overlay waits for it (it never starts SteamVR itself)
   and waits again after SteamVR closes.
3. In the headset, open the SteamVR dashboard and pick the **vrconnect** tab.

Run it by hand instead: `dotnet run --project Overlay`.

Or let SteamVR start it (once): `dotnet run --project Overlay -- --register`. SteamVR then launches it with
`--once`, so it quits with SteamVR. If `START.bat` starts a second copy, that one sees the first and exits.

## How it gets your data

The overlay never talks to VRChat and never sees your password. It reads the local dashboard API
(`http://localhost:5000`). At startup the API writes a random token to
`%LOCALAPPDATA%\VRChatDashboard\overlay-token`; with it, `GET /overlay/session` (localhost only) returns the
session the dashboard is using. A new token is written each time the API starts.

## Without a headset

Render one frame to `overlay-preview.png`:

```bash
dotnet run --project Overlay -- --preview            # your live data
dotnet run --project Overlay -- --preview --sample   # sample friends
```

## Tests

The ranking of places, instance types and alert rules are covered by `Overlay.Tests`:

```bash
dotnet test Overlay.Tests
```

`OpenVR/openvr_api.cs` and `OpenVR/openvr_api.dll` come from [ValveSoftware/openvr](https://github.com/ValveSoftware/openvr) (BSD-3-Clause).
