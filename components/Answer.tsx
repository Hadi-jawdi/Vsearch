import { Message, SearchQuery } from "@/types";
import { saveToHistory } from "@/utils/history";
import {
  IconBrandTwitter,
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconReload,
  IconSearch,
  IconShare,
  IconThumbUp
} from "@tabler/icons-react";
import { FC, KeyboardEvent, useEffect, useRef, useState } from "react";

interface AnswerProps {
  searchQuery: SearchQuery;
  answer: string;
  done: boolean;
  onReset: () => void;
  onAnswerUpdate: (answer: string) => void;
}

export const Answer: FC<AnswerProps> = ({ searchQuery, answer, done, onReset, onAnswerUpdate }) => {
  // State for follow-up questions
  const [followUpQuery, setFollowUpQuery] = useState<string>("");
  const [isAskingFollowUp, setIsAskingFollowUp] = useState<boolean>(false);
  const [previousMessages, setPreviousMessages] = useState<Message[]>([
    { role: "user", content: searchQuery.query },
    { role: "assistant", content: answer }
  ]);

  // State for UI
  const [copied, setCopied] = useState<boolean>(false);
  const [liked, setLiked] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Refs
  const answerRef = useRef<HTMLDivElement>(null);
  const followUpInputRef = useRef<HTMLInputElement>(null);

  // Handle follow-up question submission
  const handleFollowUpSearch = async () => {
    if (!followUpQuery) {
      setErrorMessage("Please enter a follow-up question");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    setIsAskingFollowUp(true);
    setErrorMessage("");

    try {
      // Add the follow-up question to the conversation history
      const updatedMessages: Message[] = [
        ...previousMessages,
        { role: "user", content: followUpQuery, timestamp: new Date().toISOString() } as Message
      ];

      // Clear the previous answer
      onAnswerUpdate("");

      // Send the request to the API
      const response = await fetch("/api/answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: followUpQuery,
          previousMessages: updatedMessages
        })
      });

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      // Parse the JSON response
      const data = await response.json();

      if (data.content) {
        // Update the answer with the response content
        onAnswerUpdate(data.content);

        // Update the conversation history with timestamp
        const newMessage = {
          role: "assistant",
          content: data.content,
          timestamp: new Date().toISOString()
        } as Message;

        setPreviousMessages([...updatedMessages, newMessage]);

        // Reset the follow-up input
        setFollowUpQuery("");
      } else if (data.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error("Error asking follow-up:", err);
      setErrorMessage(err.message || "Error processing your follow-up question. Please try again.");
      onAnswerUpdate("Error processing your follow-up question. Please try again.");
    } finally {
      setIsAskingFollowUp(false);
    }
  };

  // Handle keyboard input for follow-up
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleFollowUpSearch();
    }
  };

  // Copy answer to clipboard
  const copyToClipboard = () => {
    if (!answerRef.current) return;

    const text = answerRef.current.innerText;
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
        setErrorMessage("Failed to copy to clipboard");
        setTimeout(() => setErrorMessage(""), 3000);
      });
  };

  // Share answer
  const shareAnswer = () => {
    if (navigator.share) {
      navigator.share({
        title: `Vsearch: ${searchQuery.query}`,
        text: answer,
        url: window.location.href
      }).catch(err => {
        console.error('Error sharing: ', err);
        setErrorMessage("Error sharing content");
        setTimeout(() => setErrorMessage(""), 3000);
      });
    } else {
      // Fallback for browsers that don't support navigator.share
      copyToClipboard();
    }
  };

  // Download answer as text file
  const downloadAnswer = () => {
    const element = document.createElement("a");
    const file = new Blob([
      `Query: ${searchQuery.query}\n\n`,
      `Answer:\n${answer}\n\n`,
      `Sources:\n${searchQuery.sourceLinks.map((link, i) => `[${i + 1}] ${link}`).join('\n')}`
    ], {type: 'text/plain'});

    element.href = URL.createObjectURL(file);
    element.download = `vsearch-${searchQuery.query.slice(0, 20).replace(/[^a-z0-9]/gi, '-')}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Like the answer
  const handleLike = () => {
    setLiked(!liked);
  };

  // Share on Twitter
  const shareOnTwitter = () => {
    const tweetText = encodeURIComponent(`"${searchQuery.query}"\n\n${answer.slice(0, 200)}... (via Vsearch)`);
    window.open(`https://twitter.com/intent/tweet?text=${tweetText}`, '_blank');
  };

  // Format source URL for display
  const formatSourceUrl = (url: string): string => {
    try {
      const { hostname, pathname } = new URL(url);
      const domain = hostname.replace(/^www\./, '');
      const path = pathname === '/' ? '' : pathname.split('/').slice(0, 2).join('/');
      return `${domain}${path}${path ? '...' : ''}`;
    } catch {
      return url;
    }
  };

  // Save to history when component mounts
  useEffect(() => {
    if (done && answer) {
      saveToHistory(searchQuery, answer);
    }
  }, [done, answer, searchQuery]);

  // Focus follow-up input when answer is done
  useEffect(() => {
    if (done && followUpInputRef.current) {
      followUpInputRef.current.focus();
    }
  }, [done]);

  return (
    <div className="max-w-[900px] mx-auto space-y-6 py-8 px-4 sm:px-6 lg:px-8 pb-32">
      {/* Query */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-medium text-gray-900 dark:text-gray-100 break-words">
          {searchQuery.query}
        </h1>

        <div className="flex items-center space-x-2 mt-2 sm:mt-0">
          <button
            onClick={onReset}
            className="flex items-center space-x-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 text-sm hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors"
          >
            <IconReload size={14} />
            <span>New Search</span>
          </button>
        </div>
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="rounded-md bg-red-100 dark:bg-red-900/30 p-3 text-red-800 dark:text-red-200">
          <p>{errorMessage}</p>
        </div>
      )}

      {/* Answer card */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-md overflow-hidden border border-gray-200 dark:border-zinc-700">
        {/* Answer header */}
        <div className="border-b border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 px-4 py-3 flex justify-between items-center">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Answer</div>

          <div className="flex space-x-2">
            <button
              onClick={copyToClipboard}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <IconCheck size={18} className="text-green-500" /> : <IconCopy size={18} />}
            </button>

            <button
              onClick={shareAnswer}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              title="Share"
            >
              <IconShare size={18} />
            </button>

            <button
              onClick={downloadAnswer}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              title="Download as text"
            >
              <IconDownload size={18} />
            </button>

            <button
              onClick={handleLike}
              className={`${liked ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'} hover:text-blue-600 transition-colors`}
              title="Like this answer"
            >
              <IconThumbUp size={18} />
            </button>
          </div>
        </div>

        {/* Answer content */}
        <div className="px-4 py-4 sm:px-6">
          <div
            ref={answerRef}
            className="prose dark:prose-invert prose-blue max-w-none"
          >
            {formatAnswer(answer, searchQuery.sourceLinks)}
          </div>
        </div>
      </div>

      {/* Sources section */}
      {done && (
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-md overflow-hidden border border-gray-200 dark:border-zinc-700">
          <div className="border-b border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 px-4 py-3">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Sources</div>
          </div>

          <div className="px-4 py-3 sm:px-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {searchQuery.sourceLinks.map((source, index) => (
                <a
                  key={index}
                  className="flex items-start p-3 rounded-lg border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={source}
                >
                  <div className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-xs font-medium mr-3">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {formatSourceUrl(source)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center mt-1">
                      <IconExternalLink size={12} className="mr-1" />
                      <span>View source</span>
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Follow-up question section */}
      {done && (
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-md overflow-hidden border border-gray-200 dark:border-zinc-700">
          <div className="border-b border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 px-4 py-3">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Ask a follow-up question</div>
          </div>

          <div className="px-4 py-4 sm:px-6">
            <div className="relative">
              <IconSearch className="absolute top-3 left-3 h-5 w-5 text-gray-400 dark:text-gray-500" />

              <input
                ref={followUpInputRef}
                className="block w-full rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 pl-10 pr-12 py-2 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                type="text"
                placeholder="Ask a follow-up question..."
                value={followUpQuery}
                onChange={(e) => setFollowUpQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isAskingFollowUp}
              />

              <button
                onClick={handleFollowUpSearch}
                disabled={isAskingFollowUp || !followUpQuery}
                className={`absolute right-2 top-2 rounded-md px-2 py-1 text-sm ${
                  isAskingFollowUp || !followUpQuery
                    ? "bg-gray-300 dark:bg-zinc-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                }`}
              >
                {isAskingFollowUp ? "Processing..." : "Ask"}
              </button>
            </div>

            {isAskingFollowUp && (
              <div className="mt-3 text-sm text-gray-500 dark:text-gray-400 flex items-center">
                <div className="mr-2 h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
                Processing your follow-up question...
              </div>
            )}

            {/* Conversation history */}
            {previousMessages.length > 2 && (
              <div className="mt-4 border-t border-gray-200 dark:border-zinc-700 pt-4">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Previous messages</h3>
                <div className="space-y-3">
                  {previousMessages.slice(2).map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`rounded-lg px-3 py-2 max-w-[80%] text-sm ${
                        msg.role === 'user'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                          : 'bg-gray-100 dark:bg-zinc-700 text-gray-800 dark:text-gray-200'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Share section */}
      {done && (
        <div className="flex justify-center space-x-4 pt-2">
          <button
            onClick={shareOnTwitter}
            className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
          >
            <IconBrandTwitter size={18} />
            <span>Share on Twitter</span>
          </button>
        </div>
      )}
    </div>
  );
};

// Format answer with source links
function formatAnswer(answer: string, sourceLinks: string[]): JSX.Element {
  // Replace [1], [2], etc. with linked citations
  const formattedText = answer.split(/(\[\d+\])/).map((part, index) => {
    const match = part.match(/\[(\d+)\]/);
    if (match) {
      const sourceIndex = parseInt(match[1]) - 1;
      if (sourceIndex >= 0 && sourceIndex < sourceLinks.length) {
        return (
          <a
            key={index}
            href={sourceLinks[sourceIndex]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
          >
            {part}
          </a>
        );
      }
    }
    return part;
  });

  return <>{formattedText}</>;
}

// Legacy function for backward compatibility
function replaceSourcesWithLinks(answer: string, sourceLinks: string[]): JSX.Element {
  return formatAnswer(answer, sourceLinks);
}
