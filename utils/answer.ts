import { Message } from "@/types";
import Cerebras from '@cerebras/cerebras_cloud_sdk';

// Cerebras API key
const CEREBRAS_API_KEY = "csk-5f9ftpvvtker983wvkkcym8eem65tey64khtptwhxfmenp9w";

// Initialize Cerebras SDK
const cerebras = new Cerebras({
  apiKey: CEREBRAS_API_KEY
});

export const createStream = async (
  prompt: string,
  previousMessages: Message[] = []
) => {
  return CerebrasStream(prompt, previousMessages);
};

export const CerebrasStream = async (prompt: string, previousMessages: Message[] = []) => {
  const encoder = new TextEncoder();

  // Format messages for Cerebras API
  const formattedMessages = [
    { role: "system", content: "You are a helpful assistant that accurately answers the user's queries based on the given text." },
    ...previousMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    { role: "user", content: prompt }
  ];

  try {
    // Create a stream using the Cerebras SDK exactly as in the example
    const stream = await cerebras.chat.completions.create({
      messages: formattedMessages as any,
      model: 'llama-4-scout-17b-16e-instruct',
      stream: true,
      max_completion_tokens: 2048,
      temperature: 0.2,
      top_p: 1
    });

    // Create a ReadableStream to handle the streaming response
    return new ReadableStream({
      async start(controller) {
        try {
          // Process the stream
          for await (const chunk of stream as any) {
            const content = chunk.choices?.[0]?.delta?.content || '';
            if (content) {
              const queue = encoder.encode(content);
              controller.enqueue(queue);
            }
          }
          controller.close();
        } catch (error) {
          console.error("Error processing stream:", error);
          controller.error(new Error("Stream processing error"));
        }
      }
    });
  } catch (error: any) {
    console.error("Error creating Cerebras stream:", error);
    throw new Error(`Cerebras API error: ${error.message || "Unknown error"}`);
  }
};
