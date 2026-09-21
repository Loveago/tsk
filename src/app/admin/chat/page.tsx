"use client";

import * as React from "react";
import {
  MessageSquare,
  Search,
  Trash2,
  Send,
  Sparkles,
  Check,
  CheckCheck,
  RefreshCw,
  X,
  ArrowDown,
  User,
  Shield,
  Clock,
} from "lucide-react";
import { PageHeader, Spinner, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";

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

export default function AdminChatPage() {
  const { toast } = useToast();
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [loadingList, setLoadingList] = React.useState(true);
  const [loadingThread, setLoadingThread] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = React.useState<string | null>(null);
  const [confirmDeleteThread, setConfirmDeleteThread] = React.useState(false);
  const [deletingThread, setDeletingThread] = React.useState(false);
  const [confirmDeleteMsgId, setConfirmDeleteMsgId] = React.useState<string | null>(null);
  const [deletingMsgId, setDeletingMsgId] = React.useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = React.useState(false);

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
    isNearBottomRef.current = distanceFromBottom < 90;
    setShowScrollBottom(distanceFromBottom > 160);
  };

  const loadConversations = React.useCallback(async (search?: string, silent = false) => {
    if (!silent) setLoadingList(true);
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
    } catch {
      // silent
    } finally {
      if (!silent) setLoadingList(false);
    }
  }, []);

  const loadThread = React.useCallback(async (targetUserId: string, silent = false) => {
    if (!silent) setLoadingThread(true);
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
      setConversations((prev) =>
        prev.map((c) => (c.userId === targetUserId ? { ...c, unreadCount: 0 } : c))
      );
    } finally {
      if (!silent) setLoadingThread(false);
    }
  }, []);

  // Initial load and periodic polling
  React.useEffect(() => {
    loadConversations(searchQuery.trim() || undefined);
    const interval = setInterval(() => {
      loadConversations(searchQuery.trim() || undefined, true);
    }, 10000);
    return () => clearInterval(interval);
  }, [searchQuery, loadConversations]);

  React.useEffect(() => {
    if (selectedUserId) {
      loadThread(selectedUserId, false);
      const interval = setInterval(() => loadThread(selectedUserId, true), 8000);
      return () => clearInterval(interval);
    }
  }, [selectedUserId, loadThread]);

  // Auto-scroll when switching user or message updates
  React.useEffect(() => {
    if (selectedUserId) {
      isNearBottomRef.current = true;
      const t = setTimeout(() => scrollToBottom(false), 80);
      return () => clearTimeout(t);
    }
  }, [selectedUserId, scrollToBottom]);

  React.useEffect(() => {
    if (isNearBottomRef.current) {
      const t = setTimeout(() => scrollToBottom(false), 50);
      return () => clearTimeout(t);
    }
  }, [messages, scrollToBottom]);

  const handleDeleteMessage = async (msgId: string) => {
    setDeletingMsgId(msgId);
    try {
      const res = await fetch(`/api/admin/chat?messageId=${msgId}`, { method: "DELETE" });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== msgId));
        loadConversations(searchQuery.trim() || undefined, true);
        toast("Message deleted", "success");
      }
    } catch {
      toast("Failed to delete message", "error");
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
        }
        setConfirmDeleteUserId(null);
        await loadConversations(searchQuery.trim() || undefined);
        toast("Conversation deleted", "success");
      }
    } catch {
      toast("Failed to delete conversation", "error");
    } finally {
      setDeletingThread(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || sending || !selectedUserId) return;

    setSending(true);
    setInput("");

    try {
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
        loadConversations(searchQuery.trim() || undefined, true);
      } else {
        toast("Failed to send message", "error");
      }
    } finally {
      setSending(false);
    }
  };

  const activeConversation = conversations.find((c) => c.userId === selectedUserId);
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const filteredConversations = React.useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter(
      (c) =>
        c.userName.toLowerCase().includes(q) ||
        c.userEmail.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Support Chat Desk"
        description="Respond to live support requests from users and customers with instant messaging."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadConversations(searchQuery.trim() || undefined);
                if (selectedUserId) loadThread(selectedUserId);
              }}
              className="h-8.5 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Main Support Console Workspace */}
      <div className="flex flex-col md:flex-row h-[calc(100vh-13rem)] min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Left Column: Conversations List */}
        <div
          className={`flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 md:w-80 lg:w-96 shrink-0 ${
            selectedUserId ? "hidden md:flex" : "flex"
          }`}
        >
          {/* Search Header */}
          <div className="border-b border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search customers by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 rounded-full p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Customer Chats ({filteredConversations.length})
              </span>
              {totalUnread > 0 && (
                <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  {totalUnread} unread
                </span>
              )}
            </div>
          </div>

          {/* Conversations Scroll List */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-slate-100 dark:divide-slate-800">
            {loadingList ? (
              <div className="flex justify-center py-16">
                <Spinner className="h-6 w-6 text-brand-600" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                {searchQuery.trim() ? (
                  <p>No customers match &quot;{searchQuery}&quot;</p>
                ) : (
                  <p>No active customer conversations yet.</p>
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
                        ? "bg-brand-50 dark:bg-brand-950/40 border-l-4 border-brand-600"
                        : "hover:bg-slate-100/70 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUserId(c.userId);
                        setConversations((prev) =>
                          prev.map((item) =>
                            item.userId === c.userId ? { ...item, unreadCount: 0 } : item
                          )
                        );
                      }}
                      className="flex flex-1 items-start gap-3 p-3.5 text-left min-w-0"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 font-bold text-sm">
                        {c.userName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
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

                    {/* Delete conversation action */}
                    <div className="pr-3 shrink-0">
                      {confirmDeleteUserId === c.userId ? (
                        <div className="flex items-center gap-1 rounded bg-red-50 px-2 py-1 border border-red-200 dark:bg-red-950/60 dark:border-red-800 text-[11px] shadow-sm">
                          <span className="text-red-600 dark:text-red-400 font-medium">Delete?</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteThread(c.userId)}
                            disabled={deletingThread}
                            className="font-bold text-red-600 hover:text-red-800 dark:text-red-400 hover:underline"
                          >
                            {deletingThread ? "…" : "Yes"}
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteUserId(null)}
                            className="text-slate-500 hover:text-slate-700 dark:text-slate-400"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteUserId(c.userId)}
                          title="Delete thread"
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Chat Thread & Reply Workspace */}
        <div
          className={`flex flex-1 flex-col min-h-0 bg-white dark:bg-slate-900 ${
            !selectedUserId ? "hidden md:flex" : "flex"
          }`}
        >
          {selectedUserId && activeConversation ? (
            <>
              {/* Thread Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50/75 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedUserId(null)}
                    className="md:hidden rounded-lg p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
                  >
                    ← Back
                  </button>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 font-bold text-sm">
                    {activeConversation.userName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {activeConversation.userName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {activeConversation.userEmail}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {confirmDeleteThread ? (
                    <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                      <span>Delete conversation?</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteThread(selectedUserId)}
                        disabled={deletingThread}
                        className="font-bold underline hover:text-red-900 dark:hover:text-red-100"
                      >
                        {deletingThread ? "…" : "Confirm"}
                      </button>
                      <span>·</span>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteThread(false)}
                        className="hover:text-slate-700 dark:hover:text-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDeleteThread(true)}
                      className="h-8 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Delete Chat
                    </Button>
                  )}
                </div>
              </div>

              {/* Messages Container with Native Overscroll Containment */}
              <div className="relative flex-1 min-h-0">
                <div
                  ref={scrollContainerRef}
                  onScroll={handleMessagesScroll}
                  className="h-full overflow-y-auto overscroll-contain p-6 space-y-4 bg-slate-50/40 dark:bg-slate-900/40"
                >
                  {loadingThread && (
                    <div className="flex justify-center py-6">
                      <Spinner className="h-6 w-6 text-brand-600" />
                    </div>
                  )}

                  {messages.length === 0 && !loadingThread && (
                    <div className="py-16 text-center text-xs text-slate-400">
                      No messages yet in this conversation.
                    </div>
                  )}

                  {messages.map((m) => {
                    const isMe = m.sender === "ADMIN";
                    return (
                      <div
                        key={m.id}
                        className={`group relative flex flex-col ${isMe ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`flex items-end gap-2 max-w-[80%] ${
                            isMe ? "flex-row-reverse" : "flex-row"
                          }`}
                        >
                          {!isMe && (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              U
                            </div>
                          )}
                          <div
                            className={`rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm ${
                              isMe
                                ? "bg-brand-600 text-white rounded-br-none"
                                : "bg-white text-slate-900 border border-slate-200 rounded-bl-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words select-text">{m.message}</p>
                          </div>

                          {/* Staff message deletion action */}
                          <div className="shrink-0 flex items-center self-center">
                            {confirmDeleteMsgId === m.id ? (
                              <div className="flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 border border-red-200 dark:bg-red-950/70 dark:border-red-800 text-[10px] shadow-sm animate-in fade-in">
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
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {isMe && (
                            <span className="flex items-center gap-0.5 ml-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                              · {m.read ? "Read" : "Sent"}
                              {m.read ? (
                                <CheckCheck className="h-3.5 w-3.5 text-brand-500 dark:text-brand-400" />
                              ) : (
                                <Check className="h-3.5 w-3.5 text-slate-400" />
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
                    className="absolute bottom-4 right-6 z-10 flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur hover:bg-slate-900 transition animate-in fade-in"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    <span>Jump to latest</span>
                  </button>
                )}
              </div>

              {/* Message Composer Bar */}
              <form
                onSubmit={handleSend}
                className="shrink-0 flex items-center gap-3 border-t border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your reply… (Press Enter to send)"
                  disabled={sending}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-brand-500 focus:bg-white dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || sending}
                  className="h-10 px-5 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-xl shadow-sm"
                >
                  <Send className="h-4 w-4 mr-1.5" />
                  Send Reply
                </Button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-12 text-center text-slate-400">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 mb-4 shadow-sm">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                No Customer Selected
              </h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm">
                Select a customer conversation from the list on the left to review support messages and reply instantly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
