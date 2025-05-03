import { Source } from "@/types";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import type { NextApiRequest, NextApiResponse } from "next";

// Define response type
type SourcesResponse = {
  sources: Source[];
  metadata?: {
    engine: string;
    totalResults?: number;
    searchTime?: number;
    filteredSources?: number;
  };
  error?: string;
};

// Define search engine type
export type SearchEngine = "google" | "bing" | "duckduckgo" | "all";

// Timeout for fetch requests (15 seconds)
const FETCH_TIMEOUT = 15000;

// User agent rotation for requests
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:94.0) Gecko/20100101 Firefox/94.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/96.0.4664.53 Mobile/15E148 Safari/604.1"
];

// Get a random user agent
const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// Maximum number of retries for fetch requests
const MAX_RETRIES = 3;

// Delay between retries (in ms)
const RETRY_DELAY = 1000;

// Number of sources to return
const DEFAULT_SOURCE_COUNT = 4;

// List of domains to exclude from results
const EXCLUDED_DOMAINS = [
  "google", "facebook", "twitter", "instagram", "youtube", "tiktok",
  "bing", "duckduckgo", "pinterest", "linkedin", "reddit", "quora"
];

/**
 * Enhanced fetch with timeout, retries, and exponential backoff
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = FETCH_TIMEOUT): Promise<Response> {
  let lastError: Error | null = null;

  // Try multiple times with exponential backoff
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutMs = timeout * (attempt + 1); // Increase timeout with each retry
    const id = setTimeout(() => controller.abort(), timeoutMs);

    // Add default headers including a random user agent
    const headers = {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...options.headers
    };

    try {
      // Add a small delay between retries with exponential backoff
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt - 1)));
        console.log(`Retry attempt ${attempt + 1} for ${url}`);
      }

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
        redirect: 'follow'
      });

      clearTimeout(id);

      // Check if we got a successful response
      if (response.ok) {
        return response;
      } else {
        // For certain status codes, we might want to retry
        if (response.status === 429 || response.status >= 500) {
          lastError = new Error(`HTTP error ${response.status}: ${response.statusText}`);
          continue; // Retry
        }
        return response; // Return the response even if it's not ok
      }
    } catch (error: any) {
      clearTimeout(id);
      lastError = error;

      // Don't retry if it's a CORS error or if the request was aborted
      if (error.name === 'AbortError' || error.message.includes('CORS')) {
        throw error;
      }

      // Continue to next retry attempt
    }
  }

  // If we've exhausted all retries, throw the last error
  throw lastError || new Error(`Failed to fetch ${url} after ${MAX_RETRIES} attempts`);
}

/**
 * Main handler for the sources API
 */
const searchHandler = async (req: NextApiRequest, res: NextApiResponse<SourcesResponse>) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ sources: [], error: 'Method not allowed' });
  }

  const startTime = Date.now();

  try {
    const { query, searchEngine = "google", sourceCount = DEFAULT_SOURCE_COUNT } = req.body as {
      query: string;
      searchEngine?: SearchEngine;
      sourceCount?: number;
    };

    // Validate input
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        sources: [],
        error: 'Invalid query provided'
      });
    }

    // Limit source count to reasonable values
    const limitedSourceCount = Math.min(Math.max(1, sourceCount), 8);

    let allLinks: string[] = [];
    let usedEngines: string[] = [];

    // Get links from selected search engine(s)
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

    // Filter and deduplicate links
    const filteredLinks = filterAndDeduplicateLinks(allLinks);

    // Limit to requested number of sources
    const finalLinks = filteredLinks.slice(0, limitedSourceCount);

    if (finalLinks.length === 0) {
      return res.status(200).json({
        sources: [],
        metadata: {
          engine: usedEngines.join('+'),
          totalResults: 0,
          searchTime: Date.now() - startTime,
          filteredSources: 0
        }
      });
    }

    // Scrape text from links with timeout and concurrency control
    const sources = await scrapeSourcesWithTimeout(finalLinks);

    // Process and clean up sources
    const processedSources = processSources(sources);

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
  } catch (err: any) {
    console.error("Error in sources API:", err);
    res.status(500).json({
      sources: [],
      error: 'Failed to fetch sources. Please try again.'
    });
  }
};

/**
 * Filter and deduplicate links
 */
