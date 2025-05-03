import { Conversation, Message, SearchQuery } from "@/types";

// Maximum number of history items to store by default
const DEFAULT_MAX_HISTORY = 50;

/**
 * Save a search query to history
 */
export function saveToHistory(query: SearchQuery, answer: string): void {
  try {
    // Skip if no query
    if (!query.query.trim()) return;

    // Get existing history
    const history = getSearchHistory();
    
    // Create conversation object
    const conversation: Conversation = {
      id: query.conversationId || generateId(),
      title: query.query,
      messages: [
        { role: "user", content: query.query, timestamp: query.timestamp || new Date().toISOString() },
        { role: "assistant", content: answer, timestamp: new Date().toISOString() }
      ],
      createdAt: query.timestamp || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Check if conversation already exists
    const existingIndex = history.findIndex(item => item.id === conversation.id);
    
    if (existingIndex >= 0) {
      // Update existing conversation
      history[existingIndex] = conversation;
    } else {
      // Add new conversation
      history.unshift(conversation);
    }
    
    // Get user preferences
    const preferences = getUserPreferences();
    
    // Limit history size
    const limitedHistory = history.slice(0, preferences.maxHistoryItems);
    
    // Save to localStorage
    localStorage.setItem('vsearch_history', JSON.stringify(limitedHistory));
  } catch (error) {
    console.error('Error saving to history:', error);
  }
}

/**
 * Add a message to an existing conversation
 */
export function addMessageToConversation(conversationId: string, message: Message): void {
  try {
    // Get existing history
    const history = getSearchHistory();
    
    // Find conversation
    const conversationIndex = history.findIndex(item => item.id === conversationId);
    
    if (conversationIndex >= 0) {
      // Add message to conversation
      history[conversationIndex].messages.push(message);
      
      // Update timestamp
      history[conversationIndex].updatedAt = new Date().toISOString();
      
      // Save to localStorage
      localStorage.setItem('vsearch_history', JSON.stringify(history));
    }
  } catch (error) {
    console.error('Error adding message to conversation:', error);
  }
}

/**
 * Get search history
 */
export function getSearchHistory(): Conversation[] {
  try {
    const historyJson = localStorage.getItem('vsearch_history');
    return historyJson ? JSON.parse(historyJson) : [];
  } catch (error) {
    console.error('Error getting search history:', error);
    return [];
  }
}

/**
 * Clear search history
 */
export function clearSearchHistory(): void {
  try {
    localStorage.removeItem('vsearch_history');
  } catch (error) {
    console.error('Error clearing search history:', error);
  }
}

/**
 * Delete a specific conversation from history
 */
export function deleteConversation(conversationId: string): void {
  try {
    // Get existing history
    const history = getSearchHistory();
    
    // Filter out the conversation
    const updatedHistory = history.filter(item => item.id !== conversationId);
    
    // Save to localStorage
    localStorage.setItem('vsearch_history', JSON.stringify(updatedHistory));
  } catch (error) {
    console.error('Error deleting conversation:', error);
  }
}

/**
 * Get user preferences
 */
export function getUserPreferences() {
  try {
    const preferencesJson = localStorage.getItem('vsearch_preferences');
    const defaultPreferences = {
      theme: 'system',
      defaultSearchEngine: 'google',
      historyEnabled: true,
      maxHistoryItems: DEFAULT_MAX_HISTORY
    };
    
    return preferencesJson 
      ? { ...defaultPreferences, ...JSON.parse(preferencesJson) }
      : defaultPreferences;
  } catch (error) {
    console.error('Error getting user preferences:', error);
    return {
      theme: 'system',
      defaultSearchEngine: 'google',
      historyEnabled: true,
      maxHistoryItems: DEFAULT_MAX_HISTORY
    };
  }
}

/**
 * Save user preferences
 */
export function saveUserPreferences(preferences: Partial<ReturnType<typeof getUserPreferences>>): void {
  try {
    const currentPreferences = getUserPreferences();
    const updatedPreferences = { ...currentPreferences, ...preferences };
    localStorage.setItem('vsearch_preferences', JSON.stringify(updatedPreferences));
  } catch (error) {
    console.error('Error saving user preferences:', error);
  }
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
