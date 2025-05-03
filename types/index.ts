export enum CerebrasModel {
  LLAMA_SCOUT = "llama-4-scout-17b-16e-instruct"
}

export type Source = {
  url: string;
  text: string;
  title?: string;
  favicon?: string;
  timestamp?: string;
};

export type SearchQuery = {
  query: string;
  sourceLinks: string[];
  conversationId?: string;
  timestamp?: string;
  searchEngine?: string;
};

export type Conversation = {
  id: string;
  messages: Message[];
  title?: string;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
};

export type SearchMetadata = {
  engine: string;
  totalResults?: number;
  searchTime?: number;
  filteredSources?: number;
  fallback?: boolean;
};

export type ResponseMetadata = {
  model: string;
  timestamp: string;
  promptTokens: number;
  completionTokens: number;
};

export type Theme = "light" | "dark" | "system";

export type UserPreferences = {
  theme: Theme;
  defaultSearchEngine: string;
  historyEnabled: boolean;
  maxHistoryItems: number;
};
