/**
 * Bing search engine implementation
 */
import * as cheerio from "cheerio";
import { fetchWithTimeout, getRandomUserAgent, isValidUrl } from "../http";

/**
 * Enhanced Bing search with multiple extraction techniques
 */
export async function getBingLinks(query: string): Promise<string[]> {
  try {
    console.log(`Making Bing search request for: "${query}"`);
    
    // Try multiple search variations
    const searchVariations = [
      // Standard search
      `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=30`,
      // Search with news
      `https://www.bing.com/search?q=${encodeURIComponent(query)}&filters=news`,
      // Search with freshness filter
      `https://www.bing.com/search?q=${encodeURIComponent(query)}&filters=ex1%3a"ez5"` 
    ];
    
    let allLinks: string[] = [];
    
    // Try each search variation
    for (let i = 0; i < searchVariations.length; i++) {
      if (allLinks.length >= 15) {
        console.log(`Already found ${allLinks.length} links from Bing, skipping remaining variations`);
        break;
      }
      
      try {
        const searchUrl = searchVariations[i];
        console.log(`Trying Bing search variation ${i + 1}: ${searchUrl}`);
        
        // Add headers to mimic a real browser
        const response = await fetchWithTimeout(
          searchUrl,
          {
            headers: {
              'User-Agent': getRandomUserAgent(),
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Referer': 'https://www.bing.com/',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'Cache-Control': 'max-age=0'
            }
          }
        );

        if (!response.ok) {
          console.warn(`Bing search variation ${i + 1} failed: ${response.status}`);
          continue;
        }

        const html = await response.text();
        
        // Check if we got a valid response
        if (html.length < 1000) {
          console.warn(`Too small response from Bing variation ${i + 1}: ${html.length} chars`);
          continue;
        }
        
        // Extract links using multiple methods
        const extractedLinks = extractBingLinks(html);
        
        if (extractedLinks.length > 0) {
          console.log(`Found ${extractedLinks.length} links from Bing variation ${i + 1}`);
          
          // Add new unique links
          extractedLinks.forEach(link => {
            if (!allLinks.includes(link)) {
              allLinks.push(link);
            }
          });
        }
      } catch (variationError) {
        console.error(`Error with Bing search variation ${i + 1}:`, variationError);
      }
    }
    
    console.log(`Found ${allLinks.length} links from Bing`);
    return allLinks;
  } catch (error) {
    console.error("Error fetching Bing links:", error);
    return [];
  }
}

/**
 * Extract links from Bing search results HTML
 */
export function extractBingLinks(html: string): string[] {
  const $ = cheerio.load(html);
  let links: string[] = [];
  
  // Method 1: Extract from main search results
  $(".b_algo h2 a").each((_, element) => {
    const href = $(element).attr("href");
    if (href && href.startsWith("http") && !links.includes(href)) {
      links.push(href);
    }
  });
  
  // Method 2: Extract from cite elements
  $(".b_caption cite").each((_, element) => {
    const parentLink = $(element).closest(".b_algo").find("h2 a").attr("href");
    if (parentLink && parentLink.startsWith("http") && !links.includes(parentLink)) {
      links.push(parentLink);
    }
  });
  
  // Method 3: Extract from deep links
  $(".b_deeplinks a").each((_, element) => {
    const href = $(element).attr("href");
    if (href && href.startsWith("http") && !links.includes(href)) {
      links.push(href);
    }
  });
  
  // Method 4: Last resort - find any external links
  if (links.length < 5) {
    $("a[href^='http']").each((_, element) => {
      const href = $(element).attr("href");
      if (href && 
          !href.includes("bing.com") && 
          !href.includes("microsoft.com") &&
          !href.includes("msn.com") &&
          isValidUrl(href) && 
          !links.includes(href)) {
        links.push(href);
      }
    });
  }
  
  return links;
}
