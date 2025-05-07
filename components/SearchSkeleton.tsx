import React from 'react';

interface SearchSkeletonProps {
  currentStage: SearchStage;
}

export type SearchStage = 
  | 'idle'
  | 'generating_queries'
  | 'fetching_sources'
  | 'synthesizing_answer';

const stageMessages: Record<SearchStage, string> = {
  idle: 'Initializing search...', // Should not typically be shown if loading is true
  generating_queries: 'Generating smarter questions...',
  fetching_sources: 'Gathering information from the web...',
  synthesizing_answer: 'Putting it all together for you...',
};

const SearchSkeleton: React.FC<SearchSkeletonProps> = ({ currentStage }) => {
  const stages: SearchStage[] = ['generating_queries', 'fetching_sources', 'synthesizing_answer'];
  const currentStageIndex = stages.indexOf(currentStage);

  return (
    <div className="flex items-center justify-center pt-64 sm:pt-72 flex-col w-full max-w-2xl mx-auto px-4">
      <div className="w-full">
        {stages.map((stage, index) => {
          const isActive = index === currentStageIndex;
          const isCompleted = index < currentStageIndex;
          const isFuture = index > currentStageIndex;

          return (
            <div key={stage} className="flex items-center mb-6">
              <div className="flex flex-col items-center mr-4">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 
                    ${isCompleted ? 'bg-blue-500 border-blue-500' : ''}
                    ${isActive ? 'bg-blue-500 border-blue-500 animate-pulse' : ''}
                    ${isFuture ? 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600' : ''}
                  `}
                >
                  {isCompleted && (
                    <svg className="w-5 h-5 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                      <path d="M5 13l4 4L19 7"></path>
                    </svg>
                  )}
                  {isActive && (
                    <div className="w-3 h-3 bg-white rounded-full"></div>
                  )}
                  {isFuture && (
                     <div className="w-3 h-3 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                  )}
                </div>
                {index < stages.length - 1 && (
                  <div className={`w-0.5 h-8 mt-1 transition-all duration-300 
                    ${isCompleted ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}
                  `}></div>
                )}
              </div>
              <div className={`transition-opacity duration-300 ${isActive || isCompleted ? 'opacity-100' : 'opacity-50'}`}>
                <h3 className={`text-lg font-medium ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'}`}>
                  {stageMessages[stage]}
                </h3>
                {isActive && (
                    <div className="h-2 w-32 bg-gray-300 dark:bg-gray-600 rounded-full mt-2 overflow-hidden">
                        <div className="h-full bg-blue-500 animate-progress-bar"></div>
                    </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <style jsx>{`
        .animate-progress-bar {
          animation: progressBarAnimation 2s linear infinite;
        }
        @keyframes progressBarAnimation {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
      <div className="mt-8 text-sm text-gray-500 dark:text-gray-400">
        Vsearch is working to find the best answer for you...
      </div>
    </div>
  );
};

export default SearchSkeleton;