function filterAndDeduplicateLinks(links: string[]): string[] {
  // First, filter out invalid URLs and excluded domains
  const validLinks = links.filter(link => {
    try {
      const url = new URL(link);
      const domain = url.hostname;

      // Check if domain is in exclude list
      return !EXCLUDED_DOMAINS.some(excluded => domain.includes(excluded));
    } catch {
      return false;
    }
  });

  // Then, deduplicate by domain
  const uniqueDomains = new Set<string>();
  return validLinks.filter(link => {
    try {
      const domain = new URL(link).hostname;
      if (uniqueDomains.has(domain)) return false;

      uniqueDomains.add(domain);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Process and clean up sources
 */
function processSources(sources: Source[]): Source[] {
  const filteredSources = sources.filter(source =>
    source !== undefined &&
    source.text &&
    source.text.length > 100
  );

  // Truncate long texts and add metadata
  return filteredSources.map(source => ({
    ...source,
    text: source.text.slice(0, 1500),
    title: extractTitle(source.url)
  }));
}

/**
 * Extract a readable title from URL
 */
function extractTitle(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);

    // Get domain without www
    const domain = hostname.replace(/^www\./, '');

    // Get last path segment without extension
    const pathSegment = pathname.split('/').filter(Boolean).pop() || '';
    const cleanPathSegment = pathSegment.replace(/\.\w+$/, '').replace(/-|_/g, ' ');

    if (cleanPathSegment) {
      return `${cleanPathSegment.charAt(0).toUpperCase() + cleanPathSegment.slice(1)} - ${domain}`;
    }

    return domain;
  } catch {
    return url;
  }
}

/**
 * Scrape sources with timeout
 */
/**
 * Advanced web scraping with multiple extraction techniques and smart content detection
 */
async function scrapeSourcesWithTimeout(links: string[]): Promise<Source[]> {
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
 * Prioritize links based on domain reputation and URL structure
 */
function prioritizeLinks(links: string[]): string[] {
  // Score each link
  const scoredLinks = links.map(link => {
    try {
      const url = new URL(link);
      let score = 0;

      // Prefer certain domains
      const hostname = url.hostname.toLowerCase();

      // Higher score for reputable domains
      if (hostname.includes('.edu') ||
          hostname.includes('.gov') ||
          hostname.includes('wikipedia.org') ||
          hostname.includes('github.com') ||
          hostname.includes('stackoverflow.com') ||
          hostname.includes('medium.com')) {
        score += 30;
      }

      // Prefer shorter URLs (often main pages)
      score -= url.pathname.split('/').length * 2;

      // Prefer URLs without query parameters
      score -= url.search.length > 0 ? 5 : 0;

      // Avoid certain patterns
      if (url.pathname.includes('login') ||
          url.pathname.includes('signup') ||
          url.pathname.includes('account')) {
        score -= 20;
      }

      return { link, score };
    } catch {
      return { link, score: -100 }; // Invalid URLs get lowest priority
    }
  });

  // Sort by score (highest first)
  scoredLinks.sort((a, b) => b.score - a.score);

  // Return just the links
  return scoredLinks.map(item => item.link);
}

/**
 * Extract content using Mozilla's Readability
 */
async function extractWithReadability(html: string, url: string): Promise<{ text: string, title: string } | null> {
  try {
    const dom = new JSDOM(html, {
      url,
      runScripts: "outside-only",
      pretendToBeVisual: true
    });

    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article && article.textContent && article.textContent.length > 200) {
      return {
        text: article.textContent,
        title: article.title || dom.window.document.title || extractTitle(url)
      };
    }

    return null;
  } catch (error) {
    console.warn(`Readability extraction failed for ${url}:`, error);
    return null;
  }
}

/**
 * Extract content using custom selectors for different site types
 */
async function extractWithCustomSelectors(html: string, url: string): Promise<{ text: string, title: string } | null> {
  try {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    // Get the hostname to apply site-specific selectors
    const hostname = new URL(url).hostname.toLowerCase();

    // Define selectors for different site types
    let selectors: string[] = [];

    // Wikipedia-specific selectors
    if (hostname.includes('wikipedia.org')) {
      selectors = ['#mw-content-text', '.mw-parser-output'];
    }
    // GitHub-specific selectors
    else if (hostname.includes('github.com')) {
      selectors = ['.markdown-body', 'article.markdown-body', '.repository-content'];
    }
    // StackOverflow-specific selectors
    else if (hostname.includes('stackoverflow.com')) {
      selectors = ['.post-text', '.answer'];
    }
    // News site selectors
    else if (hostname.includes('news') ||
             hostname.includes('bbc') ||
             hostname.includes('cnn') ||
             hostname.includes('nytimes')) {
      selectors = ['.article-body', '.story-body', '.article__content', '[itemprop="articleBody"]'];
    }
    // Default content selectors
    else {
      selectors = [
        'main', 'article', '[role="main"]', '#content', '.content',
        '.post-content', '.entry-content', '.article-content', '.post-body',
        '.page-content', '.main-content', '.body-content'
      ];
    }

    // Try each selector
    for (const selector of selectors) {
      const elements = doc.querySelectorAll(selector);
      if (elements.length > 0) {
        // Combine text from all matching elements
        let combinedText = '';
        elements.forEach(el => {
          combinedText += el.textContent + '\n\n';
        });

        if (combinedText.length > 200) {
          return {
            text: combinedText,
            title: doc.title || extractTitle(url)
          };
        }
      }
    }

    // If no content found with selectors, try to find the largest text block
    const textBlocks = findLargestTextBlocks(doc);
    if (textBlocks && textBlocks.length > 200) {
      return {
        text: textBlocks,
        title: doc.title || extractTitle(url)
      };
    }

    return null;
  } catch (error) {
    console.warn(`Custom extraction failed for ${url}:`, error);
    return null;
  }
}

/**
 * Extract content using a simplified method (fallback)
 */
async function extractWithSimplifiedMethod(html: string, url: string): Promise<{ text: string, title: string } | null> {
  try {
    // Use cheerio for lightweight parsing
    const $ = cheerio.load(html);

    // Remove script, style, nav, footer, and other non-content elements
    $('script, style, nav, footer, header, aside, .sidebar, .footer, .header, .navigation, .nav, .menu, .comments, .ads, .ad').remove();

    // Get the title
    const title = $('title').text() || extractTitle(url);

    // Get all paragraphs
    const paragraphs: string[] = [];
    $('p').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) { // Only include substantial paragraphs
        paragraphs.push(text);
      }
    });

    // If we found paragraphs, join them
    if (paragraphs.length > 0) {
      return {
        text: paragraphs.join('\n\n'),
        title
      };
    }

    // Fallback: get all text from body
    const bodyText = $('body').text();
    if (bodyText.length > 200) {
      // Clean up the text
      const cleanedText = bodyText
        .replace(/\s+/g, ' ')
        .trim()
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 20)
        .join('\n\n');

      if (cleanedText.length > 200) {
        return {
          text: cleanedText,
          title
        };
      }
    }

    return null;
  } catch (error) {
    console.warn(`Simplified extraction failed for ${url}:`, error);
    return null;
  }
}

