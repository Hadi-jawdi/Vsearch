/**
 * Search engines index file
 */
import { getGoogleLinks } from "./google";
import { getBingLinks } from "./bing";
import { getDuckDuckGoLinks } from "./duckduckgo";
import { filterAndCleanLinks } from "../http";

export type SearchEngine = "google" | "bing" | "duckduckgo" | "all";

/**
 * Get links from selected search engine(s)
 */
export async function getSearchEngineLinks(query: string, searchEngine: SearchEngine): Promise<{
  links: string[],
  usedEngines: string[]
}> {
  let allLinks: string[] = [];
  let usedEngines: string[] = [];
  
  try {
    if (searchEngine === "all") {
      // Fetch from all search engines in parallel
      console.log(`Fetching from all search engines for query: "${query}"`);
      
      const [googleLinks, bingLinks, duckduckgoLinks] = await Promise.all([
        getGoogleLinks(query).catch((err) => {
          console.error("Error fetching Google links:", err);
          return [] as string[];
        }),
        getBingLinks(query).catch((err) => {
          console.error("Error fetching Bing links:", err);
          return [] as string[];
        }),
        getDuckDuckGoLinks(query).catch((err) => {
          console.error("Error fetching DuckDuckGo links:", err);
          return [] as string[];
        })
      ]);

      console.log(`Found links - Google: ${googleLinks.length}, Bing: ${bingLinks.length}, DuckDuckGo: ${duckduckgoLinks.length}`);
      
      if (googleLinks.length > 0) usedEngines.push("google");
      if (bingLinks.length > 0) usedEngines.push("bing");
      if (duckduckgoLinks.length > 0) usedEngines.push("duckduckgo");

      allLinks = [...googleLinks, ...bingLinks, ...duckduckgoLinks];
    } else {
      // Fetch from a single search engine
      console.log(`Fetching from ${searchEngine} for query: "${query}"`);
      
      try {
        switch (searchEngine) {
          case "google":
            allLinks = await getGoogleLinks(query);
            usedEngines.push("google");
            break;
          case "bing":
            allLinks = await getBingLinks(query);
            usedEngines.push("bing");
            break;
          case "duckduckgo":
            allLinks = await getDuckDuckGoLinks(query);
            usedEngines.push("duckduckgo");
            break;
          default:
            allLinks = await getGoogleLinks(query);
            usedEngines.push("google");
        }
        
        console.log(`Found ${allLinks.length} links from ${searchEngine}`);
      } catch (error) {
        console.error(`Error fetching links from ${searchEngine}:`, error);
        // Try Google as fallback if another engine fails
        if (searchEngine !== "google") {
          console.log("Trying Google as fallback");
          try {
            allLinks = await getGoogleLinks(query);
            usedEngines = ["google (fallback)"];
          } catch (fallbackError) {
            console.error("Fallback to Google also failed:", fallbackError);
          }
        }
      }
    }
    
    // Filter and clean the links
    const filteredLinks = filterAndCleanLinks(allLinks);
    
    return {
      links: filteredLinks,
      usedEngines
    };
  } catch (error) {
    console.error("Error getting search engine links:", error);
    return {
      links: [],
      usedEngines
    };
  }
}
