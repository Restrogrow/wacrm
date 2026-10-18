// Shapes of the rows the inbox reads. Mirrors the web app's types (src/types/index.ts) and the
// database migrations; most columns are nullable so every field is optional on purpose.

export type ConversationStatus = 'open' | 'pending' | 'closed';
export type SenderType = 'customer' | 'agent' | 'bot';
export type ContentType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'template' | 'interactive';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface InboxContact {
  id: string;
  name: string | null;
  phone: string;
  email?: string | null;
  company?: string | null;
  avatar_url?: string | null;
  opted_out_at?: string | null;
  ad_source_type?: string | null;
  ad_headline?: string | null;
}

export interface InboxConversation {
  id: string;
  contact_id: string;
  status: ConversationStatus;
  assigned_agent_id: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
  contact: InboxContact | null;
}

export interface InboxMessage {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  sender_id: string | null;
  content_type: ContentType;
  content_text: string | null;
  media_url: string | null;
  template_name: string | null;
  status: MessageStatus;
  created_at: string;
  reply_to_message_id: string | null;
  interactive_reply_id: string | null;
  ai_transcript?: { transcript?: string; summary?: string } | null;
  /** Local-only: a send that has not been confirmed by the server yet. */
  pending?: boolean;
}

export interface InboxNote {
  id: string;
  conversation_id: string;
  author_id: string;
  body: string;
  mentions: string[] | null;
  created_at: string;
}

export interface InboxReaction {
  id: string;
  message_id: string;
  conversation_id: string;
  actor_type: 'customer' | 'agent';
  emoji: string;
}

export interface Member {
  user_id: string;
  full_name: string | null;
  email: string | null;
  account_role: 'owner' | 'admin' | 'agent' | 'viewer' | null;
}

export interface MessageTemplate {
  id: string;
  name: string;
  language: string | null;
  category: string;
  header_type: 'text' | 'image' | 'video' | 'document' | null;
  header_content: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: { type: string; text: string; url?: string }[] | null;
  status: string | null;
}

export interface SavedReply {
  id: string;
  shortcut: string | null;
  title: string;
  body: string;
}

export type InboxFilter = 'all' | 'mine' | 'unassigned' | 'unread' | 'open' | 'pending' | 'closed';
