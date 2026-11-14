import { useEffect, useRef, useState } from "react";
import { useMusic } from "@/lib/music";
import { fullscreenSupported, setFullscreen, useFullscreen } from "@/lib/fullscreen";
import { Check, CircleHelp, Film, ImagePlus, Link2, Music2, Pause, Play, Trash2, Volume1, Volume2, VolumeX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { accentPresets, imageFileToDataUrl, isVideoFile, resolveWallpaperUrl, useAccent, useWallpaper } from "@/lib/personalize";
import { Slider } from "@/components/ui/slider";
import { playSound } from "@/lib/sounds";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Settings } from "@/hooks/use-settings";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; settings: Settings; onChange: (patch: Partial<Settings>) => void; onHelp?: () => void; }

function Row({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div><Label htmlFor={id}>{title}</Label><p>{hint}</p></div>
      {children}
    </div>
  );
}

export default function SettingsDialog({ open, onOpenChange, settings, onChange, onHelp }: Props) {
  const { theme = "system", setTheme } = useTheme();
  const supported = typeof Notification !== "undefined";
  const [permission, setPermission] = useState(() => (supported ? Notification.permission : "denied"));
  const [accent, setAccent] = useAccent();
  const [wallpaper, setWallpaper, setLocalVideo] = useWallpaper();
  const [wallpaperLink, setWallpaperLink] = useState("");
  const [wallpaperError, setWallpaperError] = useState("");
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const [wallpaperStep, setWallpaperStep] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    setPreviewUrl("");
    if (!open || !wallpaper.src) return;
    void resolveWallpaperUrl(wallpaper.src).then(url => { if (live) setPreviewUrl(url); });
    return () => { live = false; };
  }, [open, wallpaper.src]);

  async function pickWallpaper(file?: File) {
    if (!file) { console.info("[wallpaper] no file picked"); return; }
    setWallpaperBusy(true); setWallpaperError(""); setWallpaperStep("Opening the file…");
    try {
      const error = isVideoFile(file) ? await setLocalVideo(file, setWallpaperStep) : setWallpaper({ src: await imageFileToDataUrl(file) });
      setWallpaperError(error || "");
    }
    catch (error) {
      console.warn("[wallpaper] failed", error);
      setWallpaperError(error instanceof Error ? error.message : "This file couldn't be used.");
    }
    finally {
      setWallpaperBusy(false); setWallpaperStep("");
      if (fileInput.current) fileInput.current.value = "";
      if (videoInput.current) videoInput.current.value = "";
    }
  }
  function applyLink() {
    const link = wallpaperLink.trim();
    if (!link) return;
    const error = setWallpaper({ src: link });
    setWallpaperError(error || "");
    if (!error) setWallpaperLink("");
  }

  const fullscreen = useFullscreen();
  const [music, setMusic, setLocalMusic] = useMusic();
  const [musicLink, setMusicLink] = useState("");
  const [musicError, setMusicError] = useState("");
  const [musicStep, setMusicStep] = useState("");
  const musicInput = useRef<HTMLInputElement>(null);

  async function pickMusic(file?: File) {
    if (!file) return;
    setMusicError(""); setMusicStep("Opening the file…");
    try { setMusicError((await setLocalMusic(file, setMusicStep)) || ""); }
    catch (error) { setMusicError(error instanceof Error ? error.message : "This file couldn't be used."); }
    finally { setMusicStep(""); if (musicInput.current) musicInput.current.value = ""; }
  }
  function applyMusicLink() {
    const link = musicLink.trim();
    if (!link) return;
    const error = setMusic({ src: link, name: link, playing: true });
    setMusicError(error || "");
    if (!error) setMusicLink("");
  }

  async function toggleDesktop(enabled: boolean) {
    if (!enabled) { onChange({ desktopAlerts: false }); return; }
    if (!supported) return;
    const result = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    setPermission(result);
    onChange({ desktopAlerts: result === "granted" });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog" onOpenAutoFocus={event => { event.preventDefault(); (event.currentTarget as HTMLElement).focus(); }}>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Saved in this browser.</DialogDescription>
        </DialogHeader>

        <section>
          <h3 className="settings-heading">Appearance</h3>
          <Row id="setting-theme" title="Theme" hint="Follow Windows, or pick one.">
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger id="setting-theme" className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="system">System</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent>
            </Select>
          </Row>
          <div className="settings-row settings-row-stack">
            <div><Label>Accent colour</Label><p>Buttons, links, highlights and the selection colour.</p></div>
            <div className="accent-swatches" role="radiogroup" aria-label="Accent colour">
              {accentPresets.map(preset => {
                const active = (accent || "").toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button key={preset.name} type="button" role="radio" aria-checked={active} title={preset.name} aria-label={preset.name}
                    className={`accent-swatch${preset.hex ? "" : " is-default"}${active ? " active" : ""}`}
                    style={preset.hex ? { background: preset.hex } : undefined} onClick={() => setAccent(preset.hex)}>
                    {active && <Check size={14} />}
                  </button>
                );
              })}
              <label className={`accent-swatch accent-custom${accent && !accentPresets.some(p => p.hex.toLowerCase() === accent.toLowerCase()) ? " active" : ""}`} title="Pick any colour"
                style={accent && !accentPresets.some(p => p.hex.toLowerCase() === accent.toLowerCase()) ? { background: accent } : undefined}>
                <input type="color" aria-label="Custom accent colour" value={accent || "#3b82f6"} onChange={event => setAccent(event.target.value)} />
                <span aria-hidden="true">+</span>
              </label>
            </div>
          </div>

          <div className="settings-row settings-row-stack">
            <div><Label>Wallpaper</Label><p>Your own picture or looping video (MP4, WebM) behind the dashboard. Saved only in this browser.</p></div>
            <div className="wallpaper-controls">
              {wallpaper.src && (wallpaper.kind === "video"
                ? <div className="wallpaper-preview">{previewUrl && <video src={previewUrl} muted loop autoPlay playsInline
                    onError={() => setWallpaperError("This video can't be played here. Try an MP4 (H.264) or WebM file.")} />}</div>
                : <div className="wallpaper-preview" style={{ backgroundImage: `url("${wallpaper.src.replace(/"/g, "%22")}")` }} />)}
              <div className="wallpaper-buttons">
                <input ref={fileInput} type="file" accept=".png,.jpg,.jpeg,.webp,.gif" hidden onChange={event => void pickWallpaper(event.target.files?.[0])} />
                <input ref={videoInput} type="file" accept=".mp4,.webm,.m4v,.mov" hidden onChange={event => void pickWallpaper(event.target.files?.[0])} />
                <Button type="button" variant="outline" size="sm" disabled={wallpaperBusy} onClick={() => fileInput.current?.click()}><ImagePlus /> Choose image</Button>
                <Button type="button" variant="outline" size="sm" disabled={wallpaperBusy} onClick={() => videoInput.current?.click()}><Film /> {wallpaperBusy ? "Saving…" : "Choose video (MP4)"}</Button>
                {wallpaper.src && <Button type="button" variant="ghost" size="sm" onClick={() => { setWallpaper({ src: "" }); setWallpaperError(""); }}><Trash2 /> Remove</Button>}
              </div>
              <form className="wallpaper-link" onSubmit={event => { event.preventDefault(); applyLink(); }}>
                <Link2 size={15} />
                <Input aria-label="Wallpaper image or video link" placeholder="…or paste an image or .mp4 link (https://)" value={wallpaperLink} onChange={event => setWallpaperLink(event.target.value)} />
                <Button type="submit" size="sm" variant="outline" disabled={!wallpaperLink.trim()}>Use</Button>
              </form>
              {wallpaperStep && <p className="wallpaper-step" role="status">{wallpaperStep}</p>}
              {wallpaperError && <p className="wallpaper-error" role="alert">{wallpaperError}</p>}
              {wallpaper.src && <>
                <div className="wallpaper-slider"><span>Darken</span>
                  <Slider aria-label="Darken wallpaper" min={0} max={80} step={5} value={[wallpaper.dim]} onValueChange={([dim]) => setWallpaper({ dim })} /><span>{wallpaper.dim}%</span></div>
                <div className="wallpaper-slider"><span>Blur</span>
                  <Slider aria-label="Blur wallpaper" min={0} max={20} step={1} value={[wallpaper.blur]} onValueChange={([blur]) => setWallpaper({ blur })} /><span>{wallpaper.blur}px</span></div>
              </>}
            </div>
          </div>

          <div className="settings-row settings-row-stack">
            <div><Label>Background music</Label><p>An MP3 that loops while the dashboard is open. Saved only in this browser.</p></div>
            <div className="wallpaper-controls">
              {music.src && <p className="music-now" title={music.name}><Music2 size={15} /> <span>{music.name || "Music"}</span></p>}
              <div className="wallpaper-buttons">
                <input ref={musicInput} type="file" accept=".mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac" hidden onChange={event => void pickMusic(event.target.files?.[0])} />
                <Button type="button" variant="outline" size="sm" disabled={!!musicStep} onClick={() => musicInput.current?.click()}><Music2 /> {music.src ? "Change MP3" : "Choose MP3"}</Button>
                {music.src && <Button type="button" variant="outline" size="sm" onClick={() => setMusic({ playing: !music.playing })}>
                  {music.playing ? <><Pause /> Pause</> : <><Play /> Play</>}</Button>}
                {music.src && <Button type="button" variant="ghost" size="sm" onClick={() => { setMusic({ src: "", name: "" }); setMusicError(""); }}><Trash2 /> Remove</Button>}
              </div>
              <form className="wallpaper-link" onSubmit={event => { event.preventDefault(); applyMusicLink(); }}>
                <Link2 size={15} />
                <Input aria-label="Music link" placeholder="…or paste an .mp3 link (https://)" value={musicLink} onChange={event => setMusicLink(event.target.value)} />
                <Button type="submit" size="sm" variant="outline" disabled={!musicLink.trim()}>Use</Button>
              </form>
              {musicStep && <p className="wallpaper-step" role="status">{musicStep}</p>}
              {musicError && <p className="wallpaper-error" role="alert">{musicError}</p>}
              {music.src && <div className="wallpaper-slider"><span>Volume</span>
                <Slider aria-label="Music volume" min={0} max={100} step={5} value={[music.volume]} onValueChange={([volume]) => setMusic({ volume })} /><span>{music.volume}%</span></div>}
            </div>
          </div>

          {fullscreenSupported() && <Row id="setting-fullscreen" title="Full screen" hint="Hide the window frame and the taskbar. Shortcut: F11 (Esc or F11 to leave).">
            <Switch id="setting-fullscreen" checked={fullscreen} onCheckedChange={on => void setFullscreen(on)} />
          </Row>}

          <Row id="setting-compact" title="Compact list" hint="Smaller rows, more friends on screen.">
            <Switch id="setting-compact" checked={settings.compact} onCheckedChange={compact => onChange({ compact })} />
          </Row>
          <Row id="setting-motion" title="Animations" hint="Moving effects when you hover, select or open things.">
            <Switch id="setting-motion" checked={settings.motion} onCheckedChange={motion => onChange({ motion })} />
          </Row>
          <Row id="setting-ambient" title="Animated background" hint="Soft colour light drifting slowly behind the glass.">
            <Switch id="setting-ambient" checked={settings.ambient} onCheckedChange={ambient => onChange({ ambient })} />
          </Row>
        </section>

        <section>
          <h3 className="settings-heading">Sounds</h3>
          <Row id="setting-sounds" title="Notification sounds" hint="Invites, boops, favorite alerts and app messages.">
            <Switch id="setting-sounds" checked={settings.sounds} onCheckedChange={sounds => { onChange({ sounds }); if (sounds) playSound("info", { force: true, volume: settings.soundVolume }); }} />
          </Row>
          <div className={`settings-volume${settings.sounds ? "" : " is-disabled"}`}>
            <button type="button" className="settings-volume-icon" aria-label={settings.soundVolume ? "Mute" : "Unmute"} disabled={!settings.sounds}
              onClick={() => onChange({ soundVolume: settings.soundVolume ? 0 : 60 })}>
              {settings.soundVolume === 0 ? <VolumeX size={18} /> : settings.soundVolume < 50 ? <Volume1 size={18} /> : <Volume2 size={18} />}
            </button>
            <Slider aria-label="Notification volume" min={0} max={100} step={5} value={[settings.soundVolume]} disabled={!settings.sounds}
              onValueChange={([soundVolume]) => onChange({ soundVolume })}
              onValueCommit={([soundVolume]) => playSound("info", { force: true, volume: soundVolume })} />
            <span className="settings-volume-value" aria-hidden="true">{settings.soundVolume}%</span>
            <Button type="button" variant="outline" size="sm" disabled={!settings.sounds || settings.soundVolume === 0}
              onClick={() => playSound("invite", { force: true, volume: settings.soundVolume })}><Play /> Test</Button>
          </div>
        </section>

        <section>
          <h3 className="settings-heading">Favorites</h3>
          <Row id="setting-alerts" title="Favorite alerts" hint="When a favorite comes online or changes world.">
            <Switch id="setting-alerts" checked={settings.favoriteAlerts} onCheckedChange={favoriteAlerts => onChange({ favoriteAlerts })} />
          </Row>
          <Row id="setting-desktop" title="Desktop notifications"
            hint={!supported ? "Not supported by this browser." : permission === "denied" ? "Blocked by the browser — allow notifications for this site first." : "Also notify through Windows while the dashboard is in the background."}>
            <Switch id="setting-desktop" checked={settings.desktopAlerts} disabled={!supported || !settings.favoriteAlerts || permission === "denied"} onCheckedChange={enabled => void toggleDesktop(enabled)} />
          </Row>
        </section>
        {onHelp && <Button variant="ghost" className="justify-self-start text-primary" onClick={onHelp}><CircleHelp /> How it works</Button>}
      </DialogContent>
    </Dialog>
  );
}
