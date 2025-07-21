/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, AlertCircle, Loader2, Database, Clock } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import CallRecord from "@/types/CallRecord";

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  error?: boolean;
  queryType?: string;
  metadata?: {
    tokensUsed?: number;
    model?: string;
    dataPoints?: number;
    processingTime?: number;
  };
}

interface CallRecordsChatProps {
  filteredRecords: CallRecord[];
  totalRecords: number;
  loading: boolean;
}

// Enhanced markdown components (keeping your existing ones)
const MarkdownComponents = {
  h1: ({ children }: any) => (
    <h1 className="text-lg font-bold mb-2 text-black">{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-base font-semibold mb-2 text-black">{children}</h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-sm font-medium mb-1 text-black">{children}</h3>
  ),
  p: ({ children }: any) => (
    <p className="mb-2 text-black leading-relaxed">{children}</p>
  ),
  ul: ({ children }: any) => (
    <ul className="list-disc list-inside mb-2 space-y-1 text-black">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal list-inside mb-2 space-y-1 text-black">{children}</ol>
  ),
  li: ({ children }: any) => (
    <li className="text-black">{children}</li>
  ),
  strong: ({ children }: any) => (
    <strong className="font-semibold text-black">{children}</strong>
  ),
  em: ({ children }: any) => (
    <em className="italic text-black">{children}</em>
  ),
  code: ({ children }: any) => (
    <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono text-black">{children}</code>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-emerald-800 pl-4 italic text-black mb-2">
      {children}
    </blockquote>
  ),
};

// Enhanced data size calculation
const calculateDataComplexity = (records: CallRecord[]): {
  complexity: 'low' | 'medium' | 'high' | 'extreme';
  estimatedTokens: number;
  recommendation: string;
} => {
  const recordCount = records.length;
  const avgFieldsPerRecord = 15; // Approximate
  const estimatedTokens = recordCount * avgFieldsPerRecord * 1.5; // Rough token estimation
  
  if (recordCount < 100) {
    return {
      complexity: 'low',
      estimatedTokens,
      recommendation: 'Full dataset analysis recommended'
    };
  } else if (recordCount < 1000) {
    return {
      complexity: 'medium', 
      estimatedTokens,
      recommendation: 'Smart aggregation will be applied'
    };
  } else if (recordCount < 5000) {
    return {
      complexity: 'high',
      estimatedTokens,
      recommendation: 'Statistical sampling will be used'
    };
  } else {
    return {
      complexity: 'extreme',
      estimatedTokens,
      recommendation: 'Advanced chunking strategy required'
    };
  }
};

// Client-side caching for similar queries
const queryCache = new Map<string, { response: string; timestamp: number; metadata: any }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const getCachedResponse = (query: string, recordCount: number): any | null => {
  const cacheKey = `${query.toLowerCase().trim()}_${recordCount}`;
  const cached = queryCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached;
  }
  
  // Clean old entries
  for (const [key, value] of queryCache.entries()) {
    if (Date.now() - value.timestamp > CACHE_DURATION) {
      queryCache.delete(key);
    }
  }
  
  return null;
};

const setCachedResponse = (query: string, recordCount: number, response: string, metadata: any) => {
  const cacheKey = `${query.toLowerCase().trim()}_${recordCount}`;
  queryCache.set(cacheKey, {
    response,
    metadata,
    timestamp: Date.now()
  });
};

