/**
 * Web scraping functionality
 */
import { Source } from "@/types";
import { fetchWithTimeout } from "./http";
import { 
  extractWithReadability, 
  extractWithCustomSelectors, 
  extractWithSimplifiedMethod, 
  processExtractedText, 
  sortSourcesByQuality, 
  createFallbackSources,
  prioritizeLinks
} from "./extraction";

// Timeout for fetch requests (15 seconds)
const FETCH_TIMEOUT = 15000;

/**
 * Advanced web scraping with multiple extraction techniques and smart content detection
 */
export async function scrapeSourcesWithTimeout(links: string[]): Promise<Source[]> {
  // Use a more controlled approach with concurrency limit and prioritization
  const MAX_CONCURRENT = 4;
  const results: (Source | null)[] = [];
  
  // Prioritize links based on domain reputation and URL structure
  const prioritizedLinks = prioritizeLinks([...links]);
  const pendingLinks = prioritizedLinks;
  
  console.log(`Scraping ${pendingLinks.length} links with priority order`);
  
  // Process links in batches to control concurrency
  while (pendingLinks.length > 0) {
    const batch = pendingLinks.splice(0, MAX_CONCURRENT);
    console.log(`Processing batch of ${batch.length} links`);
    
    const batchResults = await Promise.all(
      batch.map(async (link) => {
        try {
          // Try multiple extraction techniques
          for (let technique = 0; technique < 3; technique++) {
            try {
              console.log(`Fetching ${link} with technique ${technique + 1}`);
              
              // Adjust timeout based on technique
              const techniqueTimeout = FETCH_TIMEOUT + (technique * 5000);
              
              // Use different fetch options based on technique
              const fetchOptions: RequestInit = {
                headers: {
                  // Add referer for some techniques
                  ...(technique > 0 ? { 'Referer': 'https://www.google.com/' } : {})
                }
              };
              
              const response = await fetchWithTimeout(link, fetchOptions, techniqueTimeout);
              
              if (!response.ok) {
                console.warn(`Failed to fetch ${link}: ${response.status}, technique ${technique + 1}`);
                
                // For certain status codes, we might want to skip to next technique
                if (response.status === 403 || response.status === 429) {
                  continue;
                }
                
                // For other status codes, we might want to try a different approach
                if (technique < 2) {
                  continue;
                } else {
                  break; // Give up on this link after all techniques fail
                }
              }
              
              // Get content type to handle different types of content
              const contentType = response.headers.get('content-type') || '';
              
              // Skip non-HTML content
              if (!contentType.includes('text/html') && 
                  !contentType.includes('application/xhtml+xml') &&
                  !contentType.includes('text/plain')) {
                console.warn(`Skipping non-HTML content: ${contentType} for ${link}`);
                continue;
              }
              
              const html = await response.text();
              
              // Skip if we got a very small response (likely an error page)
              if (html.length < 800) {
                console.warn(`Too small response from ${link}: ${html.length} chars`);
                continue;
              }
              
              // Check for common error patterns in the HTML
              if (html.includes('captcha') || 
                  html.includes('CAPTCHA') || 
                  html.includes('access denied') ||
                  html.includes('Access Denied') ||
                  html.includes('403 Forbidden')) {
                console.warn(`Detected access restriction in ${link}`);
                continue;
              }
              
              // Parse the HTML with different methods based on technique
              let extractedContent: { text: string, title: string } | null = null;
              
              // Technique 1: Use Readability
              if (technique === 0) {
                extractedContent = await extractWithReadability(html, link);
              }
              
              // Technique 2: Use custom content extraction
              if (technique === 1 || !extractedContent) {
                extractedContent = await extractWithCustomSelectors(html, link);
              }
              
              // Technique 3: Use simplified extraction
              if (technique === 2 || !extractedContent) {
                extractedContent = await extractWithSimplifiedMethod(html, link);
              }
              
              // If we successfully extracted content
              if (extractedContent && extractedContent.text.length > 200) {
                console.log(`Successfully extracted ${extractedContent.text.length} chars from ${link}`);
                
                // Clean and process the text
                const processedText = processExtractedText(extractedContent.text);
                
                return {
                  url: link,
                  text: processedText,
                  title: extractedContent.title || extractTitle(link)
                };
              }
              
            } catch (techniqueError) {
              console.warn(`Technique ${technique + 1} failed for ${link}:`, techniqueError);
            }
          }
          
          // All techniques failed
          console.error(`All extraction techniques failed for ${link}`);
          return null;
        } catch (error) {
          console.error(`Error scraping ${link}:`, error);
          return null;
        }
      })
    );
    
    results.push(...batchResults);
    
    // If we have enough good results, we can stop early
    const validResults = results.filter(Boolean) as Source[];
    if (validResults.length >= 3) {
      console.log(`Got ${validResults.length} good results, stopping early`);
      break;
    }
  }
  
  // Filter out null results and ensure we have at least some content
  const validSources = results.filter(Boolean) as Source[];
  
  // Sort sources by content quality (length and readability)
  const sortedSources = sortSourcesByQuality(validSources);
  
  // If we have no valid sources, create intelligent fallback sources
  if (sortedSources.length === 0 && links.length > 0) {
    console.log("No valid sources found, creating fallback sources");
    return createFallbackSources(links);
  }
  
  return sortedSources;
}

/**
 * Extract title from URL
 */
function extractTitle(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const domain = hostname.replace(/^www\./, '');
    
    // Extract the last meaningful part of the path
    const pathParts = pathname.split('/').filter(Boolean);
    const lastPart = pathParts.length > 0 ? pathParts[pathParts.length - 1] : '';
    
    // Clean up the last part
    const cleanedPart = lastPart
      .replace(/[-_]/g, ' ')
      .replace(/\.\w+$/, '') // Remove file extension
      .trim();
    
    if (cleanedPart) {
      return `${cleanedPart} - ${domain}`;
    } else {
      return domain;
    }
  } catch {
    return url;
  }
}
