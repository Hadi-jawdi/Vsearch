/**
 * DuckDuckGo search engine implementation
 */
import * as cheerio from "cheerio";
import { fetchWithTimeout, getRandomUserAgent, isValidUrl } from "../http";

/**
 * Enhanced DuckDuckGo search with multiple extraction techniques
 */
export async function getDuckDuckGoLinks(query: string): Promise<string[]> {
  try {
    console.log(`Making DuckDuckGo search request for: "${query}"`);
    
    // Try multiple search variations
    const searchVariations = [
      // Standard HTML search
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      // With region set to US
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`,
      // With time filter for recent results
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&df=y`
    ];
    
    let allLinks: string[] = [];
    
    // Try each search variation
    for (let i = 0; i < searchVariations.length; i++) {
      if (allLinks.length >= 15) {
        console.log(`Already found ${allLinks.length} links from DuckDuckGo, skipping remaining variations`);
        break;
      }
      
      try {
        const searchUrl = searchVariations[i];
        console.log(`Trying DuckDuckGo search variation ${i + 1}: ${searchUrl}`);
        
        // Add headers to mimic a real browser
        const response = await fetchWithTimeout(
          searchUrl,
          {
            headers: {
              'User-Agent': getRandomUserAgent(),
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Referer': 'https://duckduckgo.com/',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'Cache-Control': 'max-age=0'
            }
          }
        );

        if (!response.ok) {
          console.warn(`DuckDuckGo search variation ${i + 1} failed: ${response.status}`);
          continue;
        }

        const html = await response.text();
        
        // Check if we got a valid response
        if (html.length < 1000) {
          console.warn(`Too small response from DuckDuckGo variation ${i + 1}: ${html.length} chars`);
          continue;
        }
        
        // Extract links using our custom function
        const extractedLinks = extractDuckDuckGoLinks(html);
        
        if (extractedLinks.length > 0) {
          console.log(`Found ${extractedLinks.length} links from DuckDuckGo variation ${i + 1}`);
          
          // Add new unique links
          extractedLinks.forEach(link => {
            if (!allLinks.includes(link)) {
              allLinks.push(link);
            }
          });
        }
      } catch (variationError) {
        console.error(`Error with DuckDuckGo search variation ${i + 1}:`, variationError);
      }
    }
    
    // If HTML search failed, try the lite version as fallback
    if (allLinks.length === 0) {
      try {
        console.log("Trying DuckDuckGo Lite as fallback");
        const liteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        
        const response = await fetchWithTimeout(
          liteUrl,
          {
            headers: {
              'User-Agent': getRandomUserAgent(),
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
          }
        );
        
        if (response.ok) {
          const html = await response.text();
          const $ = cheerio.load(html);
          
          // Extract links from the lite version
          $("a[href^='http']").each((_, element) => {
            const href = $(element).attr("href");
            if (href && 
                !href.includes("duckduckgo.com") && 
                isValidUrl(href) && 
                !allLinks.includes(href)) {
              allLinks.push(href);
            }
          });
          
          console.log(`Found ${allLinks.length} links from DuckDuckGo Lite fallback`);
        }
      } catch (liteError) {
        console.error("Error with DuckDuckGo Lite fallback:", liteError);
      }
    }
    
    console.log(`Found ${allLinks.length} links from DuckDuckGo`);
    return allLinks;
  } catch (error) {
    console.error("Error fetching DuckDuckGo links:", error);
    return [];
  }
}

/**
 * Extract links from DuckDuckGo search results HTML
 */
export function extractDuckDuckGoLinks(html: string): string[] {
  const $ = cheerio.load(html);
  let links: string[] = [];
  
  // Method 1: Extract from main result links
  $(".result__a").each((_, element) => {
    const href = $(element).attr("href");
    if (href) {
      try {
        // DuckDuckGo uses relative URLs with parameters
        const url = new URL(href, "https://duckduckgo.com");
        const cleanedHref = url.searchParams.get("uddg");
        
        if (cleanedHref && isValidUrl(cleanedHref) && !links.includes(cleanedHref)) {
          links.push(cleanedHref);
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }
  });
  
  // Method 2: Extract from result snippets
  $(".result__snippet").each((_, element) => {
    const parentLink = $(element).closest(".result").find(".result__a").attr("href");
    if (parentLink) {
      try {
        const url = new URL(parentLink, "https://duckduckgo.com");
        const cleanedHref = url.searchParams.get("uddg");
        
        if (cleanedHref && isValidUrl(cleanedHref) && !links.includes(cleanedHref)) {
          links.push(cleanedHref);
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }
  });
  
  // Method 3: Last resort - find any external links
  if (links.length < 3) {
    $("a[href^='/']").each((_, element) => {
      const href = $(element).attr("href");
      if (href && href.includes("uddg=")) {
        try {
          const url = new URL(href, "https://duckduckgo.com");
          const cleanedHref = url.searchParams.get("uddg");
          
          if (cleanedHref && isValidUrl(cleanedHref) && !links.includes(cleanedHref)) {
            links.push(cleanedHref);
          }
        } catch (e) {
          // Skip invalid URLs
        }
      }
    });
  }
  
  return links;
}
