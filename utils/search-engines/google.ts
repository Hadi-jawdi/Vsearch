/**
 * Google search engine implementation
 */
import * as cheerio from "cheerio";
import { fetchWithTimeout, getRandomUserAgent, isValidUrl } from "../http";

/**
 * Advanced Google search with multiple extraction techniques and fallbacks
 */
export async function getGoogleLinks(query: string): Promise<string[]> {
  try {
    console.log(`Making Google search request for: "${query}"`);
    
    // Try multiple search variations to improve results
    const searchVariations = [
      // Standard search
      `https://www.google.com/search?q=${encodeURIComponent(query)}&num=30`,
      // Search with verbatim option to get exact matches
      `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20&tbs=li:1`,
      // Search with recent results
      `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20&tbs=qdr:y`
    ];
    
    let allLinks: string[] = [];
    
    // Try each search variation
    for (let i = 0; i < searchVariations.length; i++) {
      if (allLinks.length >= 15) {
        console.log(`Already found ${allLinks.length} links, skipping remaining variations`);
        break;
      }
      
      try {
        const searchUrl = searchVariations[i];
        console.log(`Trying search variation ${i + 1}: ${searchUrl}`);
        
        // Add additional headers to mimic a real browser
        const response = await fetchWithTimeout(
          searchUrl,
          {
            headers: {
              'User-Agent': getRandomUserAgent(),
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Referer': 'https://www.google.com/',
              'DNT': '1',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'Cache-Control': 'max-age=0',
              'sec-ch-ua': '"Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
              'sec-ch-ua-mobile': '?0',
              'sec-ch-ua-platform': '"Windows"'
            }
          }
        );

        if (!response.ok) {
          console.warn(`Google search variation ${i + 1} failed: ${response.status}`);
          continue;
        }

        const html = await response.text();
        
        // Check if we got a valid response
        if (html.length < 1000) {
          console.warn(`Too small response from Google variation ${i + 1}: ${html.length} chars`);
          continue;
        }
        
        if (html.includes("unusual traffic") || 
            html.includes("CAPTCHA") || 
            html.includes("detected unusual traffic")) {
          console.warn(`Google variation ${i + 1} blocked or returned a CAPTCHA`);
          continue;
        }
        
        // Extract links using multiple methods
        const extractedLinks = extractGoogleLinks(html);
        
        if (extractedLinks.length > 0) {
          console.log(`Found ${extractedLinks.length} links from Google variation ${i + 1}`);
          
          // Add new unique links
          extractedLinks.forEach(link => {
            if (!allLinks.includes(link)) {
              allLinks.push(link);
            }
          });
        }
      } catch (variationError) {
        console.error(`Error with Google search variation ${i + 1}:`, variationError);
      }
    }
    
    console.log(`Found ${allLinks.length} links from Google`);
    return allLinks;
  } catch (error) {
    console.error("Error fetching Google links:", error);
    return [];
  }
}

/**
 * Extract links from Google search results HTML using multiple methods
 */
export function extractGoogleLinks(html: string): string[] {
  const $ = cheerio.load(html);
  let links: string[] = [];
  
  // Method 1: Standard Google search results - look for redirects
  $("a").each((_, link) => {
    const href = $(link).attr("href");
    if (href && href.startsWith("/url?q=")) {
      try {
        const cleanedHref = decodeURIComponent(href.replace("/url?q=", "").split("&")[0]);
        if (isValidUrl(cleanedHref) && !links.includes(cleanedHref)) {
          links.push(cleanedHref);
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }
  });
  
  // Method 2: Look for result containers and extract links
  if (links.length < 5) {
    console.log("Using Google extraction method 2");
    
    // Modern Google selectors
    $(".g .yuRUbf > a, .g .rc > a, .g h3.r > a, .tF2Cxc > div.yuRUbf > a, .hlcw0c .yuRUbf > a").each((_, element) => {
      const href = $(element).attr("href");
      if (href && href.startsWith("http") && !links.includes(href)) {
        links.push(href);
      }
    });
  }
  
  // Method 3: Extract from cite elements
  if (links.length < 5) {
    console.log("Using Google extraction method 3");
    
    $(".iUh30, .tjvcx, .qzEoUe").each((_, element) => {
      const parentLink = $(element).closest("a").attr("href");
      if (parentLink && parentLink.startsWith("http") && !links.includes(parentLink)) {
        links.push(parentLink);
      } else {
        // Try to construct URL from cite text
        const citeText = $(element).text().trim();
        if (citeText && !citeText.includes("...") && citeText.includes(".")) {
          try {
            let url = citeText;
            if (!url.startsWith("http")) {
              url = "https://" + url;
            }
            if (isValidUrl(url) && !links.includes(url)) {
              links.push(url);
            }
          } catch (e) {
            // Skip invalid URLs
          }
        }
      }
    });
  }
  
  // Method 4: Last resort - find any external links
  if (links.length < 3) {
    console.log("Using Google extraction method 4 (last resort)");
    
    $("a[href^='http']").each((_, element) => {
      const href = $(element).attr("href");
      if (href && 
          !href.includes("google.com") && 
          !href.includes("accounts.") &&
          !href.includes("support.") &&
          isValidUrl(href) && 
          !links.includes(href)) {
        links.push(href);
      }
    });
  }
  
  return links;
}
