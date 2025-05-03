/**
 * Content extraction utilities for web scraping
 */
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { Source } from "@/types";
import { isValidUrl } from "./http";

/**
 * Extract content using Mozilla's Readability
 */
export async function extractWithReadability(html: string, url: string): Promise<{ text: string, title: string } | null> {
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
export async function extractWithCustomSelectors(html: string, url: string): Promise<{ text: string, title: string } | null> {
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
export async function extractWithSimplifiedMethod(html: string, url: string): Promise<{ text: string, title: string } | null> {
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
export function findLargestTextBlocks(doc: Document): string {
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
export function processExtractedText(text: string): string {
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
 * Extract title from URL
 */
export function extractTitle(url: string): string {
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

/**
 * Sort sources by quality
 */
export function sortSourcesByQuality(sources: Source[]): Source[] {
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
export function calculateContentQualityScore(source: Source): number {
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
export function createFallbackSources(links: string[]): Source[] {
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
 * Prioritize links based on domain reputation and URL structure
 */
export function prioritizeLinks(links: string[]): string[] {
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
