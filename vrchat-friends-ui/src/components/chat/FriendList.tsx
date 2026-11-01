import { Friend } from "@/data/mockData";
import { Search } from "lucide-react";
import { useState } from "react";

interface FriendListProps {
  friends: Friend[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const FriendList = ({ friends, selectedId, onSelect }: FriendListProps) => {
  const [search, setSearch] = useState("");

  const filtered = friends.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col border-r border-border bg-sidebar">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h1 className="text-lg font-bold text-primary">VRChat</h1>
        <span className="text-xs text-muted-foreground">Messenger</span>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search friends..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      </div>

      {/* Friend list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((friend) => (
          <button
            key={friend.id}
            onClick={() => onSelect(friend.id)}
            className={`flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-sidebar-accent ${
              selectedId === friend.id ? "bg-sidebar-accent" : ""
            }`}
          >
            {/* Avatar with status */}
            <div className="relative flex-shrink-0">
              <img
                src={friend.avatar}
                alt={friend.name}
                className="h-11 w-11 rounded-full object-cover bg-muted"
              />

              <span
                className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-sidebar ${
                  friend.online ? "bg-online" : "bg-offline"
                }`}
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground truncate">
                  {friend.name}
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {friend.lastMessageTime}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground truncate">
                  {friend.lastMessage}
                </span>

                {friend.unread > 0 && (
                  <span className="ml-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {friend.unread}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default FriendList;