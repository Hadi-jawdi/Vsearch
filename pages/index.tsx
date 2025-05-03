import { Answer } from "@/components/Answer";
import { Search } from "@/components/Search";
import { SearchQuery } from "@/types";
import { initTheme } from "@/utils/theme";
import { IconBrandGithub } from "@tabler/icons-react";
import Head from "next/head";
import { useEffect, useState } from "react";

export default function Home() {
  // State for search and answer
  const [searchQuery, setSearchQuery] = useState<SearchQuery>({ query: "", sourceLinks: [] });
  const [answer, setAnswer] = useState<string>("");
  const [done, setDone] = useState<boolean>(false);

  // Handle answer updates
  const handleAnswerUpdate = (value: string) => {
    setAnswer(value);
  };

  // Reset search
  const handleReset = () => {
    setAnswer("");
    setSearchQuery({ query: "", sourceLinks: [] });
    setDone(false);
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Initialize theme on component mount
  useEffect(() => {
    initTheme();

    // Add dark mode class to document for initial load
    const htmlElement = document.documentElement;
    if (localStorage.getItem('vsearch_theme') === 'dark' ||
        (!localStorage.getItem('vsearch_theme') &&
         window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      htmlElement.classList.add('dark');
    }
  }, []);

  return (
    <>
      <Head>
        <title>{searchQuery.query ? `${searchQuery.query} - Vsearch` : 'Vsearch - AI-powered search'}</title>
        <meta
          name="description"
          content="AI-powered search with Cerebras llama-4-scout model. Get accurate answers with sources."
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
        <link
          rel="icon"
          href="/favicon.png"
        />
        {/* Add Open Graph tags for better sharing */}
        <meta property="og:title" content={searchQuery.query ? `${searchQuery.query} - Vsearch` : 'Vsearch - AI-powered search'} />
        <meta property="og:description" content="AI-powered search with Cerebras llama-4-scout model. Get accurate answers with sources." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://vsearch.vercel.app" />
        <meta property="og:image" content="https://vsearch.vercel.app/og-image.png" />
        {/* Add Twitter card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={searchQuery.query ? `${searchQuery.query} - Vsearch` : 'Vsearch - AI-powered search'} />
        <meta name="twitter:description" content="AI-powered search with Cerebras llama-4-scout model. Get accurate answers with sources." />
        <meta name="twitter:image" content="https://vsearch.vercel.app/og-image.png" />
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-[#18181C] text-gray-900 dark:text-[#D4D4D8] transition-colors duration-300">
        {/* GitHub link */}
        <a
          className="absolute top-0 right-2 p-4 cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
          href="https://github.com/mckaywrigley/clarity-ai"
          target="_blank"
          rel="noreferrer"
          title="View on GitHub"
        >
          <IconBrandGithub size={24} />
        </a>

        {/* Main content */}
        {answer ? (
          <Answer
            searchQuery={searchQuery}
            answer={answer}
            done={done}
            onReset={handleReset}
            onAnswerUpdate={handleAnswerUpdate}
          />
        ) : (
          <Search
            onSearch={setSearchQuery}
            onAnswerUpdate={(value) => setAnswer((prev) => prev + value)}
            onDone={setDone}
          />
        )}

        {/* Footer */}
        <footer className="py-6 px-4 text-center text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-zinc-800">
          <p>Powered by Cerebras llama-4-scout-17b-16e-instruct</p>
          <p className="mt-1">© {new Date().getFullYear()} Vsearch</p>
        </footer>
      </div>
    </>
  );
}
