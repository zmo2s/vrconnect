import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hand, Loader2, MailPlus, Send, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendBoop } from "@/data/boops";
import { getSavedMessages, MAX_INVITE_MESSAGE, sendInvite, type InviteKind } from "@/data/invites";
import type { NotificationEvent } from "@/data/notifications";
import { cn } from "@/lib/utils";

interface Props {
  friendId: string;
  friendName: string;
  online: boolean;
  demo: boolean;
  /** Mirrors results into the inbox / toast, like boops. */
  onNotify?: (event: NotificationEvent) => void;
  initialKind?: InviteKind;
}

/** Profile actions: boop, invite to my instance, or request an invite — with an optional custom message. */
export default function ReachOut({ friendId, friendName, online, demo, onNotify, initialKind = "invite" }: Props) {
  const [kind, setKind] = useState<InviteKind>(initialKind);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<null | "invite" | "boop">(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const saved = useQuery({ queryKey: ["invite-messages", kind], queryFn: () => getSavedMessages(kind), enabled: !demo, staleTime: 5 * 60 * 1000, retry: false });
  const trimmed = message.trim();

  async function invite() {
    if (demo || busy) return;
    setBusy("invite"); setStatus(null);
    const result = await sendInvite(friendId, kind, trimmed || undefined);
    setBusy(null);
    setStatus({ ok: result.ok, text: result.message });
    onNotify?.({ title: result.ok ? `${result.message} to ${friendName}` : `${kind === "invite" ? "Invite" : "Request"} to ${friendName} not sent`, message: result.ok ? (trimmed ? `“${trimmed}”` : "Default message") : result.message, kind: result.ok ? "success" : "warning" });
    if (result.ok) { setMessage(""); void saved.refetch(); }
  }

  async function boop() {
    if (demo || busy) return;
    setBusy("boop"); setStatus(null);
    const result = await sendBoop(friendId);
    setBusy(null);
    const ok = result.status === "sent";
    setStatus({ ok, text: ok ? `Boop sent to ${friendName}` : result.message });
    onNotify?.({ title: ok ? `Boop sent to ${friendName}` : `Boop to ${friendName} not confirmed`, message: ok ? "One standard boop." : result.message, kind: ok ? "success" : "warning" });
  }

  const hint = kind === "invite"
    ? "Sends an invite to the instance you’re in now."
    : online ? `Asks ${friendName} to invite you to where they are.` : `${friendName} is offline — they’ll see it next time.`;

  return (
    <section className="reach-out" aria-label={`Reach out to ${friendName}`}>
      <div className="reach-out-head">
        <span className="profile-label">Reach out</span>
        <Button variant="outline" size="sm" onClick={() => void boop()} disabled={demo || !!busy} aria-label={`Boop ${friendName}`}>
          {busy === "boop" ? <Loader2 className="animate-spin" /> : <Hand />} Boop
        </Button>
      </div>

      <div className="reach-out-kind" role="group" aria-label="Invite type">
        <button aria-pressed={kind === "invite"} onClick={() => { setKind("invite"); setStatus(null); }}><UserPlus size={15} /> Invite</button>
        <button aria-pressed={kind === "request"} onClick={() => { setKind("request"); setStatus(null); }}><MailPlus size={15} /> Request invite</button>
      </div>

      <form className="reach-out-compose" onSubmit={event => { event.preventDefault(); void invite(); }}>
        <div className="reach-out-field">
          <Input aria-label={kind === "invite" ? "Invite message" : "Request message"} value={message} maxLength={MAX_INVITE_MESSAGE} disabled={demo || !!busy}
            placeholder="Add a message (optional)" onChange={event => setMessage(event.target.value)} />
          {message && <span className={cn("reach-out-count", message.length >= MAX_INVITE_MESSAGE && "is-max")}>{message.length}/{MAX_INVITE_MESSAGE}</span>}
        </div>
        <Button type="submit" disabled={demo || !!busy}>
          {busy === "invite" ? <Loader2 className="animate-spin" /> : <Send />} {kind === "invite" ? "Send invite" : "Send request"}
        </Button>
      </form>

      {!demo && (saved.data?.length ?? 0) > 0 && (
        <div className="reach-out-saved" aria-label="Saved messages">
          {saved.data!.filter(m => m.message.trim()).slice(0, 12).map(m => (
            <button key={m.slot} type="button" className={cn(trimmed === m.message.trim() && "is-picked")} onClick={() => setMessage(m.message)} title={`Saved message ${m.slot + 1}`}>{m.message}</button>
          ))}
        </div>
      )}

      <p className={cn("reach-out-hint", status && (status.ok ? "is-ok" : "is-error"))} role="status" aria-live="polite">
        {demo ? "Preview only. Connect VRChat to send boops and invites." : status ? status.text : `${hint} A new message uses one of your 12 VRChat message slots (each can change once an hour).`}
      </p>
    </section>
  );
}
