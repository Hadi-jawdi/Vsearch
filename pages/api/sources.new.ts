/**
 * API handler for fetching sources from search engines
 */
import { Source } from "@/types";
import type { NextApiRequest, NextApiResponse } from "next";
import { getSearchEngineLinks, SearchEngine } from "@/utils/search-engines";
import { scrapeSourcesWithTimeout } from "@/utils/scraper";

// Define response type
type SourcesResponse = {
  sources: Source[];
  metadata?: {
    engine: string;
    totalResults?: number;
    searchTime?: number;
    filteredSources?: number;
    fallback?: boolean;
  };
  error?: string;
};

// Number of sources to return
const DEFAULT_SOURCE_COUNT = 4;

/**
 * Main handler for the sources API
 */
const searchHandler = async (req: NextApiRequest, res: NextApiResponse<SourcesResponse>) => {
  // Start timing the request
  const startTime = Date.now();
  
  // Check if the request method is POST
  if (req.method !== "POST") {
    res.status(405).json({ sources: [], metadata: { engine: "none" } });
    return;
  }

  try {
    // Get the query and search engine from the request body
    const { query, searchEngine = "google", sourceCount = DEFAULT_SOURCE_COUNT } = req.body;

    // Validate the query
    if (!query || typeof query !== "string") {
      res.status(400).json({ 
        sources: [], 
        metadata: { 
          engine: "none",
          error: "Invalid query" 
        } 
      });
      return;
    }

    // Get links from selected search engine(s)
    const { links: allLinks, usedEngines } = await getSearchEngineLinks(
      query, 
      searchEngine as SearchEngine
    );

    // If no links were found, return an empty response
    if (allLinks.length === 0) {
      res.status(200).json({
        sources: [],
        metadata: {
          engine: usedEngines.join('+') || "none",
          totalResults: 0,
          searchTime: Date.now() - startTime,
          filteredSources: 0
        }
      });
      return;
    }

    // Take a subset of links to process
    const finalLinks = allLinks.slice(0, Math.min(allLinks.length, sourceCount * 2));

    // Scrape text from links with timeout and concurrency control
    const sources = await scrapeSourcesWithTimeout(finalLinks);

    // Process and clean up sources
    const processedSources = sources.slice(0, sourceCount);

    // If we still don't have any valid sources after processing, create a fallback source
    if (processedSources.length === 0) {
      // Create a fallback source with search information
      const fallbackSource: Source = {
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        title: `Search results for: ${query}`,
        text: `We couldn't extract detailed information from the search results for "${query}". 
        This could be due to various reasons such as website restrictions or content formatting.
        
        You can try:
        1. Rephrasing your query to be more specific
        2. Using a different search engine (try Bing or DuckDuckGo)
        3. Searching for a related but different topic
        
        The search was performed using ${usedEngines.join('+')} and found ${allLinks.length} potential sources.`
      };
      
      // Return the fallback source
      res.status(200).json({
        sources: [fallbackSource],
        metadata: {
          engine: usedEngines.join('+'),
          totalResults: allLinks.length,
          searchTime: Date.now() - startTime,
          filteredSources: 1,
          fallback: true
        }
      });
    } else {
      // Return the processed sources
      res.status(200).json({
        sources: processedSources,
        metadata: {
          engine: usedEngines.join('+'),
          totalResults: allLinks.length,
          searchTime: Date.now() - startTime,
          filteredSources: processedSources.length
        }
      });
    }
  } catch (error) {
    console.error("Error in sources API:", error);
    res.status(500).json({
      sources: [],
      metadata: {
        engine: "error",
        error: "Internal server error"
      }
    });
  }
};

export default searchHandler;