// Enhanced query classification with complexity awareness
const classifyQuery = (query: string, recordCount: number): { 
  type: string; 
  priority: 'low' | 'medium' | 'high';
  complexity: 'simple' | 'complex';
} => {
  const lowerQuery = query.toLowerCase();
  let type = 'general';
  let complexity: 'simple' | 'complex' = 'simple';
  let priority: 'low' | 'medium' | 'high' = 'medium';
  
  // Determine query type
  if (lowerQuery.includes('disposition') || lowerQuery.includes('outcome')) {
    type = 'disposition';
    // Disposition queries are simple but require full data
    complexity = 'simple';
    priority = 'high';
  } else if (lowerQuery.includes('sentiment') || lowerQuery.includes('satisfaction')) {
    type = 'sentiment';
  } else if (lowerQuery.includes('agent') || lowerQuery.includes('performance')) {
    type = 'agent_performance';
    complexity = 'complex';
  } else if (lowerQuery.includes('time') || lowerQuery.includes('duration')) {
    type = 'timing';
  } else if (lowerQuery.includes('queue') || lowerQuery.includes('department')) {
    type = 'queue_analysis';
  } else if (lowerQuery.includes('summary') || lowerQuery.includes('overview')) {
    type = 'summary';
    complexity = 'complex';
    priority = 'high';
  } else if (lowerQuery.includes('trend') || lowerQuery.includes('pattern')) {
    type = 'trends';
    complexity = 'complex';
  }
  
  // Adjust complexity based on record count (except for disposition)
  if (recordCount > 1000 && type !== 'disposition') {
    complexity = 'complex';
  }
  
  return { type, priority, complexity };
};

// IMPROVED: Prepare data based on query type - no sampling for disposition queries
const prepareQueryData = (records: CallRecord[], queryType: string, complexity: 'simple' | 'complex') => {
  // For disposition queries, ALWAYS use all records
  if (queryType === 'disposition') {
    return {
      originalRecords: records, // Send all records for accurate counting
      type: 'disposition',
      queryNote: 'Using complete dataset for accurate disposition counts'
    };
  }
  
  // For other queries, we can use sampling for performance
  const maxRecords = complexity === 'simple' ? 500 : 1000;
  const workingRecords = records.length > maxRecords 
    ? getRandomSample(records, maxRecords) 
    : records;
  
  return {
    originalRecords: workingRecords,
    type: queryType,
    queryNote: records.length > maxRecords 
      ? `Using ${maxRecords} representative samples from ${records.length} total records`
      : `Using all ${records.length} records`
  };
};

// Random sampling function for better representation
const getRandomSample = (records: CallRecord[], maxRecords: number): CallRecord[] => {
  if (records.length <= maxRecords) return records;
  
  const sampleIndices = new Set<number>();
  while (sampleIndices.size < maxRecords) {
    const randomIndex = Math.floor(Math.random() * records.length);
    sampleIndices.add(randomIndex);
  }
  
  return Array.from(sampleIndices).map(i => records[i]);
};

// Legacy function for backward compatibility (simplified)
// const prepareSmartDataEnhanced = (records: CallRecord[], queryType: string, totalCount: number) => {
  // This is kept for any remaining legacy calls, but the main logic is now in prepareQueryData
  // return prepareQueryData(records, queryType, 'simple');
// };

