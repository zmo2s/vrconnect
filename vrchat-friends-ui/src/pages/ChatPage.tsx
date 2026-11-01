import { useEffect, useState, useCallback, useMemo } from "react";
import FriendList from "@/components/chat/FriendList";
import ChatArea from "@/components/chat/ChatArea";
import EmptyChat from "@/components/chat/EmptyChat";
import Gallery from "@/components/chat/Gallery";
import {
  getFriends,
  getMessages,
  sendMessage,
  Friend,
  Message,
} from "@/data/mockData";

const CURRENT_USER_ID = localStorage.getItem("userId") ?? "me";

const Index = () => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [allMessages, setAllMessages] = useState<Record<string, Message[]>>({});
  const [showGallery, setShowGallery] = useState(false);

  useEffect(() => {
    getFriends()
      .then(setFriends)
      .catch((error: unknown) => {
        setFriendsError(error instanceof Error ? error.message : "Failed to load friends");
      });
  }, []);

  useEffect(() => {
    if (!selectedFriendId) return;

    getMessages(selectedFriendId, CURRENT_USER_ID)
      .then((messages) => {
        setAllMessages((prev) => ({
          ...prev,
          [selectedFriendId]: messages,
        }));
      })
      .catch(console.error);
  }, [selectedFriendId]);

  const selectedFriend = friends.find((f) => f.id === selectedFriendId);

  const currentMessages = selectedFriendId
    ? allMessages[selectedFriendId] ?? []
    : [];

  const galleryImages = useMemo(
    () => currentMessages.filter((m) => m.image).map((m) => m.image!),
    [currentMessages]
  );

  const addMessage = useCallback(
    (msg: Message) => {
      if (!selectedFriendId) return;

      setAllMessages((prev) => ({
        ...prev,
        [selectedFriendId]: [
          ...(prev[selectedFriendId] ?? []),
          msg,
        ],
      }));
    },
    [selectedFriendId]
  );

  const handleSendMessage = async (text: string) => {
    if (!selectedFriendId) return;

    const tempMessage: Message = {
      id: crypto.randomUUID(),
      senderId: CURRENT_USER_ID,
      text,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      isOwn: true,
    };

    addMessage(tempMessage);

    try {
      await sendMessage(selectedFriendId, text);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSendImage = (url: string) => {
    if (!selectedFriendId) return;

    addMessage({
      id: crypto.randomUUID(),
      senderId: CURRENT_USER_ID,
      image: url,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      isOwn: true,
    });
  };

  const handleSelectFriend = (id: string) => {
    setSelectedFriendId(id);
    setShowGallery(false);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="w-80 flex-shrink-0 flex flex-col">
        {friendsError && (
          <p role="alert" className="p-3 text-sm text-destructive">
            Unable to load friends: {friendsError}
          </p>
        )}
        <FriendList
          friends={friends}
          selectedId={selectedFriendId}
          onSelect={handleSelectFriend}
        />
      </div>

      <div className="flex-1 min-w-0">
        {selectedFriend ? (
          <ChatArea
            friend={selectedFriend}
            messages={currentMessages}
            onSendMessage={handleSendMessage}
            onSendImage={handleSendImage}
            onToggleGallery={() => setShowGallery((p) => !p)}
            galleryCount={galleryImages.length}
          />
        ) : (
          <EmptyChat />
        )}
      </div>

      {showGallery && selectedFriend && (
        <div className="w-72 flex-shrink-0">
          <Gallery
            images={galleryImages}
            friendName={selectedFriend.name}
            onClose={() => setShowGallery(false)}
          />
        </div>
      )}
    </div>
  );
};

export default Index;
