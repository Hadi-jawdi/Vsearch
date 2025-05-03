/**
 * HTTP utilities for making requests with advanced features
 */

// Timeout for fetch requests (15 seconds)
export const FETCH_TIMEOUT = 15000;

// User agent rotation for requests
export const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:94.0) Gecko/20100101 Firefox/94.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/96.0.4664.53 Mobile/15E148 Safari/604.1"
];

// Maximum number of retries for fetch requests
export const MAX_RETRIES = 3;

// Delay between retries (in ms)
export const RETRY_DELAY = 1000;

/**
 * Get a random user agent
 */
export const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

/**
 * Enhanced fetch with timeout, retries, and exponential backoff
 */
export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = FETCH_TIMEOUT): Promise<Response> {
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
 * Validate if a string is a valid URL and meets content criteria
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Filter and clean a list of URLs
 */
export function filterAndCleanLinks(links: string[]): string[] {
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