const CallRecordsChat: React.FC<CallRecordsChatProps> = ({
  filteredRecords,
  loading
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: "Welcome to PRISM AI Analytics!\n\nI'm your intelligent call center analytics assistant. What would you like to explore?",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [dataComplexity, setDataComplexity] = useState<ReturnType<typeof calculateDataComplexity> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Calculate data complexity when records change
  useEffect(() => {
    if (filteredRecords.length > 0) {
      setDataComplexity(calculateDataComplexity(filteredRecords));
    }
  }, [filteredRecords]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Enhanced retry logic with exponential backoff
  const handleSendMessage = useCallback(async (customQuery?: string) => {
    const queryText = customQuery || inputValue.trim();
    if (!queryText || loading || isTyping) return;

    // Check cache first
    const cachedResponse = getCachedResponse(queryText, filteredRecords.length);
    if (cachedResponse) {
      const userMessage: Message = {
        id: Date.now().toString(),
        type: 'user',
        content: queryText,
        timestamp: new Date()
      };

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: cachedResponse.response + "\n\n*📋 Cached result for faster response*",
        timestamp: new Date(),
        metadata: cachedResponse.metadata
      };

      setMessages(prev => [...prev, userMessage, assistantMessage]);
      if (!customQuery) setInputValue("");
      return;
    }

    const startTime = Date.now();
    const queryClassification = classifyQuery(queryText, filteredRecords.length);
    
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: queryText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    if (!customQuery) setInputValue("");
    setIsTyping(true);
    setRetryCount(0);

    const attemptQuery = async (retryAttempt = 0): Promise<void> => {
      try {
        // Use the improved data preparation
        const queryData = prepareQueryData(
          filteredRecords, 
          queryClassification.type, 
          queryClassification.complexity
        );
        
        console.log(`🔍 Query Type: ${queryClassification.type} | Records: ${queryData.originalRecords.length} | Note: ${queryData.queryNote}`);
        
        const response = await fetch('/api/openai/query-calls', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: queryText,
            callData: queryData,
            queryType: queryClassification.type
          }),
        });

        const data = await response.json();

        if (response.status === 429 && retryAttempt < 5) {
          // Enhanced exponential backoff
          const delay = Math.min(Math.pow(2, retryAttempt) * 1000, 30000); // Max 30s delay
          await new Promise(resolve => setTimeout(resolve, delay));
          setRetryCount(retryAttempt + 1);
          return attemptQuery(retryAttempt + 1);
        }

        if (!response.ok) {
          throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        if (data.error) {
          throw new Error(data.error);
        }

        const processingTime = Date.now() - startTime;
        let responseContent = data.response;
        
        // Add accuracy note for disposition queries
        if (queryClassification.type === 'disposition') {
          responseContent += `\n\n*✅ **Accuracy Note:** These disposition counts are exact - analyzed from your complete dataset of ${filteredRecords.length.toLocaleString()} records.*`;
        }
        
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: responseContent,
          timestamp: new Date(),
          queryType: queryClassification.type,
          metadata: {
            ...data.metadata,
            processingTime
          }
        };

        setMessages(prev => [...prev, assistantMessage]);
        
        // Cache successful responses
        setCachedResponse(queryText, filteredRecords.length, data.response, data.metadata);
        
      } catch (error) {
        console.error('Error calling OpenAI:', error);
        
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: `❌ **Analysis Error**\n\n${error instanceof Error ? error.message : 'Unknown error occurred'}\n\n**Suggestions:**\n• Try a more specific question\n• Use one of the quick prompts below\n• Filter your dataset if it's very large\n• Wait a moment and try again`,
          timestamp: new Date(),
          error: true
        };

        setMessages(prev => [...prev, errorMessage]);
      } finally {
        setIsTyping(false);
        setRetryCount(0);
      }
    };

    await attemptQuery();
  }, [inputValue, loading, isTyping, filteredRecords]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Enhanced smart prompts based on data complexity and query types
  const getSmartPrompts = () => {
    const basePrompts = [
      "Show me exact disposition breakdown with counts",
      "Analyse customer sentiment trends",
      "What are our average call times?",
    ];

    if (filteredRecords.length > 1000) {
      return [
        ...basePrompts.slice(0, 2), // Keep the disposition prompts at the top
        "Identify top performing agents",
        "Show queue efficiency metrics",
        "What are the main customer issues?",
        "Analyse peak call times and patterns"
      ];
    }

    return [
      ...basePrompts,
      "Compare agent performance metrics",
      "Which queues need attention?",
      "Show calls exceeding 15 minutes",
      "Identify improvement opportunities"
    ];
  };

  return (
    <div className="flex flex-col h-full bg-black rounded-lg shadow-xl">
      {/* Enhanced Header with Data Insights */}
      <div className="flex items-center gap-3 p-4 bg-black rounded-t-lg">
        <div className="flex-1">
          <h3 className="font-bold text-white text-lg">PRISM AI Analytics</h3>
          <div className="flex items-center gap-4 text-sm text-white">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-800 rounded-full animate-pulse"></span>
              {loading ? 'Loading data...' : `${filteredRecords.length.toLocaleString()} records`}
            </span>
            {dataComplexity && (
              <span className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                <span className={`px-2 py-1 rounded text-xs ${
                  dataComplexity.complexity === 'low' ? 'bg-green-800' :
                  dataComplexity.complexity === 'medium' ? 'bg-yellow-800' :
                  dataComplexity.complexity === 'high' ? 'bg-orange-800' : 'bg-red-800'
                }`}>
                  {dataComplexity.complexity.toUpperCase()}
                </span>
                <span className="text-xs">{dataComplexity.recommendation}</span>
              </span>
            )}
            <span className="flex items-center gap-1 text-xs bg-emerald-800 px-2 py-1 rounded">
              ✅ Accurate Counts
            </span>
          </div>
        </div>
        {retryCount > 0 && (
          <div className="flex items-center gap-2 text-white text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Retry {retryCount}/5
          </div>
        )}
      </div>

      {/* Messages with enhanced metadata display */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-800">
        {filteredRecords.length === 0 && !loading && (
          <div className="flex items-center gap-3 p-4 bg-white border border-emerald-800 rounded-lg">
            <AlertCircle className="w-5 h-5 text-emerald-800" />
            <div className="text-sm text-black">
              No call records available for analysis. Please adjust your filters or check your data source.
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] ${message.type === 'user' ? 'order-1' : ''}`}>
              <div
                className={`rounded-xl px-4 py-3 shadow-lg text-sm ${
                  message.type === 'user'
                    ? 'bg-emerald-800 text-white'
                    : message.error
                    ? 'bg-white text-black border border-red-300'
                    : 'bg-white text-black border border-emerald-800'
                }`}
              >
                {message.type === 'assistant' && !message.error ? (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown components={MarkdownComponents}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-inherit">
                    {message.content}
                  </div>
                )}
                
                {/* Enhanced metadata display */}
                {message.metadata && (
                  <div className="text-xs mt-2 pt-2 border-t border-gray-200 flex items-center gap-4 opacity-70">
                    {message.metadata.processingTime && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {(message.metadata.processingTime / 1000).toFixed(1)}s
                      </span>
                    )}
                    {message.metadata.dataPoints && (
                      <span>{message.metadata.dataPoints.toLocaleString()} data points</span>
                    )}
                    {message.queryType === 'disposition' && (
                      <span className="flex items-center gap-1 text-green-600">
                        ✅ Exact counts
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className={`text-xs text-white mt-1 ${
                message.type === 'user' ? 'text-right' : 'text-left'
              }`}>
                {formatTimestamp(message.timestamp)}
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3 justify-start">
            <div className="bg-white rounded-xl px-4 py-3 border border-emerald-800">
              <div className="flex items-center gap-2">
                <div className="text-sm text-black">
                  {dataComplexity?.complexity === 'extreme' 
                    ? 'Processing large dataset...' 
                    : 'Thinking...'}
                </div>
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-emerald-800 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-emerald-800 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-emerald-800 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Enhanced Input Section */}
      <div className="p-4 bg-black">
        <div className="flex gap-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              loading 
                ? "Loading data..." 
                : filteredRecords.length === 0
                ? "No data available for analysis..."
                : "Ask me anything about your call data - disposition counts are 100% accurate!"
            }
            disabled={loading || filteredRecords.length === 0 || isTyping}
            className="flex-1 px-4 py-3 bg-white border border-emerald-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800 focus:border-emerald-800 disabled:bg-white disabled:cursor-not-allowed text-black placeholder-emerald-800 text-sm shadow-inner"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim() || loading || filteredRecords.length === 0 || isTyping}
            className="px-6 py-3 bg-emerald-800 text-white rounded-lg hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-800 focus:ring-offset-2 focus:ring-offset-black disabled:bg-white disabled:text-emerald-800 disabled:cursor-not-allowed transition-all duration-200 shadow-lg border border-emerald-800"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        
        {/* Smart prompts */}
        {filteredRecords.length > 0 && (
          <div className="mt-3">
            <div className="grid grid-cols-2 gap-2">
              {getSmartPrompts().map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSendMessage(prompt)}
                  disabled={loading || isTyping}
                  className="px-3 py-2 text-xs bg-white hover:bg-emerald-800 text-black hover:text-white rounded-md transition-colors disabled:opacity-50 text-left border border-emerald-800"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Enhanced status information */}
        {filteredRecords.length > 0 && (
          <div className="text-xs text-white mt-3 flex items-center justify-between">
            <span>
              ✅ Exact disposition counting: {filteredRecords.length.toLocaleString()} records
              {dataComplexity && (
                <span className="ml-2 px-2 py-1 bg-neutral-700 rounded">
                  {dataComplexity.complexity} complexity
                </span>
              )}
            </span>
            {queryCache.size > 0 && (
              <span className="text-emerald-400">
                📋 {queryCache.size} cached responses
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CallRecordsChat;