/**
 * Find the largest text blocks in a document
 */
function findLargestTextBlocks(doc: Document): string {
  // Get all elements with substantial text
  const textElements: {element: Element, length: number}[] = [];

  // Function to recursively process elements
  function processElement(element: Element) {
    // Skip certain elements
    const tagName = element.tagName.toLowerCase();
    if (['script', 'style', 'nav', 'header', 'footer'].includes(tagName)) {
      return;
    }

    // Check if this element has direct text
    const directText = Array.from(element.childNodes)
      .filter(node => node.nodeType === 3) // Text nodes only
      .map(node => node.textContent || '')
      .join('')
      .trim();

    // If this element has substantial direct text, add it
    if (directText.length > 50) {
      textElements.push({element, length: directText.length});
    }

    // Process children
    Array.from(element.children).forEach(processElement);
  }

  // Start processing from body
  processElement(doc.body);

  // Sort by text length (largest first)
  textElements.sort((a, b) => b.length - a.length);

  // Take the top elements that likely contain main content
  const mainContentElements = textElements.slice(0, 10);

  // Extract and join their text
  return mainContentElements
    .map(item => item.element.textContent || '')
    .join('\n\n');
}

/**
 * Process and clean extracted text
 */
function processExtractedText(text: string): string {
  // Remove excessive whitespace
  let processed = text.replace(/\s+/g, ' ');

  // Split into lines and clean each line
  processed = processed
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');

  // Remove duplicate paragraphs
  const paragraphs = processed.split('\n\n');
  const uniqueParagraphs = Array.from(new Set(paragraphs));
  processed = uniqueParagraphs.join('\n\n');

  // Limit length to avoid extremely long texts
  if (processed.length > 8000) {
    processed = processed.substring(0, 8000) + '...';
  }

  return processed;
}

/**
 * Sort sources by quality
 */
function sortSourcesByQuality(sources: Source[]): Source[] {
  return [...sources].sort((a, b) => {
    // Calculate quality score based on text length and other factors
    const scoreA = calculateContentQualityScore(a);
    const scoreB = calculateContentQualityScore(b);

    return scoreB - scoreA;
  });
}

/**
 * Calculate content quality score
 */
