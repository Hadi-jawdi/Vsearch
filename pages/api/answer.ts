import { Message } from "@/types";
import type { NextApiRequest, NextApiResponse } from 'next';
import Cerebras from '@cerebras/cerebras_cloud_sdk';

// Cerebras API key
const CEREBRAS_API_KEY = "csk-5f9ftpvvtker983wvkkcym8eem65tey64khtptwhxfmenp9w";

// Initialize Cerebras SDK
const cerebras = new Cerebras({
  apiKey: CEREBRAS_API_KEY
});

// Maximum number of retries for API calls
const MAX_RETRIES = 3;

// Enhanced system prompt for better responses
const SYSTEM_PROMPT = `You are an advanced AI assistant that provides accurate, helpful, and concise answers based on the given sources.
Follow these guidelines:
1. Cite sources as [1], [2], etc. after each sentence that uses information from that source
2. Be objective and factual
3. If the sources don't contain relevant information, acknowledge the limitations
4. Synthesize information from multiple sources when appropriate
5. Use bullet points for lists and structured information
6. Format your response in a clear, readable way`;

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

    // Format messages for Cerebras API
    const formattedMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...previousMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: "user", content: prompt }
    ];

    try {
      // Create a completion using the Cerebras SDK with retry mechanism
      const completion = await retryWithBackoff(async () => {
        return await cerebras.chat.completions.create({
          messages: formattedMessages as any,
          model: 'llama-4-scout-17b-16e-instruct',
          stream: false,
          max_completion_tokens: 2048,
          temperature: 0.2,
          top_p: 1
        });
      });

      // Get the response content
      const content = completion.choices[0]?.message?.content || '';

      if (!content) {
        throw new Error('No content returned from the API');
      }

      // Return the response as JSON with metadata
      res.status(200).json({
        content,
        metadata: {
          model: 'llama-4-scout-17b-16e-instruct',
          timestamp: new Date().toISOString(),
          promptTokens: prompt.length / 4, // Rough estimate
          completionTokens: content.length / 4, // Rough estimate
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
