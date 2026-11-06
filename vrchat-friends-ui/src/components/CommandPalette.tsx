import { Activity, Bell, Hand, Settings, LockKeyhole, MapPin, Moon, RefreshCw, Star, Sun, Users } from "lucide-react";
import { useTheme } from "next-themes";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import type { Friend } from "@/data/mockData";
import { getFriendLocation, type FriendLocation } from "@/lib/friend-location";
import { cn } from "@/lib/utils";

export type PaletteAction = "online" | "favorites" | "private" | "groups" | "inbox" | "refresh" | "settings" | "activity";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  friends: Friend[];
  places: { location: FriendLocation; friends: Friend[] }[];
  favorites: string[];
  canRefresh: boolean;
  onFriend: (id: string) => void;
  onPlace: (key: string) => void;
  onAction: (action: PaletteAction) => void;
}

/** Ctrl/Cmd+K quick jump: friends, shared places and common actions in one list. */
export default function CommandPalette({ open, onOpenChange, friends, places, favorites, canRefresh, onFriend, onPlace, onAction }: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  const run = (fn: () => void) => { onOpenChange(false); fn(); };
  const sorted = [...friends].sort((a, b) => Number(b.online) - Number(a.online) || Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)) || a.name.localeCompare(b.name));
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a friend, a world or an action…" aria-label="Quick jump" />
      <CommandList className="max-h-[min(420px,60dvh)]">
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {sorted.length > 0 && <CommandGroup heading="Friends">
          {sorted.map(friend => {
            const location = getFriendLocation(friend);
            return (
              <CommandItem key={friend.id} value={`friend ${friend.name} ${location.title}`} onSelect={() => run(() => onFriend(friend.id))} className="gap-3">
                <span className={cn("palette-dot", friend.online ? `status-${friend.status ?? "active"}` : "is-offline")} />
                <span className="truncate font-medium">{friend.name}</span>
                {favorites.includes(friend.id) && <Star className="h-3.5 w-3.5 shrink-0 fill-current text-amber-500" />}
                <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">{location.title}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>}
        {places.length > 0 && <><CommandSeparator /><CommandGroup heading="Shared places">
          {places.map(({ location, friends: here }) => (
            <CommandItem key={location.key} value={`place ${location.title} ${here.map(f => f.name).join(" ")}`} onSelect={() => run(() => onPlace(location.key))} className="gap-3">
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{location.title}</span>
              {location.instanceNumber && <span className="shrink-0 text-xs text-muted-foreground">#{location.instanceNumber}{location.access ? ` · ${location.access}` : ""}</span>}
              <span className="ml-auto pl-3 text-xs text-muted-foreground">{here.length} {here.length === 1 ? "friend" : "friends"}</span>
            </CommandItem>
          ))}
        </CommandGroup></>}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="action show online friends" onSelect={() => run(() => onAction("online"))}><Users className="mr-2 h-4 w-4" />Show online friends</CommandItem>
          <CommandItem value="action show favorites" onSelect={() => run(() => onAction("favorites"))}><Star className="mr-2 h-4 w-4" />Show favorites</CommandItem>
          <CommandItem value="action show private friends" onSelect={() => run(() => onAction("private"))}><LockKeyhole className="mr-2 h-4 w-4" />Show friends in private</CommandItem>
          <CommandItem value="action groups and boops" onSelect={() => run(() => onAction("groups"))}><Hand className="mr-2 h-4 w-4" />Groups &amp; boops</CommandItem>
          <CommandItem value="action inbox notifications" onSelect={() => run(() => onAction("inbox"))}><Bell className="mr-2 h-4 w-4" />Open inbox</CommandItem>
          <CommandItem value="action activity timeline history" onSelect={() => run(() => onAction("activity"))}><Activity className="mr-2 h-4 w-4" />Open activity timeline</CommandItem>
          <CommandItem value="action settings preferences" onSelect={() => run(() => onAction("settings"))}><Settings className="mr-2 h-4 w-4" />Settings</CommandItem>
          {canRefresh && <CommandItem value="action refresh friends" onSelect={() => run(() => onAction("refresh"))}><RefreshCw className="mr-2 h-4 w-4" />Refresh friends</CommandItem>}
          <CommandItem value="action toggle theme dark light" onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
            {resolvedTheme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center gap-4 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span><CommandShortcut className="ml-0 tracking-normal">↑↓</CommandShortcut> navigate</span>
        <span><CommandShortcut className="ml-0 tracking-normal">↵</CommandShortcut> open</span>
        <span><CommandShortcut className="ml-0 tracking-normal">Esc</CommandShortcut> close</span>
      </div>
    </CommandDialog>
  );
}
