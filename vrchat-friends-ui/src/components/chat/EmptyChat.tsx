import { MessageCircle } from "lucide-react";

const EmptyChat = () => (
  <div className="flex h-full flex-col items-center justify-center bg-transparent">
    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
      <MessageCircle className="h-10 w-10 text-primary" />
    </div>
    <h2 className="text-lg font-semibold text-foreground">Messages</h2>
    <p className="mt-1 text-sm text-muted-foreground">Select a friend to start chatting</p>
  </div>
);

export default EmptyChat;
