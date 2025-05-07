import { SearchEngine } from "@/pages/api/sources";
import { SearchMetadata, SearchQuery, Source, Theme } from "@/types";
import SearchSkeleton, { SearchStage } from "./SearchSkeleton";
import { generateId, getUserPreferences, saveUserPreferences } from "@/utils/history";
import { applyTheme, setTheme } from "@/utils/theme";
import {
  IconArrowRight,
  IconBolt,
  IconMicrophone,
  IconMoon,
  IconSearch,
  IconSettings,
  IconSun
} from "@tabler/icons-react";
import endent from "endent";
import { FC, KeyboardEvent, useEffect, useRef, useState } from "react";

interface SearchProps {
  onSearch: (searchResult: SearchQuery) => void;
  onAnswerUpdate: (answer: string) => void;
  onDone: (done: boolean) => void;
}

export const Search: FC<SearchProps> = ({ onSearch, onAnswerUpdate, onDone }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // State for search
  const [query, setQuery] = useState<string>("");
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentSearchStage, setCurrentSearchStage] = useState<SearchStage>('idle');
  const [searchEngine, setSearchEngine] = useState<SearchEngine>("all");
  const [conversationId, setConversationId] = useState<string>("");

  // State for UI
  const [theme, setThemeState] = useState<Theme>("system");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [searchMetadata, setSearchMetadata] = useState<SearchMetadata | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);

  // Fetch AI-generated queries from /api/generate-queries
  const fetchGeneratedQueries = async (originalQuery: string): Promise<string[]> => {
    try {
      console.log(`Fetching generated queries for: ${originalQuery}`);
      const response = await fetch("/api/generate-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: originalQuery })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Failed to generate queries:", response.status, errorData.error);
        // Return an empty array or throw an error, depending on desired handling
        // For now, let's return a few generic fallbacks or an empty array
        // to allow the main search to proceed if sub-query generation fails.
        // throw new Error(`Failed to generate queries: ${errorData.error || response.statusText}`);
        console.warn(`Failed to generate sub-queries for "${originalQuery}". Proceeding with original query only or generic fallbacks.`);
        // Optionally return a few very generic queries if the API fails
        // return [`what is ${originalQuery}`, `define ${originalQuery}`].slice(0,2);
        return []; // Or return empty to just use the main query
      }

      const data = await response.json();
      if (data.queries && Array.isArray(data.queries)) {
        return data.queries as string[];
      }
      console.warn('Generated queries response was not in the expected format:', data);
      return []; // Return empty if format is not as expected
    } catch (error) {
      console.error("Error in fetchGeneratedQueries:", error);
      // Return empty or throw, similar to the !response.ok case
      return [];
    }
  };

  // Handle search submission
  const handleSearch = async () => {
    if (!query) {
      setErrorMessage("Please enter a query");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    setLoading(true);
    setCurrentSearchStage('generating_queries');
    setErrorMessage("");

    if (!conversationId) {
      setConversationId(generateId());
    }

    try {
      // Step 1: Generate related queries from the main query
      setCurrentSearchStage('generating_queries');
      const generatedQueries = await fetchGeneratedQueries(query);
      console.log("Generated sub-queries:", generatedQueries);

      setCurrentSearchStage('fetching_sources');
      let allSources: Source[] = [];
      // We'll use the metadata from the first successful fetch for now, or aggregate if needed
      let primaryMetadata: SearchMetadata | null = null; 

      // Step 2: Fetch sources for the original query and each generated query
      // Ensure 'query' (original user query) is always included
      const queriesToFetch = [query, ...generatedQueries.filter(q => q !== query)]; // Add original query and unique generated ones

      for (const q of queriesToFetch) {
        try {
          console.log(`Fetching sources for query: "${q}"`);
          const { sources, metadata } = await fetchSources(q); // Pass the specific query 'q'
          if (sources.length > 0) {
            allSources = allSources.concat(sources);
            if (!primaryMetadata && metadata) { // Store the first valid metadata
              primaryMetadata = metadata;
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch sources for sub-query "${q}":`, err);
          // Optionally, inform the user or just proceed with other sources
        }
      }

      // Deduplicate sources based on URL to avoid redundant information
      const uniqueSources = Array.from(new Map(allSources.map(s => [s.url, s])).values());
      console.log("Total unique sources found:", uniqueSources.length);

      if (uniqueSources.length === 0) {
        setLoading(false);
        setErrorMessage("No relevant sources found even after query expansion. Please try a different query or search engine.");
        return;
      }

      setSearchMetadata(primaryMetadata || null); // Use the stored primary metadata

      // Determine fallback status based on the primary metadata
      const isFallback = primaryMetadata?.fallback === true;
      if (isFallback) {
        console.log("Using fallback source due to extraction issues (based on primary query).");
      }

      setCurrentSearchStage('synthesizing_answer');
      await processAnswer(uniqueSources, isFallback); // Pass all unique sources
    } catch (error: any) { 
      setCurrentSearchStage('idle');
      console.error("Search error in handleSearch:", error);
      setLoading(false);
      const errorMessageText = error.message || "An unexpected error occurred during search.";
      setErrorMessage(`Error during enhanced search: ${errorMessageText}. Please try again.`);
    }
  };

  // Fetch sources from API
  const fetchSources = async (currentQuery: string = query) => { // MODIFIED: Added currentQuery parameter
    const response = await fetch("/api/sources", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: currentQuery, // MODIFIED: Use currentQuery
        searchEngine,
        sourceCount: 3 // MODIFIED: Request fewer sources per sub-query
      })
    });

    if (!response.ok) {
      setLoading(false);
      throw new Error(response.statusText);
    }

    const data = await response.json();
    return {
      sources: data.sources as Source[],
      metadata: data.metadata as SearchMetadata
    };
  };

  // Process the answer from sources
  const processAnswer = async (sources: Source[], isFallback: boolean = false) => {
    try {
      // Create a detailed prompt with source information
      let prompt;

      if (isFallback) {
        // Special prompt for fallback mode
        prompt = endent`Provide a helpful answer to the query "${query}" based on the following limited information.
        Be honest about limitations in the available data. If you can't answer the query well, suggest ways the user could refine their search.
        Do not make up information that isn't in the sources.

        ${sources.map((source, idx) =>
          `Source [${idx + 1}]: ${source.title || 'Untitled'}
          URL: ${source.url}
          Content: ${source.text}`
        ).join("\n\n")}
        `;
      } else {
        // Standard prompt for normal mode
        prompt = endent`Provide a comprehensive answer to the query "${query}" based on the following sources.
        Be accurate, helpful, and cite sources as [1], [2], etc. after each sentence that uses information from that source.

        ${sources.map((source, idx) =>
          `Source [${idx + 1}]: ${source.title || 'Untitled'}
          URL: ${source.url}
          Content: ${source.text}`
        ).join("\n\n")}
        `;
      }

      // Send the request to the API
      const response = await fetch("/api/answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt,
          previousMessages: [] // For follow-up questions, we would include previous messages here
        })
      });

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      // Parse the JSON response
      const data = await response.json();

      // Update the search query with timestamp and metadata
      setLoading(false);
      const timestamp = new Date().toISOString();

      onSearch({
        query,
        sourceLinks: sources.map((source) => source.url),
        conversationId,
        timestamp,
        searchEngine
      });

      // Update the answer with the response content
      if (data.content) {
        onAnswerUpdate(data.content);
        onDone(true);
        setCurrentSearchStage('idle');
      } else if (data.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error("Error processing request:", err);
      setLoading(false);
      setErrorMessage(err.message || "Error processing your request. Please try again.");
      onAnswerUpdate("Error processing your request. Please try again.");
      setCurrentSearchStage('idle');
    }
  };

  // Handle keyboard input
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  // Save settings
  const handleSaveSettings = () => {
    // Save preferences
    saveUserPreferences({
      theme,
      defaultSearchEngine: "all" // Always save "all" as the default
    });

    // Apply theme
    setTheme(theme);

    // Close settings
    setShowSettings(false);
    inputRef.current?.focus();
  };

  // Reset settings to defaults
  const handleResetSettings = () => {
    setSearchEngine("all");
    setThemeState("system");
  };

  // Toggle theme between light and dark
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setThemeState(newTheme);
    setTheme(newTheme);
  };

  // Handle voice input
  const handleVoiceInput = () => {
    // Check if browser supports speech recognition
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setErrorMessage("Voice input is not supported in your browser");
      return;
    }

    try {
      // @ts-ignore - TypeScript doesn't know about webkitSpeechRecognition
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      setIsListening(true);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setQuery(transcript);
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
        setErrorMessage("Error recognizing speech");
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (error) {
      console.error("Speech recognition error:", error);
      setIsListening(false);
      setErrorMessage("Error starting voice input");
    }
  };

  // Initialize component
  useEffect(() => {
    // Get user preferences
    const preferences = getUserPreferences();

    // Set search engine to "all" by default
    setSearchEngine("all");

    // Set theme from preferences
    setThemeState(preferences.theme);

    // Apply theme
    applyTheme(preferences.theme);

    // Focus input
    inputRef.current?.focus();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#18181C] text-gray-900 dark:text-[#D4D4D8] transition-colors duration-300">
      {loading ? (
        <SearchSkeleton currentStage={currentSearchStage} />
      ) : (
        <div className="mx-auto flex h-full w-full max-w-[800px] flex-col items-center space-y-6 px-4 pt-20 sm:pt-40">
          {/* Logo and title */}
          <div className="flex items-center">
            <IconBolt size={36} className="text-blue-500" />
            <div className="ml-2 text-center text-4xl font-bold">Vsearch</div>
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="w-full max-w-[600px] rounded-md bg-red-100 dark:bg-red-900/30 p-3 text-red-800 dark:text-red-200">
              <p>{errorMessage}</p>
            </div>
          )}

          {/* Search input */}
          <div className="relative w-full">
            <IconSearch className="absolute top-3 w-10 left-1 h-6 rounded-full opacity-50 sm:left-3 sm:top-4 sm:h-8 text-gray-500 dark:text-gray-400" />

            <input
              ref={inputRef}
              className="h-12 w-full rounded-full border border-gray-300 dark:border-zinc-600 bg-white dark:bg-[#2A2A31] pr-24 pl-11 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 sm:h-16 sm:py-2 sm:pr-32 sm:pl-16 sm:text-lg shadow-sm"
              type="text"
              placeholder="Ask anything..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isListening}
            />

            {/* Voice input button */}
            <button
              onClick={handleVoiceInput}
              disabled={isListening}
              className={`absolute right-16 top-2 h-8 w-8 rounded-full p-1.5 sm:right-20 sm:top-4 sm:h-8 sm:w-8
                ${isListening
                  ? 'bg-red-500 animate-pulse'
                  : 'bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600'}`}
              title="Voice search"
            >
              <IconMicrophone className="text-gray-700 dark:text-gray-200" />
            </button>

            {/* Search button */}
            <button
              onClick={handleSearch}
              className="absolute right-2 top-2 h-8 w-8 rounded-full bg-blue-500 p-1.5 hover:cursor-pointer hover:bg-blue-600 sm:right-3 sm:top-4 sm:h-8 sm:w-8"
              title="Search"
            >
              <IconArrowRight className="text-white" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex space-x-4">
            <button
              className="flex cursor-pointer items-center space-x-2 rounded-full border border-gray-300 dark:border-zinc-600 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
            >
              <IconSettings size={16} />
              <span>{showSettings ? "Hide" : "Show"} Settings</span>
            </button>

            <button
              className="flex cursor-pointer items-center space-x-2 rounded-full border border-gray-300 dark:border-zinc-600 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
              onClick={toggleTheme}
              title="Toggle theme"
            >
              {theme === 'dark' ? (
                <>
                  <IconSun size={16} />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <IconMoon size={16} />
                  <span>Dark Mode</span>
                </>
              )}
            </button>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="w-full max-w-[600px] space-y-4 rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-[#2A2A31] p-6 shadow-lg">
              <h3 className="text-lg font-medium border-b border-gray-200 dark:border-zinc-700 pb-2">Settings</h3>

              <div className="space-y-4 pt-2">

                <div>
                  <label className="block text-sm font-medium mb-1">Theme</label>
                  <div className="flex space-x-4">
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        className="form-radio text-blue-500"
                        checked={theme === 'light'}
                        onChange={() => setThemeState('light')}
                      />
                      <span className="ml-2">Light</span>
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        className="form-radio text-blue-500"
                        checked={theme === 'dark'}
                        onChange={() => setThemeState('dark')}
                      />
                      <span className="ml-2">Dark</span>
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        className="form-radio text-blue-500"
                        checked={theme === 'system'}
                        onChange={() => setThemeState('system')}
                      />
                      <span className="ml-2">System</span>
                    </label>
                  </div>
                </div>

                <div className="flex space-x-2 pt-4">
                  <button
                    className="flex cursor-pointer items-center space-x-2 rounded-md border border-gray-300 dark:border-zinc-600 bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600"
                    onClick={handleSaveSettings}
                  >
                    Save Settings
                  </button>

                  <button
                    className="flex cursor-pointer items-center space-x-2 rounded-md border border-gray-300 dark:border-zinc-600 bg-gray-200 dark:bg-zinc-700 px-4 py-2 text-sm hover:bg-gray-300 dark:hover:bg-zinc-600"
                    onClick={handleResetSettings}
                  >
                    Reset to Defaults
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Search tips */}
          <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
            <p>Try searching for: "How does quantum computing work?" or "Latest developments in AI"</p>
            <p className="mt-2">Powered by Cerebras llama-4-scout-17b-16e-instruct</p>
          </div>
        </div>
      )}
    </div>
  );
};
