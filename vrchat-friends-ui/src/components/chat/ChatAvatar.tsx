import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Round avatar with initials when the picture is missing or fails to load (no broken-image icon). */
export default function ChatAvatar({ src, name, className }: { src?: string; name: string; className?: string }) {
  return (
    <Avatar className={cn("chat-avatar", className)}>
      {src && <AvatarImage src={src} alt="" className="object-cover" />}
      <AvatarFallback className="chat-avatar-fallback">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
