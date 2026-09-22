import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  X,
  ArrowLeft,
  Crown,
  User,
  Clock,
  Phone,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { apiRequest } from '../../api/client.ts';
import { ConversationItem, ChatMessage, TeacherSearchItem, UserProfile } from '../../types/index.ts';

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

export const MessagingModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  initialTargetTeacher,
}) => {
  const isAdmin = currentUser.role === 'master_admin' || currentUser.role === 'administrator';

  // Conversations list state
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);

  // Active chat state
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [activeParticipant, setActiveParticipant] = useState<{
    id: string;
    username: string;
    fullName: string;
    role: string;
    phoneNumber?: string;
  } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TeacherSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Message compose state
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<any>(null);

  // Auto scroll to bottom of chat
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  // Load conversations list
  const fetchConversations = async () => {
    try {
      const res = await apiRequest<ConversationItem[]>('/api/messages/conversations');
      if (res.success && res.data) {
        setConversations(res.data);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  // Load thread messages
  const fetchThread = async (targetId: string, background = false) => {
    if (!background) setLoadingThread(true);
    setSendError(null);
    try {
      const res = await apiRequest<{
        conversationId: string;
        participant: {
          id: string;
          username: string;
          fullName: string;
          role: string;
          phoneNumber?: string;
        };
        messages: ChatMessage[];
      }>(`/api/messages/thread/${targetId}`);

      if (res.success && res.data) {
        setActiveParticipant(res.data.participant);
        setMessages(res.data.messages);
        // Refresh conversations to keep unread badges updated
        fetchConversations();
      }
    } catch (err) {
      console.error('Failed to load thread:', err);
    } finally {
      if (!background) setLoadingThread(false);
    }
  };

  // Select participant and open chat
  const handleSelectParticipant = (targetId: string, fallbackInfo?: Partial<TeacherSearchItem>) => {
    setSelectedParticipantId(targetId);
    if (fallbackInfo) {
      setActiveParticipant({
        id: targetId,
        username: fallbackInfo.username || 'User',
        fullName: fallbackInfo.fullName || '',
        role: targetId === 'admin' ? 'master_admin' : 'teacher',
        phoneNumber: fallbackInfo.phoneNumber || '',
      });
    }
    fetchThread(targetId);
    // Clear search query
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
  };

  // Handle single search bar for teacher by username or 10-digit phone number
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setSendError(null);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!val.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await apiRequest<TeacherSearchItem[]>(
          `/api/messages/search-teachers?q=${encodeURIComponent(val.trim())}`
        );
        setIsSearching(false);
        setHasSearched(true);
        if (res.success && res.data) {
          setSearchResults(res.data);
        } else {
          setSearchResults([]);
        }
      } catch {
        setIsSearching(false);
        setHasSearched(true);
        setSearchResults([]);
      }
    }, 300);
  };

  // Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedParticipantId || !inputMessage.trim() || sending) return;

    const trimmedMsg = inputMessage.trim();
    if (trimmedMsg.length > 300) {
      setSendError('Message cannot exceed 300 characters.');
      return;
    }

    setSending(true);
    setSendError(null);

    try {
      const res = await apiRequest<ChatMessage>('/api/messages/send', {
        method: 'POST',
        body: JSON.stringify({
          recipientId: selectedParticipantId,
          message: trimmedMsg,
        }),
      });

      setSending(false);
      if (res.success && res.data) {
        setInputMessage('');
        // Append sent message immediately
        setMessages((prev) => [...prev, res.data!]);
        scrollToBottom(true);
        fetchConversations();
      } else {
        setSendError(res.message || 'Failed to send message.');
      }
    } catch (err: any) {
      setSending(false);
      setSendError(err.message || 'Failed to send message.');
    }
  };

  // On open: fetch conversations or initialize target
  useEffect(() => {
    if (isOpen) {
      setLoadingConversations(true);
      fetchConversations().finally(() => setLoadingConversations(false));

      if (initialTargetTeacher) {
        handleSelectParticipant(initialTargetTeacher.id, initialTargetTeacher);
      } else if (!isAdmin) {
        // Teacher default: open admin thread or first conversation
        setSelectedParticipantId('admin');
        fetchThread('admin');
      }
    } else {
      setSelectedParticipantId(null);
      setActiveParticipant(null);
      setMessages([]);
      setSearchQuery('');
      setSearchResults([]);
      setHasSearched(false);
      setInputMessage('');
      setSendError(null);
    }
  }, [isOpen, initialTargetTeacher]);

  // Polling thread messages every 3.5 seconds while chat is active
  useEffect(() => {
    if (!isOpen || !selectedParticipantId) return;

    const pollInterval = setInterval(() => {
      fetchThread(selectedParticipantId, true);
    }, 3500);

    return () => clearInterval(pollInterval);
  }, [isOpen, selectedParticipantId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom(false);
    }
  }, [messages.length]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-hidden animate-fadeIn">
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl w-full max-w-4xl h-[92vh] max-h-[780px] border border-slate-200/80 dark:border-slate-700 flex flex-col overflow-hidden transition-colors">
        {/* Top Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-[#F4F6FA] dark:bg-[#0F172A] border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#2B547E]/10 dark:bg-blue-500/10 text-[#2B547E] dark:text-blue-400 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>Direct Messaging</span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
                  2-Way
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isAdmin ? 'Connect with teachers and respond to inquiries' : 'Communicate with Administrator and other teachers'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close messaging"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Sidebar + Chat Thread */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Conversations List & Search (Hidden on small mobile when a chat is open) */}
          <div
            className={`w-full md:w-80 lg:w-88 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] flex flex-col shrink-0 ${
              selectedParticipantId ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Search Bar for Teachers (Search by username or 10-digit phone number) */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Search by username or 10-digit phone..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 transition-colors"
                />
                {isSearching && (
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin absolute right-3 top-3" />
                )}
              </div>

              {/* Instant Search Results Dropdown */}
              {hasSearched && (
                <div className="bg-slate-50 dark:bg-[#0F172A] rounded-xl border border-slate-200 dark:border-slate-700 p-2 max-h-48 overflow-y-auto space-y-1 shadow-xs animate-fadeIn">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-0.5">
                    Search Results
                  </div>
                  {searchResults.length === 0 ? (
                    <div className="text-center py-3 text-xs text-slate-500 dark:text-slate-400">
                      No teacher found matching this username or phone number.
                    </div>
                  ) : (
                    searchResults.map((teacher) => (
                      <button
                        key={teacher.id}
                        type="button"
                        onClick={() => handleSelectParticipant(teacher.id, teacher)}
                        className="w-full text-left p-2 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors flex items-center justify-between cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {teacher.fullName || teacher.username}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                            <span>@{teacher.username}</span>
                            {teacher.phoneNumber && (
                              <span className="flex items-center gap-0.5 font-mono">
                                <Phone className="w-2.5 h-2.5" />
                                {teacher.phoneNumber}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 shrink-0">
                          Chat →
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Pinned Quick Action: Message Administrator (for teachers) */}
              {!isAdmin && (
                <button
                  type="button"
                  onClick={() => handleSelectParticipant('admin')}
                  className={`w-full px-3 py-2.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                    selectedParticipantId === 'admin'
                      ? 'bg-amber-500/10 dark:bg-amber-500/20 border-amber-400 dark:border-amber-500 shadow-2xs'
                      : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 hover:bg-amber-100/50 dark:hover:bg-amber-950/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs shrink-0">
                      <Crown className="w-4 h-4 fill-slate-950" />
                    </div>
                    <div>
                      {/* Admin Chat Name: BOLD and distinctive color */}
                      <p className="text-xs font-black text-amber-600 dark:text-amber-400 tracking-wide flex items-center gap-1">
                        <span>Master Administrator</span>
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Official Administration Support
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                    Open
                  </span>
                </button>
              )}
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Recent Conversations</span>
                <button
                  type="button"
                  onClick={fetchConversations}
                  title="Refresh conversations"
                  className="hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>

              {loadingConversations ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Loading chats...
                </div>
              ) : conversations.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 px-4">
                  No conversations yet. Search for a teacher above to start a conversation.
                </div>
              ) : (
                conversations.map((conv) => {
                  const isConvAdmin =
                    conv.participantId === 'admin' ||
                    conv.participantRole === 'administrator' ||
                    conv.participantRole === 'master_admin';
                  const isSelected = selectedParticipantId === conv.participantId;

                  return (
                    <button
                      key={conv.conversationId || conv.participantId}
                      type="button"
                      onClick={() => handleSelectParticipant(conv.participantId)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                        isSelected
                          ? isConvAdmin
                            ? 'bg-amber-500/10 dark:bg-amber-500/20 border-amber-400 dark:border-amber-500'
                            : 'bg-blue-50 dark:bg-blue-950/40 border-[#2B547E] dark:border-blue-500'
                          : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      {/* Avatar */}
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          isConvAdmin
                            ? 'bg-amber-500 text-slate-950 shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {isConvAdmin ? (
                          <Crown className="w-4 h-4 fill-slate-950" />
                        ) : (
                          <User className="w-4 h-4" />
                        )}
                      </div>

                      {/* Info & Last message */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          {/* Admin name MUST be bold and another colour than teachers */}
                          {isConvAdmin ? (
                            <span className="text-xs font-black text-amber-600 dark:text-amber-400 truncate">
                              👑 Master Administrator
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {conv.participantFullName || conv.participantUsername}
                            </span>
                          )}

                          <span className="text-[10px] text-slate-400 shrink-0">
                            {new Date(conv.lastMessageAt).toLocaleDateString([], {
                              month: 'numeric',
                              day: 'numeric',
                            })}
                          </span>
                        </div>

                        {!isConvAdmin && (
                          <div className="text-[10px] text-slate-400 truncate mb-0.5">
                            @{conv.participantUsername}
                          </div>
                        )}

                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-normal">
                          {conv.lastMessage}
                        </p>
                      </div>

                      {/* Unread badge */}
                      {conv.unreadCount > 0 && (
                        <span className="min-w-[18px] h-[18px] rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center px-1 shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Active Thread */}
          <div
            className={`flex-1 bg-slate-50/50 dark:bg-[#0F172A] flex flex-col overflow-hidden ${
              !selectedParticipantId ? 'hidden md:flex' : 'flex'
            }`}
          >
            {selectedParticipantId ? (
              <>
                {/* Active Thread Header */}
                <div className="px-4 py-3 bg-white dark:bg-[#1E293B] border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedParticipantId(null)}
                      className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                          activeParticipant?.role === 'master_admin' ||
                          activeParticipant?.role === 'administrator' ||
                          activeParticipant?.id === 'admin'
                            ? 'bg-amber-500 text-slate-950 shadow-xs'
                            : 'bg-blue-100 dark:bg-blue-950 text-[#2B547E] dark:text-blue-400'
                        }`}
                      >
                        {activeParticipant?.role === 'master_admin' ||
                        activeParticipant?.role === 'administrator' ||
                        activeParticipant?.id === 'admin' ? (
                          <Crown className="w-5 h-5 fill-slate-950" />
                        ) : (
                          <User className="w-5 h-5" />
                        )}
                      </div>

                      <div>
                        {/* Admin Chat Name: BOLD and in distinct amber/gold colour */}
                        {activeParticipant?.role === 'master_admin' ||
                        activeParticipant?.role === 'administrator' ||
                        activeParticipant?.id === 'admin' ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-black text-amber-600 dark:text-amber-400 tracking-wide">
                              👑 Master Administrator
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300">
                              Admin
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              {activeParticipant?.fullName || activeParticipant?.username}
                            </span>
                            <span className="text-xs font-medium text-slate-400">
                              @{activeParticipant?.username}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          {activeParticipant?.phoneNumber && (
                            <span className="flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {activeParticipant.phoneNumber}
                            </span>
                          )}
                          <span>• Direct 2-Way Channel</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => fetchThread(selectedParticipantId)}
                    title="Refresh thread"
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {/* Messages Scroll Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingThread ? (
                    <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                      <span>Loading conversation history...</span>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-16 text-center space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-[#2B547E] dark:text-blue-400 mx-auto flex items-center justify-center">
                        <MessageSquare className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        No messages yet
                      </p>
                      <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                        Type a message below to start the conversation.
                      </p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isFromAdmin =
                        msg.senderRole === 'administrator' ||
                        msg.senderRole === 'master_admin' ||
                        msg.senderId === 'admin';

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${
                            msg.isMine ? 'items-end' : 'items-start'
                          }`}
                        >
                          <div
                            className={`max-w-[85%] sm:max-w-md px-3.5 py-2.5 rounded-2xl text-xs break-words shadow-2xs ${
                              msg.isMine
                                ? 'bg-[#2B547E] text-white rounded-br-xs'
                                : isFromAdmin
                                ? 'bg-amber-50 dark:bg-[#1E2530] text-slate-900 dark:text-slate-100 border border-amber-300 dark:border-amber-700/80 rounded-bl-xs'
                                : 'bg-white dark:bg-[#1E293B] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-xs'
                            }`}
                          >
                            {/* Sender title if not mine */}
                            {!msg.isMine && (
                              <div className="mb-1 text-[10px] font-bold">
                                {isFromAdmin ? (
                                  <span className="font-black text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                    <Crown className="w-3 h-3" /> Master Administrator
                                  </span>
                                ) : (
                                  <span className="text-slate-600 dark:text-slate-300">
                                    {msg.senderFullName || `@${msg.senderUsername}`}
                                  </span>
                                )}
                              </div>
                            )}

                            <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>

                            <div
                              className={`mt-1.5 flex items-center justify-end gap-1 text-[9px] ${
                                msg.isMine
                                  ? 'text-blue-100/70'
                                  : 'text-slate-400'
                              }`}
                            >
                              <Clock className="w-2.5 h-2.5" />
                              <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              {msg.isMine && msg.read && (
                                <CheckCircle2 className="w-2.5 h-2.5 text-blue-200" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Send Error Notice (if limit reached or error) */}
                {sendError && (
                  <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950/50 border-t border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 shrink-0">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="font-medium">{sendError}</span>
                  </div>
                )}

                {/* Message Input Box with 300-char limit counter */}
                <form
                  onSubmit={handleSendMessage}
                  className="p-3 bg-white dark:bg-[#1E293B] border-t border-slate-200 dark:border-slate-700 shrink-0"
                >
                  <div className="flex items-end gap-2">
                    <div className="flex-1 relative">
                      <textarea
                        rows={2}
                        maxLength={300}
                        value={inputMessage}
                        onChange={(e) => {
                          setInputMessage(e.target.value);
                          setSendError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="Type a message (Enter to send, max 300 chars)..."
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 resize-none"
                      />

                      {/* Character limit counter: max 300 characters */}
                      <div className="absolute right-2.5 bottom-2 text-[10px] text-slate-400 pointer-events-none">
                        <span
                          className={
                            inputMessage.length >= 290
                              ? 'text-rose-500 font-bold'
                              : 'text-slate-400'
                          }
                        >
                          {inputMessage.length}
                        </span>
                        /300
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={!inputMessage.trim() || sending}
                      className="p-3 rounded-xl bg-[#2B547E] hover:bg-[#355C7D] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs cursor-pointer shrink-0"
                      title="Send message"
                    >
                      {sending ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-[#2B547E] dark:text-blue-400 flex items-center justify-center">
                  <MessageSquare className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Select a Conversation
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                    Choose an existing conversation from the list or search for a teacher by username or 10-digit phone number.
                  </p>
                </div>
                {!isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleSelectParticipant('admin')}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 transition-colors shadow-xs cursor-pointer"
                  >
                    👑 Chat with Master Administrator
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
