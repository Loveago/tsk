"use client";

import * as React from "react";
import Link from "next/link";
import {
  MessageSquare,
  X,
  Send,
  Headphones,
  Sparkles,
  Search,
  Trash2,
  Check,
  CheckCheck,
  Maximize2,
  Minimize2,
  ExternalLink,
  ArrowDown,
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

export function SystemChatWidget({ user }: { user: AuthUser }) {
  const isStaff = user.role === "ADMIN" || user.role === "MANAGER" || user.role === "SECRETARY";
  const [open, setOpen] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [showScrollBottom, setShowScrollBottom] = React.useState(false);

  // Admin staff view state
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [confirmDeleteMsgId, setConfirmDeleteMsgId] = React.useState<string | null>(null);
  const [deletingMsgId, setDeletingMsgId] = React.useState<string | null>(null);
  const [confirmDeleteThread, setConfirmDeleteThread] = React.useState(false);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = React.useState<string | null>(null);
  const [deletingThread, setDeletingThread] = React.useState(false);

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const isNearBottomRef = React.useRef(true);
  const selectedUserIdRef = React.useRef<string | null>(selectedUserId);

  React.useEffect(() => {
    selectedUserIdRef.current = selectedUserId;
  }, [selectedUserId]);

  const scrollToBottom = React.useCallback((smooth = false) => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
      isNearBottomRef.current = true;
      setShowScrollBottom(false);
    }
  }, []);

  const handleMessagesScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const isNear = distanceFromBottom < 90;
    isNearBottomRef.current = isNear;
    setShowScrollBottom(distanceFromBottom > 160);
  };

  const loadUserMessages = React.useCallback(async () => {
    try {
      const res = await fetch("/api/chat/messages");
      if (!res.ok) return;
      const json = await res.json();
      const msgs: Message[] = json.messages ?? [];
      setMessages((prev) => {
        if (
          prev.length === msgs.length &&
          prev[prev.length - 1]?.id === msgs[msgs.length - 1]?.id
        ) {
          return prev;
        }
        return msgs;
      });
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
      const currentActiveId = selectedUserIdRef.current;
      const updatedConvs = convs.map((c) =>
        c.userId === currentActiveId ? { ...c, unreadCount: 0 } : c
      );
      setConversations(updatedConvs);
      const totalUnread = updatedConvs.reduce((sum, c) => sum + c.unreadCount, 0);
      setUnreadCount(totalUnread);
    } catch {
      // silent
    }
  }, []);

  const loadAdminThread = React.useCallback(async (targetUserId: string, isPoll = false) => {
    if (!isPoll) setLoading(true);
    try {
      const res = await fetch(`/api/admin/chat?userId=${targetUserId}`);
      if (!res.ok) return;
      const json = await res.json();
      const newMsgs: Message[] = json.messages ?? [];
      setMessages((prev) => {
        if (
          prev.length === newMsgs.length &&
          prev[prev.length - 1]?.id === newMsgs[newMsgs.length - 1]?.id
        ) {
          return prev;
        }
        return newMsgs;
      });
      setConversations((prev) => {
        const next = prev.map((c) =>
          c.userId === targetUserId ? { ...c, unreadCount: 0 } : c
        );
        const totalUnread = next.reduce((sum, c) => sum + c.unreadCount, 0);
        setUnreadCount(totalUnread);
        return next;
      });
    } finally {
      if (!isPoll) setLoading(false);
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

  // Polling for conversations or messages
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
      loadAdminThread(selectedUserId, false);
      const interval = setInterval(() => loadAdminThread(selectedUserId, true), 8000);
      return () => clearInterval(interval);
    }
  }, [isStaff, selectedUserId, loadAdminThread]);

  // Auto-scroll when messages change or thread changes
  React.useEffect(() => {
    if (!open) return;
    if (isNearBottomRef.current) {
      // Small timeout ensures DOM layout has completed
      const t = setTimeout(() => scrollToBottom(false), 50);
      return () => clearTimeout(t);
    }
  }, [messages, open, selectedUserId, scrollToBottom]);

  // Scroll to bottom when window is opened or thread is switched
  React.useEffect(() => {
    if (open) {
      isNearBottomRef.current = true;
      const t = setTimeout(() => scrollToBottom(false), 100);
      if (!isStaff) {
        setUnreadCount(0);
      }
      return () => clearTimeout(t);
    }
  }, [open, selectedUserId, isStaff, scrollToBottom]);

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
          isNearBottomRef.current = true;
          setTimeout(() => scrollToBottom(true), 50);
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
          isNearBottomRef.current = true;
          setTimeout(() => scrollToBottom(true), 50);
        }
      }
    } finally {
      setSending(false);
    }
  };

  const activeConversation = isStaff && selectedUserId
    ? conversations.find((c) => c.userId === selectedUserId)
    : null;

  return (
    <>
      {/* Floating Chat Trigger Button */}
      <button
        onClick={() => setOpen((v) => !v)}
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
        <div
          className={`fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl transition-all duration-200 dark:border-white/10 dark:bg-[#0d1526] ${
            isExpanded
              ? "bottom-4 right-4 left-4 top-4 md:left-auto md:top-auto md:bottom-6 md:right-6 md:w-[860px] md:h-[640px] max-w-[96vw] max-h-[92vh]"
              : "bottom-20 right-4 sm:right-6 w-[92vw] sm:w-[430px] max-w-[440px] h-[540px] max-h-[82vh]"
          }`}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-4 py-3 text-white shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur">
                <Headphones className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-none truncate">
                  {isStaff ? "Staff Support Desk" : "Tskconnect Live Support"}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-blue-100 font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="truncate">
                    {isStaff
                      ? selectedUserId
                        ? `Chat with ${activeConversation?.userName || "User"}`
                        : `${conversations.length} Active Customer Chats`
                      : "Customer Care · Instant Replies"}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isStaff && (
                <Link
                  href="/admin/chat"
                  title="Open in full screen admin page"
                  className="rounded-lg p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition"
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
              )}

              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                title={isExpanded ? "Collapse view" : "Expand to PC desktop view"}
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition hidden sm:inline-flex"
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close chat"
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* MAIN BODY: Split view on expanded PC for staff, or single pane on mobile/compact */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Conversation List Panel */}
            {isStaff && (!selectedUserId || isExpanded) && (
              <div
                className={`flex flex-col min-h-0 border-r border-slate-200/70 bg-slate-50/50 dark:border-white/10 dark:bg-[#0a1120]/50 ${
                  isExpanded ? "w-full md:w-[320px] shrink-0" : "w-full"
                }`}
              >
                {/* Search Bar & Conversation Count */}
                <div className="border-b border-slate-100 bg-white/70 p-2.5 dark:border-white/5 dark:bg-white/5">
                  <div className="relative flex items-center">
                    <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name or email..."
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
                    <span>Conversations</span>
                    <span>
                      {filteredConversations.length}
                      {searchQuery.trim() ? " found" : " total"}
                    </span>
                  </div>
                </div>

                {/* Conversation items list with smooth native overscroll-contain */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-slate-100 dark:divide-white/5">
                  {filteredConversations.length === 0 ? (
                    <div className="py-16 px-4 text-center text-xs text-slate-400">
                      {searchQuery.trim() ? (
                        <div className="space-y-2">
                          <p>No conversations matching &quot;{searchQuery}&quot;</p>
                          <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
                          >
                            Clear search
                          </button>
                        </div>
                      ) : (
                        "No customer conversations yet."
                      )}
                    </div>
                  ) : (
                    filteredConversations.map((c) => {
                      const isSelected = selectedUserId === c.userId;
                      return (
                        <div
                          key={c.userId}
                          className={`group relative flex w-full items-center transition ${
                            isSelected
                              ? "bg-brand-50/80 dark:bg-brand-950/40 border-l-3 border-brand-600"
                              : "hover:bg-slate-100/70 dark:hover:bg-white/5"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUserId(c.userId);
                              setConversations((prev) => {
                                const next = prev.map((item) =>
                                  item.userId === c.userId ? { ...item, unreadCount: 0 } : item
                                );
                                const totalUnread = next.reduce((sum, item) => sum + item.unreadCount, 0);
                                setUnreadCount(totalUnread);
                                return next;
                              });
                            }}
                            className="flex flex-1 items-start gap-3 p-3 text-left min-w-0"
                          >
                            <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 font-bold text-xs">
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
                          <div className="pr-2 shrink-0">
                            {confirmDeleteUserId === c.userId ? (
                              <div className="flex items-center gap-1 rounded bg-red-50 px-1.5 py-1 border border-red-200 dark:bg-red-950/60 dark:border-red-800 text-[10px] shadow-sm">
                                <span className="text-red-600 dark:text-red-400 font-medium">Del?</span>
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
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Chat Thread Panel */}
            {(!isStaff || selectedUserId || isExpanded) && (
              <div className="flex flex-1 flex-col min-h-0 bg-white dark:bg-[#0d1526]">
                {/* Empty State when in expanded PC view and no conversation selected */}
                {isStaff && isExpanded && !selectedUserId ? (
                  <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-slate-400">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-500 mb-3">
                      <MessageSquare className="h-7 w-7" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      No Conversation Selected
                    </p>
                    <p className="mt-1 text-xs text-slate-500 max-w-xs">
                      Choose a customer from the left list to view chat history and send a reply.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Thread Sub-Header for Staff */}
                    {isStaff && selectedUserId && (
                      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50 px-3.5 py-2 text-xs dark:border-white/5 dark:bg-white/5">
                        <div className="flex items-center gap-2 min-w-0">
                          {!isExpanded && (
                            <button
                              onClick={() => {
                                setSelectedUserId(null);
                                setConfirmDeleteThread(false);
                                setConfirmDeleteMsgId(null);
                                loadAdminConversations(searchQuery.trim() || undefined);
                              }}
                              className="text-[11px] font-bold text-brand-600 hover:underline dark:text-brand-400 shrink-0"
                            >
                              ← Back
                            </button>
                          )}
                          {!isExpanded && <span className="text-slate-300 dark:text-slate-600">|</span>}
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-800 dark:text-slate-100 truncate block">
                              {activeConversation?.userName || "Customer Thread"}
                            </span>
                            <span className="text-[10px] text-slate-400 truncate block">
                              {activeConversation?.userEmail}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {confirmDeleteThread ? (
                            <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/50 px-2 py-0.5 rounded border border-red-200 dark:border-red-900/50 text-[10px]">
                              <span className="text-red-600 dark:text-red-400 font-medium">Delete thread?</span>
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
                              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span className="text-[10px]">Delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Messages Scroll Container */}
                    <div className="relative flex-1 min-h-0">
                      <div
                        ref={scrollContainerRef}
                        onScroll={handleMessagesScroll}
                        className="h-full overflow-y-auto overscroll-contain p-4 space-y-3 bg-slate-50/40 dark:bg-transparent"
                      >
                        {/* Welcome Card for Regular Users */}
                        {!isStaff && (
                          <div className="rounded-xl border border-brand-500/20 bg-brand-50/40 p-3 text-xs dark:bg-brand-500/10">
                            <div className="flex items-center gap-1.5 font-bold text-brand-700 dark:text-brand-300">
                              <Sparkles className="h-3.5 w-3.5" />
                              <span>Welcome to Tskconnect Live Help</span>
                            </div>
                            <p className="mt-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                              Our support desk is here to assist with your data packages, deliveries, or billing questions.
                            </p>
                          </div>
                        )}

                        {loading && (
                          <div className="flex justify-center py-6 text-xs text-slate-400">
                            Loading conversation…
                          </div>
                        )}

                        {/* Message Bubbles */}
                        {messages.map((m) => {
                          const isMe = isStaff ? m.sender === "ADMIN" : m.sender === "USER";
                          return (
                            <div
                              key={m.id}
                              className={`group relative flex flex-col ${isMe ? "items-end" : "items-start"}`}
                            >
                              <div
                                className={`flex items-end gap-1.5 max-w-[85%] ${
                                  isMe ? "flex-row-reverse" : "flex-row"
                                }`}
                              >
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
                                  <p className="whitespace-pre-wrap break-words select-text">{m.message}</p>
                                </div>

                                {/* Staff single message deletion */}
                                {isStaff && (
                                  <div className="shrink-0 flex items-center self-center">
                                    {confirmDeleteMsgId === m.id ? (
                                      <div className="flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 border border-red-200 dark:bg-red-950/70 dark:border-red-800 text-[10px] shadow-sm animate-in fade-in">
                                        <span className="text-red-600 dark:text-red-400 font-medium">Del?</span>
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
                              <div className="mt-1 flex items-center gap-1 px-1 text-[10px] text-slate-400">
                                <span>
                                  {new Date(m.createdAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                                {isMe && (
                                  <span className="flex items-center gap-0.5 ml-0.5 text-[9px] text-slate-400 dark:text-slate-500">
                                    · {m.read ? "Read" : "Sent"}
                                    {m.read ? (
                                      <CheckCheck className="h-3 w-3 text-brand-500 dark:text-brand-400" />
                                    ) : (
                                      <Check className="h-3 w-3 text-slate-400" />
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Floating Jump to Latest Button */}
                      {showScrollBottom && (
                        <button
                          type="button"
                          onClick={() => scrollToBottom(true)}
                          className="absolute bottom-3 right-4 z-10 flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur hover:bg-slate-900 transition animate-in fade-in"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                          <span>Jump to latest</span>
                        </button>
                      )}
                    </div>

                    {/* Message Input Bar */}
                    <form
                      onSubmit={handleSend}
                      className="shrink-0 flex items-center gap-2 border-t border-slate-200/70 bg-white p-2.5 dark:border-white/10 dark:bg-[#0d1526]"
                    >
                      <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type a message… (Press Enter to send)"
                        disabled={sending}
                        className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-brand-500 focus:bg-white caret-brand-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:bg-slate-800 dark:focus:border-brand-400 dark:caret-brand-400"
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
          </div>
        </div>
      )}
    </>
  );
}
