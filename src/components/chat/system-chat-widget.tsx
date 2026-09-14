"use client";

import * as React from "react";
import {
  MessageSquare,
  X,
  Send,
  Headphones,
  Sparkles,
  Search,
  Trash2,
} from "lucide-react";
import type { AuthUser } from "@/lib/types";

interface Message {
  id: string;
  userId: string;
  sender: "USER" | "ADMIN";
  message: string;
  read: boolean;
  createdAt: string;
}

interface Conversation {
  userId: string;
  userName: string;
  userEmail: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

const QUICK_TOPICS = [
  { label: "⚡ Order status inquiry", text: "Hello! Could you please check on the status of my recent order?" },
  { label: "💳 Wallet top-up query", text: "Hi, I have a question regarding my wallet balance top-up." },
  { label: "📶 MTN network speed", text: "Hello support, how fast are MTN bundle deliveries today?" },
  { label: "👋 Chat with an agent", text: "Hello, I would like to speak directly with an administrator." },
];

export function SystemChatWidget({ user }: { user: AuthUser }) {
  const isStaff = user.role === "ADMIN" || user.role === "MANAGER" || user.role === "SECRETARY";
  const [open, setOpen] = React.useState(false);
  const [minimized, setMinimized] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);

  // Admin staff view state
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [confirmDeleteMsgId, setConfirmDeleteMsgId] = React.useState<string | null>(null);
  const [deletingMsgId, setDeletingMsgId] = React.useState<string | null>(null);
  const [confirmDeleteThread, setConfirmDeleteThread] = React.useState(false);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = React.useState<string | null>(null);
  const [deletingThread, setDeletingThread] = React.useState(false);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadUserMessages = React.useCallback(async () => {
    try {
      const res = await fetch("/api/chat/messages");
      if (!res.ok) return;
      const json = await res.json();
      const msgs: Message[] = json.messages ?? [];
      setMessages(msgs);
      const unread = msgs.filter((m) => m.sender === "ADMIN" && !m.read).length;
      setUnreadCount(unread);
    } catch {
      // silent
    }
  }, []);

  const loadAdminConversations = React.useCallback(async (search?: string) => {
    try {
      const url = search ? `/api/admin/chat?search=${encodeURIComponent(search)}` : "/api/admin/chat";
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const convs: Conversation[] = json.conversations ?? [];
      setConversations(convs);
      const totalUnread = convs.reduce((sum, c) => sum + c.unreadCount, 0);
      setUnreadCount(totalUnread);
    } catch {
      // silent
    }
  }, []);

  const loadAdminThread = React.useCallback(async (targetUserId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/chat?userId=${targetUserId}`);
      if (!res.ok) return;
      const json = await res.json();
      setMessages(json.messages ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredConversations = React.useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter(
      (c) =>
        c.userName.toLowerCase().includes(q) ||
        c.userEmail.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  React.useEffect(() => {
    if (isStaff) {
      loadAdminConversations(searchQuery.trim() || undefined);
      const interval = setInterval(() => {
        loadAdminConversations(searchQuery.trim() || undefined);
      }, 12000);
      return () => clearInterval(interval);
    } else {
      loadUserMessages();
      const interval = setInterval(loadUserMessages, 10000);
      return () => clearInterval(interval);
    }
  }, [isStaff, searchQuery, loadAdminConversations, loadUserMessages]);

  React.useEffect(() => {
    if (isStaff && selectedUserId) {
      loadAdminThread(selectedUserId);
      const interval = setInterval(() => loadAdminThread(selectedUserId), 8000);
      return () => clearInterval(interval);
    }
  }, [isStaff, selectedUserId, loadAdminThread]);

  const handleDeleteMessage = async (msgId: string) => {
    setDeletingMsgId(msgId);
    try {
      const res = await fetch(`/api/admin/chat?messageId=${msgId}`, { method: "DELETE" });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== msgId));
        loadAdminConversations(searchQuery.trim() || undefined);
      }
    } catch (err) {
      console.error("Failed to delete message:", err);
    } finally {
      setDeletingMsgId(null);
      setConfirmDeleteMsgId(null);
    }
  };

  const handleDeleteThread = async (targetUserId: string) => {
    setDeletingThread(true);
    try {
      const res = await fetch(`/api/admin/chat?userId=${targetUserId}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedUserId === targetUserId) {
          setMessages([]);
          setSelectedUserId(null);
          setConfirmDeleteThread(false);
        }
        setConfirmDeleteUserId(null);
        await loadAdminConversations(searchQuery.trim() || undefined);
      }
    } catch (err) {
      console.error("Failed to delete chat thread:", err);
    } finally {
      setDeletingThread(false);
    }
  };

  React.useEffect(() => {
    if (open) {
      scrollToBottom();
      setUnreadCount(0);
    }
  }, [open, messages]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput("");

    try {
      if (isStaff && selectedUserId) {
        const res = await fetch("/api/admin/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: selectedUserId, message: text }),
        });
        if (res.ok) {
          const json = await res.json();
          setMessages((prev) => [...prev, json.message]);
          loadAdminConversations();
        }
      } else {
        const res = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        if (res.ok) {
          const json = await res.json();
          setMessages((prev) => [...prev, json.message]);
        }
      }
    } finally {
      setSending(false);
      setTimeout(scrollToBottom, 100);
    }
  };

  const handleQuickTopic = (text: string) => {
    setInput(text);
  };

  return (
    <>
      {/* Floating Chat Trigger Button */}
      <button
        onClick={() => {
          setOpen((v) => !v);
          setMinimized(false);
        }}
        aria-label="Open support chat"
        className="fixed bottom-5 right-5 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 text-white shadow-xl shadow-blue-600/35 transition-all duration-300 hover:scale-105 hover:shadow-blue-600/50 active:scale-95"
      >
        <div className="relative flex items-center justify-center">
          <MessageSquare className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-[#0a1120]" />
          </span>
        </div>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-extrabold text-white ring-2 ring-white dark:ring-[#0a1120]">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Chat Box Modal Window */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex w-[92vw] max-w-[400px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl transition-all duration-200 dark:border-white/10 dark:bg-[#0d1526]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur">
                <Headphones className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-bold leading-none">
                  {isStaff ? "Staff Support Console" : "Tskconnect Support"}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-blue-100 font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {isStaff
                    ? selectedUserId
                      ? `Replying to user`
                      : `${conversations.length} Active chats`
                    : "Support Team · Instant replies"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-white/80 hover:bg-white/15 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Admin Staff view: conversation list vs thread */}
          {isStaff && !selectedUserId && (
            <div className="flex flex-col max-h-[420px] min-h-[320px]">
              {/* Search Bar & Conversation Count */}
              <div className="border-b border-slate-100 bg-slate-50/70 p-2.5 dark:border-white/5 dark:bg-white/5">
                <div className="relative flex items-center">
                  <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search users by name or email..."
                    className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-white/10 dark:bg-[#131d31] dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 rounded-full p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      title="Clear search"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between px-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <span>Select a user to reply:</span>
                  <span>
                    {filteredConversations.length}
                    {searchQuery.trim() ? " found" : " conversations"}
                  </span>
                </div>
              </div>

              {/* Conversation items */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
                {filteredConversations.length === 0 ? (
                  <div className="py-16 px-4 text-center text-xs text-slate-400">
                    {searchQuery.trim() ? (
                      <div className="space-y-2">
                        <p>No user conversations matching &quot;{searchQuery}&quot;</p>
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
                        >
                          Clear search
                        </button>
                      </div>
                    ) : (
                      "No active customer conversations yet."
                    )}
                  </div>
                ) : (
                  filteredConversations.map((c) => (
                    <div
                      key={c.userId}
                      className="group relative flex w-full items-center transition hover:bg-slate-50 dark:hover:bg-white/5"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(c.userId)}
                        className="flex flex-1 items-start gap-3 p-3 text-left min-w-0"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 font-bold text-xs">
                          {c.userName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                              {c.userName}
                            </p>
                            {c.unreadCount > 0 && (
                              <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white shrink-0 ml-1">
                                {c.unreadCount}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-slate-400">{c.userEmail}</p>
                          <p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-300">
                            {c.lastMessage}
                          </p>
                        </div>
                      </button>

                      {/* Delete conversation button */}
                      <div className="pr-3 shrink-0">
                        {confirmDeleteUserId === c.userId ? (
                          <div className="flex items-center gap-1 rounded bg-red-50 px-1.5 py-1 border border-red-200 dark:bg-red-950/60 dark:border-red-800 text-[10px] shadow-sm">
                            <span className="text-red-600 dark:text-red-400 font-medium">Delete?</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteThread(c.userId);
                              }}
                              disabled={deletingThread}
                              className="font-bold text-red-600 hover:text-red-800 dark:text-red-400 hover:underline"
                            >
                              {deletingThread ? "…" : "Yes"}
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteUserId(null);
                              }}
                              className="text-slate-500 hover:text-slate-700 dark:text-slate-400"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteUserId(c.userId);
                            }}
                            title="Delete conversation"
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Message Thread Body */}
          {(!isStaff || selectedUserId) && (
            <>
              {isStaff && selectedUserId && (
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-white/5 dark:bg-white/5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      onClick={() => {
                        setSelectedUserId(null);
                        setConfirmDeleteThread(false);
                        setConfirmDeleteMsgId(null);
                      }}
                      className="text-[11px] font-bold text-brand-600 hover:underline dark:text-brand-400 shrink-0"
                    >
                      ← All Chats
                    </button>
                    <span className="text-slate-300 dark:text-slate-600">|</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                      {conversations.find((c) => c.userId === selectedUserId)?.userName || "User Thread"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {confirmDeleteThread ? (
                      <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/50 px-2 py-0.5 rounded border border-red-200 dark:border-red-900/50 text-[10px]">
                        <span className="text-red-600 dark:text-red-400 font-medium">Delete all?</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteThread(selectedUserId)}
                          disabled={deletingThread}
                          className="font-bold text-red-600 hover:text-red-800 dark:text-red-400 hover:underline"
                        >
                          {deletingThread ? "…" : "Yes"}
                        </button>
                        <span className="text-red-300">/</span>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteThread(false)}
                          className="text-slate-500 hover:text-slate-700 dark:text-slate-400"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteThread(true)}
                        title="Delete entire conversation"
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span className="text-[10px]">Delete chat</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex h-[340px] flex-col overflow-y-auto p-4 space-y-3 bg-slate-50/50 dark:bg-transparent">
                {/* Welcome Card */}
                {!isStaff && (
                  <div className="rounded-xl border border-brand-500/20 bg-brand-50/40 p-3 text-xs dark:bg-brand-500/10">
                    <div className="flex items-center gap-1.5 font-bold text-brand-700 dark:text-brand-300">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Welcome to Tskconnect Live Help</span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                      Our system support team is here to assist with your data packages, billing, or any delivery issues.
                    </p>
                  </div>
                )}

                {/* Messages */}
                {messages.map((m) => {
                  const isMe = isStaff ? m.sender === "ADMIN" : m.sender === "USER";
                  return (
                    <div
                      key={m.id}
                      className={`group relative flex flex-col ${isMe ? "items-end" : "items-start"}`}
                    >
                      <div className={`flex items-end gap-1.5 max-w-[88%] ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                        {!isMe && (
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                            {isStaff ? "U" : "S"}
                          </div>
                        )}
                        <div
                          className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-sm ${
                            isMe
                              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-none"
                              : "bg-white text-slate-800 border border-slate-200/80 rounded-bl-none dark:bg-[#131d31] dark:border-white/10 dark:text-slate-100"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.message}</p>
                        </div>

                        {/* Staff message deletion action */}
                        {isStaff && (
                          <div className="shrink-0 flex items-center self-center">
                            {confirmDeleteMsgId === m.id ? (
                              <div className="flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 border border-red-200 dark:bg-red-950/70 dark:border-red-800 text-[10px] shadow-sm animate-in fade-in">
                                <span className="text-red-600 dark:text-red-400 font-medium">Delete?</span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(m.id)}
                                  disabled={deletingMsgId === m.id}
                                  className="font-bold text-red-600 hover:text-red-800 dark:text-red-400 hover:underline"
                                >
                                  {deletingMsgId === m.id ? "…" : "Yes"}
                                </button>
                                <span className="text-slate-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteMsgId(null)}
                                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteMsgId(m.id)}
                                title="Delete message"
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="mt-1 px-1 text-[10px] text-slate-400">
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick action topic chips (User only) */}
              {!isStaff && (
                <div className="flex gap-1.5 overflow-x-auto px-3 py-2 border-t border-slate-100 bg-white dark:border-white/5 dark:bg-[#0d1526] no-scrollbar">
                  {QUICK_TOPICS.map((t, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleQuickTopic(t.text)}
                      className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-brand-500/40 hover:bg-brand-50/50 hover:text-brand-600 transition dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-brand-400"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Message Input Box */}
              <form
                onSubmit={handleSend}
                className="flex items-center gap-2 border-t border-slate-200/70 bg-white p-2.5 dark:border-white/10 dark:bg-[#0d1526]"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message…"
                  disabled={sending}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-brand-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-brand-400"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || sending}
                  className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
