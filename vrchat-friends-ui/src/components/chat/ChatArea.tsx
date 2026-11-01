import { Friend, Message } from "@/data/mockData";
import { ImagePlus, Images, Send, Smile } from "lucide-react";
import { useRef, useState, useEffect } from "react";

interface ChatAreaProps {
  friend: Friend;
  messages: Message[];
  onSendMessage: (text: string) => void;
  onSendImage: (url: string) => void;
  onToggleGallery: () => void;
  galleryCount: number;
}

const ChatArea = ({
  friend,
  messages,
  onSendMessage,
  onSendImage,
  onToggleGallery,
  galleryCount,
}: ChatAreaProps) => {
  const [text, setText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    onSendImage(url);
    e.target.value = "";
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <div className="relative">
          <img
            src={friend.avatar}
            alt={friend.name}
            className="h-10 w-10 rounded-full object-cover bg-muted"
          />

          <span
            className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background ${
              friend.online ? "bg-online" : "bg-offline"
            }`}
          />
        </div>

        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            {friend.name}
          </h2>

          <span
            className={`text-xs ${
              friend.online ? "text-online" : "text-muted-foreground"
            }`}
          >
            {friend.online ? "online" : "offline"}
          </span>
        </div>

        <button
          onClick={onToggleGallery}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
        >
          <Images className="h-4 w-4" />
          {galleryCount > 0 && <span className="text-xs">{galleryCount}</span>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.isOwn ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                msg.isOwn
                  ? "bg-chat-own text-foreground rounded-br-md"
                  : "bg-chat-other text-foreground rounded-bl-md"
              }`}
            >
              {msg.image && (
                <img
                  src={msg.image}
                  alt="Shared image"
                  className="mb-1 rounded-lg max-w-full"
                />
              )}

              {msg.text && (
                <p className="text-sm leading-relaxed">{msg.text}</p>
              )}

              <p
                className={`mt-1 text-[10px] ${
                  msg.isOwn ? "text-foreground/50" : "text-muted-foreground"
                }`}
              >
                {msg.timestamp}
              </p>
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
          >
            <ImagePlus className="h-5 w-5" />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          <button className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary">
            <Smile className="h-5 w-5" />
          </button>

          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a message..."
            className="flex-1 rounded-full bg-muted px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
          />

          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatArea;