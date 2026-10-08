import { createPortal } from "react-dom";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  MessageSquare,
  Search,
  Send,
  Trash2,
  X,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { apiRequest } from "../../api/client.ts";
import {
  ConversationItem,
  ChatMessage,
  TeacherSearchItem,
  UserProfile,
} from "../../types/index.ts";
interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  initialTargetTeacher?: {
    id: string;
    username: string;
    fullName?: string;
    phoneNumber?: string;
  } | null;
}
interface Participant {
  id: string;
  username: string;
  fullName: string;
  role: string;
  isDeleted?: boolean;
}
export function MessagingModal({
  isOpen,
  onClose,
  currentUser,
  initialTargetTeacher,
}: Props) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]),
    [target, setTarget] = useState<string | null>(null),
    [participant, setParticipant] = useState<Participant | null>(null),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<TeacherSearchItem[]>([]),
    [drafts, setDrafts] = useState<Record<string, string>>({}),
    [threadSearch, setThreadSearch] = useState(""),
    [loading, setLoading] = useState(false),
    [searching, setSearching] = useState(false),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [action, setAction] = useState<{
      type: "message" | "chat";
      message?: ChatMessage;
    } | null>(null),
    [deleting, setDeleting] = useState(false);
  const selected = useRef<string | null>(null),
    scrollRef = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true),
    sendLock = useRef(false),
    lastId = useRef(""),
    mutation = useRef(0);
  const isAdmin = ["master_admin", "administrator"].includes(currentUser.role);
  const draft = target ? drafts[target] || "" : "";
  async function loadConversations() {
    const res = await apiRequest<ConversationItem[]>(
      "/api/messages/conversations",
    );
    if (res.success) setConversations(res.data || []);
    else setError(res.message || "Unable to load conversations.");
  }
  function choose(id: string) {
    selected.current = id;
    setTarget(id);
    setParticipant(null);
    setMessages([]);
    setQuery("");
    setResults([]);
    setThreadSearch("");
    setError("");
    lastId.current = "";
    nearBottom.current = true;
  }
  useEffect(() => {
    if (!isOpen) return;
    void loadConversations();
    if (initialTargetTeacher) choose(initialTargetTeacher.id);
    const timer = setInterval(() => {
      if (!document.hidden) void loadConversations();
    }, 7000);
    return () => clearInterval(timer);
  }, [isOpen, initialTargetTeacher?.id]);
  useEffect(() => {
    if (!isOpen || !target) return;
    let cancelled = false,
      inFlight = false;
    setLoading(true);
    const fetchThread = async () => {
      if (inFlight) return;
      inFlight = true;
      const version = mutation.current;
      const res = await apiRequest<{
        participant: Participant;
        messages: ChatMessage[];
      }>(`/api/messages/thread/${target}`);
      inFlight = false;
      if (cancelled || version !== mutation.current) return;
      setLoading(false);
      if (!res.success) {
        setError(res.message || "Unable to load messages.");
        return;
      }
      setParticipant(res.data!.participant);
      setMessages(res.data!.messages);
      setConversations((prev) =>
        prev.map((c) =>
          c.participantId === target ? { ...c, unreadCount: 0 } : c,
        ),
      );
    };
    void fetchThread();
    const timer = setInterval(() => {
      if (!document.hidden) void fetchThread();
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOpen, target]);
  useEffect(() => {
    if (!isOpen) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const res = await apiRequest<TeacherSearchItem[]>(
        `/api/messages/search-teachers?q=${encodeURIComponent(q)}`,
      );
      if (cancelled) return;
      setSearching(false);
      if (res.success) setResults(res.data || []);
      else setError(res.message || "Search failed.");
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isOpen]);
  useEffect(() => {
    const id = messages.at(-1)?.id || "";
    if (id !== lastId.current && nearBottom.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current)
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }
    lastId.current = id;
  }, [messages]);
  useEffect(() => {
    if (!isOpen) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (action) setAction(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", handler);
    };
  }, [isOpen, action, onClose]);
  async function send() {
    if (
      sendLock.current ||
      !target ||
      !draft.trim() ||
      participant?.isDeleted ||
      !participant
    )
      return;
    const recipient = target,
      text = draft.trim();
    mutation.current++;
    sendLock.current = true;
    setSending(true);
    setError("");
    const res = await apiRequest<ChatMessage>("/api/messages/send", {
      method: "POST",
      body: JSON.stringify({ recipientId: recipient, message: text }),
    });
    sendLock.current = false;
    setSending(false);
    mutation.current++;
    if (res.success && res.data) {
      setDrafts((prev) => ({
        ...prev,
        [recipient]: prev[recipient]?.trim() === text ? "" : prev[recipient],
      }));
      if (selected.current === recipient) {
        nearBottom.current = true;
        setMessages((prev) =>
          prev.some((m) => m.id === res.data!.id) ? prev : [...prev, res.data!],
        );
      }
      void loadConversations();
    } else
      setError(
        res.message || "Message could not be sent. Your draft is still here.",
      );
  }
  async function remove(scope: "me" | "everyone" = "me") {
    if (!action || !target || deleting) return;
    mutation.current++;
    setDeleting(true);
    const res = await apiRequest(
      action.type === "chat"
        ? `/api/messages/thread/${target}`
        : `/api/messages/${action.message!.id}`,
      { method: "DELETE", body: JSON.stringify({ scope }) },
    );
    mutation.current++;
    setDeleting(false);
    if (!res.success) {
      setError(res.message || "Unable to delete.");
      return;
    }
    if (action.type === "chat") {
      setTarget(null);
      selected.current = null;
      setParticipant(null);
      setMessages([]);
    } else
      setMessages((prev) =>
        scope === "everyone"
          ? prev.map((m) =>
              m.id === action.message!.id
                ? { ...m, message: "Message unsent", isUnsent: true }
                : m,
            )
          : prev.filter((m) => m.id !== action.message!.id),
      );
    setAction(null);
    void loadConversations();
  }
  if (!isOpen) return null;
  const shown = messages.filter(
    (m) =>
      !threadSearch ||
      m.message.toLowerCase().includes(threadSearch.toLowerCase()),
  );
  return createPortal(
    <div className="record-overlay">
      <section
        className="chat-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-title"
      >
        <header className="chat-top">
          <div>
            <span className="eyebrow">STAY CONNECTED</span>
            <h2 id="chat-title">
              <MessageSquare size={20} />
              Messages
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close messaging"
          >
            <X size={21} />
          </button>
        </header>
        {error && (
          <div className="record-error" role="alert">
            {error}
            <button
              aria-label="Dismiss message error"
              onClick={() => setError("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="chat-layout">
          <aside className={`chat-sidebar ${target ? "chat-hide-mobile" : ""}`}>
            <label className="search-field">
              <Search size={16} />
              <input
                autoFocus
                aria-label="Find a person"
                placeholder="Find a teacher or admin…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="chat-list">
              {query.trim() ? (
                <>
                  {searching ? (
                    <p className="record-empty">Searching…</p>
                  ) : results.length ? (
                    results.map((p) => (
                      <button
                        className="conversation-row"
                        key={p.id}
                        onClick={() => choose(p.id)}
                      >
                        <span className="chat-avatar">
                          {(p.fullName || p.username).slice(0, 1).toUpperCase()}
                        </span>
                        <span>
                          <strong>{p.fullName || p.username}</strong>
                          <small>@{p.username}</small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="record-empty">No people found.</p>
                  )}
                </>
              ) : (
                <>
                  {!conversations.length && (
                    <div className="record-empty">
                      <MessageSquare size={30} />
                      <h3>Start a conversation</h3>
                      <p>Search for a colleague above.</p>
                      {!isAdmin && (
                        <button
                          className="text-button"
                          onClick={() => choose("admin")}
                        >
                          Message administrator
                        </button>
                      )}
                    </div>
                  )}
                  {conversations.map((c) => (
                    <button
                      className={`conversation-row ${target === c.participantId ? "active" : ""}`}
                      key={c.participantId}
                      onClick={() => choose(c.participantId)}
                    >
                      <span className="chat-avatar">
                        {(c.participantFullName || c.participantUsername)
                          .slice(0, 1)
                          .toUpperCase()}
                      </span>
                      <span className="conversation-text">
                        <strong>
                          {c.participantFullName || c.participantUsername}
                        </strong>
                        <small>
                          {c.isDeleted
                            ? "Account deleted · history preserved"
                            : c.lastMessage}
                        </small>
                      </span>
                      <span className="conversation-meta">
                        <small>
                          {new Date(c.lastMessageAt).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric" },
                          )}
                        </small>
                        {c.unreadCount > 0 && <b>{c.unreadCount}</b>}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
            <div className="chat-sidebar-note">
              <ShieldCheck size={15} />
              Your chat deletions affect your inbox only.
            </div>
          </aside>
          <div className={`chat-thread ${!target ? "chat-hide-mobile" : ""}`}>
            {target ? (
              <>
                <div className="chat-peer">
                  <button
                    className="icon-button md:hidden"
                    aria-label="Back to conversations"
                    onClick={() => {
                      setTarget(null);
                      selected.current = null;
                    }}
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="chat-avatar">
                    {(participant?.fullName || participant?.username || "?")
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                  <div>
                    <h3>
                      {participant?.fullName ||
                        participant?.username ||
                        "Loading conversation…"}
                    </h3>
                    <small>
                      {participant?.isDeleted
                        ? "Account deleted"
                        : participant?.role === "teacher"
                          ? "Teacher"
                          : "Administrator"}
                    </small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Delete entire chat"
                    onClick={() => setAction({ type: "chat" })}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <label className="chat-search">
                  <Search size={14} />
                  <input
                    aria-label="Search this conversation"
                    placeholder="Search this conversation…"
                    value={threadSearch}
                    onChange={(e) => setThreadSearch(e.target.value)}
                  />
                </label>
                <div
                  className="chat-messages"
                  ref={scrollRef}
                  onScroll={() => {
                    const el = scrollRef.current;
                    if (el)
                      nearBottom.current =
                        el.scrollHeight - el.scrollTop - el.clientHeight < 100;
                  }}
                >
                  {loading ? (
                    <p className="record-empty">Loading messages…</p>
                  ) : !shown.length ? (
                    <div className="record-empty">
                      <MessageSquare size={32} />
                      <p>
                        {threadSearch
                          ? "No matching messages."
                          : "This is the beginning of your conversation."}
                      </p>
                    </div>
                  ) : (
                    shown.map((m, i) => (
                      <React.Fragment key={m.id}>
                        {(i === 0 ||
                          new Date(shown[i - 1].createdAt).toDateString() !==
                            new Date(m.createdAt).toDateString()) && (
                          <div className="chat-date">
                            {new Date(m.createdAt).toLocaleDateString(
                              undefined,
                              {
                                weekday: "short",
                                day: "numeric",
                                month: "long",
                              },
                            )}
                          </div>
                        )}
                        <div
                          className={`chat-message ${m.isMine ? "mine" : ""}`}
                        >
                          <div
                            className={`chat-bubble ${m.isUnsent ? "unsent" : ""}`}
                          >
                            <p>{m.isUnsent ? "Message unsent" : m.message}</p>
                            <small>
                              {new Date(m.createdAt).toLocaleTimeString(
                                undefined,
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                              {m.isMine && !m.isUnsent && (
                                <span title={m.read ? "Seen" : "Sent"}>
                                  {m.read ? (
                                    <CheckCheck size={13} />
                                  ) : (
                                    <Check size={13} />
                                  )}
                                </span>
                              )}
                            </small>
                          </div>
                          <button
                            className="chat-message-action"
                            aria-label={`Message options: ${m.message.slice(0, 30)}`}
                            onClick={() =>
                              setAction({ type: "message", message: m })
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </React.Fragment>
                    ))
                  )}
                </div>
                {participant?.isDeleted ? (
                  <div className="deleted-conversation">
                    <ShieldCheck size={18} />
                    <div>
                      <strong>This account has been deleted.</strong>
                      <p>
                        You can read this conversation, but you can’t reply
                        because the other account no longer exists.
                      </p>
                    </div>
                  </div>
                ) : (
                  <form
                    className="chat-compose"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <textarea
                      rows={2}
                      aria-label="Message"
                      maxLength={300}
                      placeholder="Write a message…"
                      value={draft}
                      disabled={!participant || loading}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [target]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <button
                      className="record-primary"
                      aria-label="Send message"
                      disabled={
                        sending || !draft.trim() || !participant || loading
                      }
                    >
                      <Send size={18} />
                    </button>
                    <small>
                      Enter to send · Shift + Enter for a new line
                      <span>{draft.length}/300</span>
                    </small>
                  </form>
                )}
              </>
            ) : (
              <div className="chat-welcome">
                <MessageSquare size={45} />
                <h3>
                  A little conversation.
                  <br />A better school day.
                </h3>
                <p>Choose a conversation or find a colleague.</p>
              </div>
            )}
          </div>
        </div>
        {action && (
          <div className="chat-confirm-overlay">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-title"
              className="chat-confirm"
            >
              <Trash2 size={23} />
              <h3 id="delete-title">
                {action.type === "chat"
                  ? "Delete this chat?"
                  : "Remove this message?"}
              </h3>
              <p>
                {action.type === "chat"
                  ? "This removes the existing conversation from your inbox. Other participants keep their copy. New messages can reopen the chat."
                  : "Delete for me hides it only from your view. You can also unsend a message you sent; everyone will see “Message unsent”."}
              </p>
              <div>
                <button
                  className="record-secondary"
                  disabled={deleting}
                  onClick={() => setAction(null)}
                >
                  Cancel
                </button>
                <button
                  className="record-secondary"
                  disabled={deleting}
                  onClick={() => remove("me")}
                >
                  Delete for me
                </button>
                {action.type === "message" &&
                  !action.message?.isUnsent &&
                  (action.message?.senderId === currentUser.id ||
                    (isAdmin && action.message?.senderId === "admin")) && (
                    <button
                      className="record-danger"
                      disabled={deleting}
                      onClick={() => remove("everyone")}
                    >
                      Unsend for everyone
                    </button>
                  )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
