import { Message } from "@/types";
import type { NextApiRequest, NextApiResponse } from 'next';
import { Groq } from 'groq-sdk';

// Initialize Groq SDK
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY, // Ensure your GROQ_API_KEY is set in .env.local or environment variables
});

// Maximum number of retries for API calls
const MAX_RETRIES = 3;

// Enhanced system prompt for better responses with Groq
const SYSTEM_PROMPT = `You are an advanced AI assistant. Your task is to provide accurate, helpful, and concise answers based on the given sources. 
Follow these guidelines strictly:
1. Cite sources using the format [1], [2], etc., immediately after the sentence or part of the sentence that uses information from that source. Do not group citations at the end of a paragraph.
2. Be objective and factual. Do not add opinions or information not present in the sources.
3. If the provided sources do not contain information relevant to answer the query, clearly state that the information is not available in the provided context. Do not attempt to answer from external knowledge.
4. Synthesize information from multiple sources when appropriate, ensuring all cited information is correctly attributed.
5. Use bullet points or numbered lists for structured information like steps, lists of items, or pros and cons, if it enhances clarity.
6. Format your response in a clear, readable, and well-structured markdown format.
7. If the query is conversational or a follow-up, consider the previous messages in your response, but always base your answer on the provided sources for the current turn.
8. Do not invent URLs or source details. Refer only to the sources provided in the prompt.
9. Your primary goal is to answer the user's query based *only* on the provided text sources.`;

/**
 * Retry function for API calls with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;

    // Wait with exponential backoff
    await new Promise(resolve => setTimeout(resolve, delay));

    // Retry with increased delay
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, previousMessages = [] } = req.body as {
      prompt: string;
      previousMessages?: Message[];
    };

    // Validate input
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Invalid prompt provided' });
    }

    // Format messages for Groq API
    const formattedMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...previousMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      })),
      { role: "user", content: prompt }
    ];

    try {
      // Create a completion using the Groq SDK with retry mechanism
      const chatCompletion = await retryWithBackoff(async () => {
        return await groq.chat.completions.create({
          messages: formattedMessages,
          model: 'deepseek-r1-distill-llama-70b', // User specified model
          temperature: 0.6, // User specified temperature
          max_tokens: 4096, // User specified max_tokens
          top_p: 0.95, // User specified top_p
          stream: false, // Stream is false as we need the full response
          stop: null
        });
      });

      // Get the response content
      const content = chatCompletion.choices[0]?.message?.content || '';

      if (!content) {
        throw new Error('No content returned from the Groq API');
      }

      // Return the response as JSON with metadata
      res.status(200).json({
        content,
        metadata: {
          model: 'deepseek-r1-distill-llama-70b',
          timestamp: new Date().toISOString(),
          // Groq API might provide token counts in the response, adjust if available
          // For now, using rough estimates or omitting if not critical
          // promptTokens: chatCompletion.usage?.prompt_tokens,
          // completionTokens: chatCompletion.usage?.completion_tokens,
        }
      });
    } catch (error: any) {
      console.error("Error processing request:", error);

      // Provide user-friendly error messages
      let errorMessage = "We're having trouble generating a response. Please try again.";

      if (error.message.includes('rate limit')) {
        errorMessage = "We've reached our API rate limit. Please try again in a moment.";
      } else if (error.message.includes('timeout')) {
        errorMessage = "The request timed out. Please try a simpler query or try again later.";
      } else if (error.message.includes('auth')) {
        errorMessage = "There's an authentication issue with our AI service. Please try again later.";
      }

      res.status(500).json({
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  } catch (error: any) {
    console.error("API error:", error);
    res.status(500).json({
      error: "Something went wrong with your request. Please try again."
    });
  }
}
