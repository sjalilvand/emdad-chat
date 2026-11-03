export interface SourceItem {
  title: string;
  url: string;
  snippet: string;
  key: string;
}

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking: string;
  sources: SourceItem[];
  model?: string | null;
  hasImage?: boolean;
  imageUrl?: string;
  createdAt?: string;
  streaming?: boolean;
  thinkingDuration?: number;
  error?: string;
}

export interface ConversationItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
}

export interface ModelItem {
  name: string;
  size: number;
}
