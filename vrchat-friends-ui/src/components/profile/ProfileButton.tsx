import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Loader2, LogIn, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMyProfile, MAX_STATUS_MESSAGE, updateMyStatus } from "@/data/profile";
import { statusMeta, type VrcStatus } from "@/lib/vrc-status";
import { cn } from "@/lib/utils";

const CHOICES: VrcStatus[] = ["joinme", "active", "askme", "busy"];

/** Sidebar profile: your picture, name and status. Opens a panel to change status and status message. */
export default function ProfileButton() {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: getMyProfile, refetchInterval: 60000, retry: false });
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<VrcStatus>("active");
  const [message, setMessage] = useState("");

  // Start the form from what VRChat currently has each time the panel opens
  useEffect(() => {
    if (open && profile.data) { setStatus(profile.data.status); setMessage(profile.data.statusDescription); }
  }, [open, profile.data]);

  const save = useMutation({
    mutationFn: () => updateMyStatus(status, message),
    onSuccess: () => {
      queryClient.setQueryData(["my-profile"], (old: typeof profile.data) => old && { ...old, status, statusDescription: message.trim() });
      void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Status updated", { description: `${statusMeta[status].label}${message.trim() ? ` · ${message.trim()}` : ""}` });
      setOpen(false);
    },
    onError: (error: unknown) => toast.error("Status not changed", { description: error instanceof Error ? error.message : "Please try again." }),
  });

  if (profile.isError && !profile.data) {
    return (
      <Link to="/login" className="account-link">
        <span className="account-icon"><LogIn size={16} /></span>
        <span>Account<small>Sign in to set your status</small></span>
        <ChevronRight size={15} />
      </Link>
    );
  }

  const me = profile.data;
  const changed = !!me && (status !== me.status || message.trim() !== me.statusDescription.trim());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="account-link profile-button" aria-label="Your profile and status" disabled={!me}>
          <span className="profile-portrait">
            <Avatar className="profile-avatar">
              {me?.picture && <AvatarImage src={me.picture} alt="" />}
              <AvatarFallback>{(me?.displayName || "…").slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            {me && <span className={cn("presence-dot is-online", `status-${me.status}`)} />}
          </span>
          <span className="profile-text">
            {me?.displayName ?? "Loading…"}
            <small className={cn(me && `status-text-${me.status}`)}>{me ? (me.statusDescription || statusMeta[me.status].label) : "Your profile"}</small>
          </span>
          <ChevronRight size={15} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" sideOffset={12} className="profile-panel">
        <form onSubmit={event => { event.preventDefault(); if (changed && !save.isPending) save.mutate(); }}>
          <div className="profile-panel-head">
            <Avatar className="profile-avatar-large">
              {me?.picture && <AvatarImage src={me.picture} alt="" />}
              <AvatarFallback>{(me?.displayName || "").slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div><strong>{me?.displayName}</strong><small>What your friends see in VRChat</small></div>
          </div>

          <fieldset className="profile-status-choices">
            <legend>Status</legend>
            {CHOICES.map(choice => (
              <button type="button" key={choice} aria-pressed={status === choice} className={cn("profile-status-choice", status === choice && "selected")} onClick={() => setStatus(choice)}>
                <span className={cn("palette-dot", `status-${choice}`)} />
                <span>{statusMeta[choice].label}<small>{statusMeta[choice].hint}</small></span>
                {status === choice && <Check size={15} />}
              </button>
            ))}
          </fieldset>

          <label className="profile-message">
            <span>Status message <small>{message.length}/{MAX_STATUS_MESSAGE}</small></span>
            <Input value={message} maxLength={MAX_STATUS_MESSAGE} placeholder="What are you up to?" onChange={event => setMessage(event.target.value)} />
          </label>
          {!!me?.statusHistory.length && (
            <div className="profile-history" aria-label="Recent status messages">
              {me.statusHistory.filter(item => item !== message).slice(0, 6).map(item => (
                <button type="button" key={item} onClick={() => setMessage(item.slice(0, MAX_STATUS_MESSAGE))}>{item}</button>
              ))}
            </div>
          )}

          <div className="profile-actions">
            <Button asChild variant="ghost" size="sm"><Link to="/login"><Settings2 /> Connection</Link></Button>
            <Button type="submit" size="sm" disabled={!changed || save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Check />} Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