function calculateContentQualityScore(source: Source): number {
  let score = 0;

  // Length is a primary factor
  score += Math.min(source.text.length / 100, 50);

  // Prefer sources with titles
  score += source.title ? 10 : 0;

  // Prefer sources from reputable domains
  try {
    const hostname = new URL(source.url).hostname.toLowerCase();
    if (hostname.includes('.edu') ||
        hostname.includes('.gov') ||
        hostname.includes('wikipedia.org')) {
      score += 20;
    }
  } catch {
    // Invalid URL
  }

  return score;
}

/**
 * Create fallback sources when extraction fails
 */
function createFallbackSources(links: string[]): Source[] {
  // Create at least one fallback source
  const fallbackSources: Source[] = [];

  // Try to create sources from the top 3 links
  const topLinks = links.slice(0, 3);

  for (const link of topLinks) {
    try {
      const domain = new URL(link).hostname.replace('www.', '');

      fallbackSources.push({
        url: link,
        text: `This information is from ${domain}. The content could not be fully extracted due to website restrictions. Please visit the website directly for complete information.`,
        title: `Information from ${domain}`
      });
    } catch {
      // Skip invalid URLs
    }
  }

  // If we couldn't create any fallback sources, create a generic one
  if (fallbackSources.length === 0 && links.length > 0) {
    fallbackSources.push({
      url: links[0],
      text: `Information could not be retrieved from the sources. This might be due to website restrictions or technical limitations. Try refining your search query or visiting the websites directly.`,
      title: `Search Results`
    });
  }

  return fallbackSources;
}

/**
 * Advanced Google search with multiple extraction techniques and fallbacks
 */
async function getGoogleLinks(query: string): Promise<string[]> {
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

    // Filter and clean the links
    const filteredLinks = filterAndCleanLinks(allLinks);

    console.log(`Found ${filteredLinks.length} unique valid links from Google`);
    return filteredLinks;
  } catch (error) {
    console.error("Error fetching Google links:", error);
    return [];
  }
}

/**
 * Extract links from Google search results HTML using multiple methods
 */
function extractGoogleLinks(html: string): string[] {
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

/**
 * Filter and clean a list of URLs
 */
function filterAndCleanLinks(links: string[]): string[] {
  // Remove duplicates
  let uniqueLinks = Array.from(new Set(links));

  // Filter out invalid and unwanted URLs
  uniqueLinks = uniqueLinks.filter(link => {
    try {
      const url = new URL(link);
      const hostname = url.hostname.toLowerCase();

      // Filter out common non-content domains
      const invalidDomains = [
        'google.com', 'youtube.com', 'facebook.com', 'twitter.com', 'instagram.com',
        'linkedin.com', 'pinterest.com', 'amazon.com', 'ebay.com', 'netflix.com',
        'apple.com', 'microsoft.com', 'play.google.com', 'accounts.google.com',
        'support.google.com', 'maps.google.com', 'policies.google.com',
        'translate.google.com', 'chrome.google.com', 'docs.google.com',
        'drive.google.com', 'mail.google.com', 'calendar.google.com'
      ];

      if (invalidDomains.some(domain => hostname.includes(domain))) {
        return false;
      }

      // Filter out URLs with certain patterns
      const invalidPatterns = [
        '/search?', '/login', '/signin', '/signup', '/register',
        '/account', '/cart', '/checkout', '/privacy', '/terms',
        '/contact', '/about', '/help', '/support', '/faq',
        '/download', '/subscribe', '/membership', '/pricing'
      ];

      if (invalidPatterns.some(pattern => url.pathname.includes(pattern))) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  });

  // Limit to a reasonable number
  return uniqueLinks.slice(0, 20);
}

/**
 * Validate if a string is a valid URL and meets content criteria
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Enhanced Bing search with multiple extraction techniques
 */
async function getBingLinks(query: string): Promise<string[]> {
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

    // Filter and clean the links
    const filteredLinks = filterAndCleanLinks(allLinks);

    console.log(`Found ${filteredLinks.length} unique valid links from Bing`);
    return filteredLinks;
  } catch (error) {
    console.error("Error fetching Bing links:", error);
    return [];
  }
}

/**
 * Extract links from Bing search results HTML
 */
function extractBingLinks(html: string): string[] {
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

/**
 * Enhanced DuckDuckGo search with multiple extraction techniques
 */
async function getDuckDuckGoLinks(query: string): Promise<string[]> {
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

    // Filter and clean the links
    const filteredLinks = filterAndCleanLinks(allLinks);

    console.log(`Found ${filteredLinks.length} unique valid links from DuckDuckGo`);
    return filteredLinks;
  } catch (error) {
    console.error("Error fetching DuckDuckGo links:", error);
    return [];
  }
}

/**
 * Extract links from DuckDuckGo search results HTML
 */
function extractDuckDuckGoLinks(html: string): string[] {
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

export default searchHandler;
