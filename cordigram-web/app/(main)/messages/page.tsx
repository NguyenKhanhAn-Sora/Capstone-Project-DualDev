"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./messages.module.css";
import { useRequireAuth } from "@/hooks/use-require-auth";
import * as serversApi from "@/lib/servers-api";

interface BackendServer extends serversApi.Server {
  textChannels?: serversApi.Channel[];
  voiceChannels?: serversApi.Channel[];
}

interface UIMessage {
  id: string;
  text: string;
  senderId: string;
  senderEmail: string;
  timestamp: Date;
  isFromCurrentUser: boolean;
}

export default function MessagesPage() {
  const canRender = useRequireAuth();
  const [servers, setServers] = useState<BackendServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [textChannels, setTextChannels] = useState<serversApi.Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateServerModal, setShowCreateServerModal] = useState(false);
  const [serverName, setServerName] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [friends, setFriends] = useState<serversApi.Friend[]>([]);

  // Load servers on mount
  useEffect(() => {
    const token = localStorage.getItem("accessToken") || localStorage.getItem("token");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setCurrentUserId(payload.userId || payload.sub);
        setError(null); // Clear error when token found
        loadServers();
        loadFriends();
      } catch (e) {
        console.error("Failed to parse token", e);
        setError("Invalid token");
      }
    } else {
      setError("Please login first");
      setLoading(false);
    }
  }, []);

  // Load channels when server changes
  useEffect(() => {
    if (selectedServer) {
      loadChannels(selectedServer);
    }
  }, [selectedServer]);

  // Load messages when channel changes
  useEffect(() => {
    if (selectedChannel) {
      loadMessages(selectedChannel);
    }
  }, [selectedChannel]);

  // Auto scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadServers = async () => {
    try {
      setLoading(true);
      const serversList = await serversApi.getMyServers();
      
      // Organize channels by type for each server
      const serversWithChannels: BackendServer[] = await Promise.all(
        serversList.map(async (server) => {
          const channels = server.channels as serversApi.Channel[];
          const textChannels = channels.filter((c) => c.type === "text");
          const voiceChannels = channels.filter((c) => c.type === "voice");
          return {
            ...server,
            textChannels,
            voiceChannels,
          };
        })
      );

      setServers(serversWithChannels);
      // Don't auto-select server on load - let user choose
      setSelectedServer(null);
      setSelectedChannel(null);
      setError(null);
    } catch (err) {
      setError("Failed to load servers");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadFriends = async () => {
    try {
      const friendsList = await serversApi.getMyFollowers();
      setFriends(friendsList);
    } catch (err) {
      console.error("Failed to load friends", err);
      // Set empty array if friends API is not available
      setFriends([]);
    }
  };

  const loadChannels = async (serverId: string) => {
    try {
      const channels = await serversApi.getChannels(serverId, "text");
      setTextChannels(channels);
      
      // Auto-select first text channel
      if (channels.length > 0) {
        setSelectedChannel(channels[0]._id);
      }
    } catch (err) {
      console.error("Failed to load channels", err);
      setError("Failed to load channels");
    }
  };

  const loadMessages = async (channelId: string) => {
    try {
      const backendMessages = await serversApi.getMessages(channelId, 50, 0);
      
      const uiMessages: UIMessage[] = backendMessages.map((msg) => ({
        id: msg._id,
        text: msg.content,
        senderId: typeof msg.senderId === "string" ? msg.senderId : msg.senderId._id,
        senderEmail: typeof msg.senderId === "string" ? "" : msg.senderId.email,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser: 
          (typeof msg.senderId === "string" ? msg.senderId : msg.senderId._id) === currentUserId,
      }));

      setMessages(uiMessages);
      setError(null);
    } catch (err) {
      console.error("Failed to load messages", err);
      setError("Failed to load messages");
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedChannel) return;

    try {
      const newMessage = await serversApi.createMessage(selectedChannel, messageText);
      
      const uiMessage: UIMessage = {
        id: newMessage._id,
        text: newMessage.content,
        senderId: typeof newMessage.senderId === "string" ? newMessage.senderId : newMessage.senderId._id,
        senderEmail: typeof newMessage.senderId === "string" ? "" : newMessage.senderId.email,
        timestamp: new Date(newMessage.createdAt),
        isFromCurrentUser: true,
      };

      setMessages([...messages, uiMessage]);
      setMessageText("");
    } catch (err) {
      console.error("Failed to send message", err);
      setError("Failed to send message");
    }
  };

  const handleCreateServer = async () => {
    if (!serverName.trim()) return;

    try {
      const newServer = await serversApi.createServer(serverName);
      
      const serverWithChannels: BackendServer = {
        ...newServer,
        textChannels: (newServer.channels as serversApi.Channel[]).filter((c) => c.type === "text"),
        voiceChannels: (newServer.channels as serversApi.Channel[]).filter((c) => c.type === "voice"),
      };

      setServers([...servers, serverWithChannels]);
      setSelectedServer(serverWithChannels._id);
      setShowCreateServerModal(false);
      setServerName("");
    } catch (err) {
      console.error("Failed to create server", err);
      setError("Failed to create server");
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  if (!canRender) {
    return null;
  }

  const currentServer = servers.find((s) => s._id === selectedServer);

  return (
    <div className={styles.container}>
      {/* Left Sidebar - Logo & Create Group */}
      <div className={styles.leftSidebar}>
        <img 
          src="/logo.png" 
          alt="Cordigram" 
          className={styles.logoImage}
          onClick={() => {
            setSelectedServer(null);
            setSelectedChannel(null);
          }}
          style={{ cursor: "pointer" }}
        />
        
        <button 
          className={styles.createBtn} 
          title="Create Server"
          onClick={() => setShowCreateServerModal(true)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14"></path>
          </svg>
        </button>

        {/* Servers List */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
          {servers.map((server) => (
            <button
              key={server._id}
              className={styles.navBtn}
              onClick={() => setSelectedServer(server._id)}
              title={server.name}
              style={{
                opacity: selectedServer === server._id ? 1 : 0.6,
                background: selectedServer === server._id ? "var(--color-primary)" : "transparent",
              }}
            >
              {server.name.charAt(0).toUpperCase()}
            </button>
          ))}
        </div>

        <div className={styles.sidebarFooter}>
          <button className={styles.settingsBtn} title="Settings">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m3.08 3.08l4.24 4.24M1 12h6m6 0h6m-16.78 7.78l4.24-4.24m3.08-3.08l4.24-4.24"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Middle - Channels List */}
        <div className={styles.conversationsList}>
          <div className={styles.conversationsContainer}>
            {!selectedServer ? (
              // Main Messages Page - No Server Selected
              <>
                {/* Search Bar */}
                <div className={styles.searchInputWrapper}>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Find or start a conversation"
                  />
                </div>

                {/* Menu Items */}
                <div className={styles.menuItems}>
                  <button className={styles.menuItem}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    <span>Friends</span>
                  </button>
                  <button className={styles.menuItem}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14"></path>
                    </svg>
                    <span>Add Friend</span>
                  </button>
                  <button className={styles.menuItem}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 11H7.82a2 2 0 0 0-1.82 1.18l-2 5A2 2 0 0 0 3 19h4m0 0a6 6 0 0 0 12 0m4-7h-1.17a2 2 0 0 1-1.82-1.18l-2-5A2 2 0 0 0 13 5h-4"></path>
                    </svg>
                    <span>Mission</span>
                  </button>
                  <button className={styles.menuItem}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="9" cy="21" r="1"></circle>
                      <circle cx="20" cy="21" r="1"></circle>
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    <span>Store</span>
                  </button>
                </div>

                {/* Direct Messages Section */}
                <div className={styles.directMessagesSection}>
                  <h3 className={styles.directMessagesTitle}>DIRECT MESSAGES</h3>
                  
                  {/* Friends List */}
                  <div className={styles.friendsList}>
                    {friends && friends.length > 0 ? (
                      friends.map((friend) => {
                        const initial = friend.displayName?.charAt(0)?.toUpperCase() || friend.username?.charAt(0)?.toUpperCase() || "U";
                        const hue = Math.floor(Math.random() * 360);
                        return (
                          <div key={friend._id} className={styles.friendItem}>
                            <div className={styles.friendAvatar} style={{ backgroundImage: friend.avatarUrl ? `url(${friend.avatarUrl})` : `linear-gradient(${hue}deg, hsl(${hue}, 70%, 60%), hsl(${hue + 60}, 70%, 60%))`, backgroundSize: "cover", backgroundPosition: "center" }}>
                              {!friend.avatarUrl && <span>{initial}</span>}
                            </div>
                            <div className={styles.friendInfo}>
                              <p className={styles.friendName}>{friend.displayName || friend.username}</p>
                              <p className={styles.friendStatus}>{friend.email}</p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "14px" }}>
                        Hãy kiếm thêm bạn
                      </div>
                    )}
                  </div>
                </div>

                {/* Voice Controls Footer */}
                <div className={styles.voiceControls}>
                  <button className={styles.voiceButton} title="Toggle Microphone">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                      <line x1="12" y1="19" x2="12" y2="23"></line>
                      <line x1="8" y1="23" x2="16" y2="23"></line>
                    </svg>
                  </button>
                  <button className={styles.voiceButton} title="Toggle Speaker">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path d="M15.54 8.46a7 7 0 0 1 0 9.9"></path>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              // Server Selected - Show Text Channels
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Text Channels</h3>
                {textChannels.length > 0 ? (
                  textChannels.map((channel) => (
                    <div
                      key={channel._id}
                      className={`${styles.conversationItem} ${
                        selectedChannel === channel._id ? styles.active : ""
                      }`}
                      onClick={() => setSelectedChannel(channel._id)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                        <span style={{ fontSize: "18px" }}>#{channel.name}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "12px 16px", fontSize: "12px", color: "var(--color-text-muted)" }}>
                    No text channels
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right - Chat Area & Active Now */}
        <div className={styles.rightContent}>
          {/* Chat Area */}
          <div className={styles.chatArea}>
            {selectedChannel && currentServer ? (
              <>
                {/* Chat Header */}
                <div className={styles.chatHeader}>
                  <div className={styles.chatHeaderLeft}>
                    <h2 className={styles.chatHeaderTitle}>
                      #{textChannels.find((c) => c._id === selectedChannel)?.name || "channel"}
                    </h2>
                  </div>
                  <div className={styles.chatHeaderActions}>
                    <button className={styles.chatIconBtn} title="Call">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                      </svg>
                    </button>
                    <button className={styles.chatIconBtn} title="Video call">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="23 7 16 12 23 17 23 7"></polygon>
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                      </svg>
                    </button>
                    <button className={styles.chatIconBtn} title="More options">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2"></circle>
                        <circle cx="12" cy="12" r="2"></circle>
                        <circle cx="12" cy="19" r="2"></circle>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Messages Container */}
                <div className={styles.messagesContainer}>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`${styles.messageGroup} ${
                        message.isFromCurrentUser ? styles.sent : styles.received
                      }`}
                    >
                      <div>
                        <div
                          className={`${styles.messageBubble} ${
                            message.isFromCurrentUser ? styles.sent : styles.received
                          }`}
                        >
                          {message.text}
                        </div>
                        <p className={styles.messageTime}>
                          {formatTime(message.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className={styles.inputArea}>
                  <div className={styles.inputWrapper}>
                    <button className={styles.attachButton} title="Attach file">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 0 19.8 4.3M22 12.5a10 10 0 0 0-19.8-4.2"></path>
                      </svg>
                    </button>
                    <input
                      type="text"
                      className={styles.messageInput}
                      placeholder="Message..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />
                  </div>
                  <button
                    className={styles.sendButton}
                    onClick={handleSendMessage}
                    disabled={!messageText.trim()}
                    title="Send message"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.8429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13399899,1.16346272 C3.34915502,0.9 2.40734225,0.9 1.77946707,1.4071521 C0.994623095,2.0605983 0.837654326,3.0031827 1.15159189,3.7886696 L3.03521743,10.2296625 C3.03521743,10.3867599 3.19218622,10.5438573 3.50612381,10.5438573 L16.6915026,11.3293442 C16.6915026,11.3293442 17.1624089,11.3293442 17.1624089,10.8580521 L17.1624089,12.4744748 C17.1624089,12.4744748 17.1624089,12.9457669 16.6915026,12.4744748 Z"></path>
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>💬</div>
                <p className={styles.emptyText}>
                  {loading ? "Loading..." : "Select a server and channel to start messaging"}
                </p>
              </div>
            )}
          </div>

          {/* Active Now Sidebar - For now just placeholder */}
          <div className={styles.activeNowSidebar}>
            <div className={styles.activeNowHeader}>
              <h3 className={styles.activeNowTitle}>Active Now</h3>
            </div>
            <div className={styles.activeNowContainer}>
              <div style={{ padding: "20px", textAlign: "center" }}>
                <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "14px" }}>
                  It's quiet for now...
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Server Modal */}
      {showCreateServerModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            padding: "24px",
            minWidth: "400px",
          }}>
            <h2 style={{ marginTop: 0 }}>Create New Server</h2>
            <input
              type="text"
              placeholder="Server name"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--color-border)",
                borderRadius: "4px",
                marginBottom: "16px",
                boxSizing: "border-box",
                background: "var(--color-bg)",
                color: "var(--color-text)",
              }}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleCreateServer();
                }
              }}
            />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowCreateServerModal(false);
                  setServerName("");
                }}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  border: "1px solid var(--color-border)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  color: "var(--color-text)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateServer}
                disabled={!serverName.trim()}
                style={{
                  padding: "8px 16px",
                  background: serverName.trim() ? "var(--color-primary)" : "var(--color-border)",
                  border: "none",
                  borderRadius: "4px",
                  cursor: serverName.trim() ? "pointer" : "not-allowed",
                  color: "white",
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          position: "fixed",
          bottom: "20px",
          left: "20px",
          background: "#ff6b6b",
          color: "white",
          padding: "12px 16px",
          borderRadius: "4px",
          zIndex: 1001,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
