import { Groq } from 'groq-sdk';
import type { NextApiRequest, NextApiResponse } from 'next';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that generates related search queries.'
          },
          {
            role: 'user',
            content: `Generate up to 3 related search queries for the following topic: "${query}". Return the queries as a JSON array of strings.`,
          },
        ],
        model: 'gemma2-9b-it',
        temperature: 0.7, // Adjusted for more focused queries
        max_tokens: 150, // Reduced as we only need a few queries
        top_p: 1,
        stream: false, // We need the full response to parse JSON
        response_format: { type: 'json_object' }, // Ensure JSON output
        stop: null,
      });

      const generatedQueriesContent = chatCompletion.choices[0]?.message?.content;
      if (generatedQueriesContent) {
        // Assuming the model returns a JSON string like '{"queries": ["query1", "query2"]}'
        // Or directly an array of strings in its content if the prompt is precise enough
        try {
          const parsedQueries = JSON.parse(generatedQueriesContent);
          // Ensure the response is an array of strings
          if (Array.isArray(parsedQueries.queries) && parsedQueries.queries.every((q: any) => typeof q === 'string')) {
            return res.status(200).json({ queries: parsedQueries.queries.slice(0, 3) }); // Limit to 3 queries
          } else {
            // Fallback if the model's JSON is not as expected, try to extract from a simple list
            // This part might need adjustment based on actual model output for non-JSON format
            const potentialQueries = generatedQueriesContent.split('\n').map(q => q.trim()).filter(q => q.length > 0);
            if (potentialQueries.length > 0) {
              return res.status(200).json({ queries: potentialQueries.slice(0, 3) });
            }
            console.error('Failed to parse queries from model response:', generatedQueriesContent);
            return res.status(500).json({ error: 'Failed to parse generated queries from AI response' });
          }
        } catch (parseError) {
          console.error('Error parsing JSON from Groq:', parseError, 'Raw content:', generatedQueriesContent);
          // Attempt to provide a fallback if parsing fails but content exists
          // This is a simple heuristic and might need refinement
          if (generatedQueriesContent.includes("\n")) {
            const fallbackQueries = generatedQueriesContent.split("\n").map(q => q.replace(/^- /, '').trim()).filter(Boolean).slice(0,3);
            if(fallbackQueries.length > 0) {
              return res.status(200).json({ queries: fallbackQueries });
            }
          }
          return res.status(500).json({ error: 'Error parsing JSON from AI response' });
        }
      } else {
        return res.status(500).json({ error: 'No content received from AI model' });
      }
    } catch (error: any) {
      console.error('Groq API error:', error);
      return res.status(500).json({ error: 'Failed to generate queries using Groq AI', details: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}