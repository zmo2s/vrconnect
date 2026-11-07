# vrconnect overlay (SteamVR)

Your VRChat friends and **where to go**, in a `vrconnect` tab of the SteamVR dashboard — no need to take the headset off.

- **Where to go**: instances with friends, best first (more friends, open, room left), with the live head-count `12/32`.
- **Friends online**: Join me first, VRChat status colours, the world each friend is in.
- **Join** on open places with room: sends *you* an invite to that instance. Accept it from your VRChat notifications to go there.
- **Ask invite** on friends in a private world (and on places you can't walk into): asks that friend to invite you.
- **Refresh** button (point and click with the controller). The panel also refreshes every 20 s while it is open.
- A message at the bottom confirms each action, or says why VRChat refused it.

## Run it

1. Start the dashboard (`START.bat`) and sign in to VRChat in the browser.
2. Start SteamVR.
3. Run the overlay:

   ```bash
   dotnet run --project Overlay
   ```

4. In the headset, open the SteamVR dashboard and pick the **vrconnect** tab.

Start it automatically with SteamVR (once): `dotnet run --project Overlay -- --register`.

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

`OpenVR/openvr_api.cs` and `OpenVR/openvr_api.dll` come from [ValveSoftware/openvr](https://github.com/ValveSoftware/openvr) (BSD-3-Clause).
