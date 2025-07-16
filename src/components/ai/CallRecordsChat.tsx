/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef, useEffect } from "react";
import { Send, AlertCircle, Loader2 } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import CallRecord from "@/types/CallRecord";

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  error?: boolean;
  queryType?: string;
}

interface CallRecordsChatProps {
  filteredRecords: CallRecord[];
  totalRecords: number;
  loading: boolean;
}

// markdown component styling
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
  hr: () => (
    <hr className="my-3 border-gray-300" />
  ),
  table: ({ children }: any) => (
    <div className="overflow-x-auto mb-2">
      <table className="min-w-full border-collapse border border-gray-300">
        {children}
      </table>
    </div>
  ),
  th: ({ children }: any) => (
    <th className="border border-gray-300 px-3 py-2 bg-gray-100 text-left font-semibold text-black">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="border border-gray-300 px-3 py-2 text-black">{children}</td>
  ),
};

const formatAIResponse = (content: string): string => {
  // Remove excessive line breaks
  content = content.replace(/\n{3,}/g, '\n\n');
  
  // Ensure proper spacing around headers
  content = content.replace(/^(#{1,3})\s*(.+)$/gm, '$1 $2\n');
  
  // Clean up bullet points
  content = content.replace(/^[•·-]\s*/gm, '• ');
  
  // Add proper spacing around sections
  content = content.replace(/^(#{1,3}.*?)$/gm, '\n$1');
  
  return content.trim();
};

// Query classification for smart data processing
const classifyQuery = (query: string): string => {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('disposition') || lowerQuery.includes('outcome') || lowerQuery.includes('result')) {
    return 'disposition';
  }
  if (lowerQuery.includes('sentiment') || lowerQuery.includes('satisfaction') || lowerQuery.includes('emotion')) {
    return 'sentiment';
  }
  if (lowerQuery.includes('agent') || lowerQuery.includes('performance') || lowerQuery.includes('staff')) {
    return 'agent_performance';
  }
  if (lowerQuery.includes('time') || lowerQuery.includes('duration') || lowerQuery.includes('wait') || lowerQuery.includes('hold')) {
    return 'timing';
  }
  if (lowerQuery.includes('queue') || lowerQuery.includes('department')) {
    return 'queue_analysis';
  }
  if (lowerQuery.includes('trend') || lowerQuery.includes('pattern') || lowerQuery.includes('over time')) {
    return 'trends';
  }
  if (lowerQuery.includes('summary') || lowerQuery.includes('overview') || lowerQuery.includes('executive')) {
    return 'summary';
  }
  if (lowerQuery.includes('category') || lowerQuery.includes('topic') || lowerQuery.includes('issue')) {
    return 'categories';
  }
  
  return 'general';
};

// Helper function to extract sentiment from the sentiment_analysis field
const extractSentiment = (sentimentAnalysis: any): string => {
  if (!sentimentAnalysis) return 'Unknown';
  
  if (Array.isArray(sentimentAnalysis) && sentimentAnalysis.length > 0) {
    return sentimentAnalysis[0].sentiment || 'Unknown';
  } else if (typeof sentimentAnalysis === 'string') {
    return sentimentAnalysis;
  }
  
  return 'Unknown';
};

// Helper function to extract duration in seconds from call_duration field
const extractDuration = (duration: any): number => {
  if (!duration) return 0;
  
  if (typeof duration === 'number') {
    return duration;
  } else if (typeof duration === 'object' && duration.minutes !== undefined && duration.seconds !== undefined) {
    return (duration.minutes * 60) + duration.seconds;
  }
  
  return 0;
};

// Helper function to extract time in seconds from time fields
const extractTime = (time: any): number => {
  if (!time) return 0;
  
  if (typeof time === 'number') {
    return time;
  } else if (typeof time === 'object' && time.minutes !== undefined && time.seconds !== undefined) {
    return (time.minutes * 60) + time.seconds;
  }
  
  return 0;
};

// Smart data aggregation based on query type
const prepareSmartData = (records: CallRecord[], queryType: string) => {
  const baseStats = {
    totalRecords: records.length,
    dateRange: records.length > 0 ? {
      earliest: records.map(r => r.initiation_timestamp).filter(Boolean).sort()[0],
      latest: records.map(r => r.initiation_timestamp).filter(Boolean).sort().reverse()[0]
    } : null
  };

  switch (queryType) {
    case 'disposition':
      const dispositions = records.reduce((acc, record) => {
        const disp = record.disposition_title || 'Unknown';
        acc[disp] = (acc[disp] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      return {
        type: 'disposition',
        data: {
          dispositions,
          totalCalls: records.length,
          ...baseStats
        }
      };

    case 'sentiment':
      const sentimentCounts = records.reduce((acc, record) => {
        const sentiment = extractSentiment(record.sentiment_analysis);
        acc[sentiment] = (acc[sentiment] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      return {
        type: 'sentiment',
        data: {
          sentimentBreakdown: sentimentCounts,
          totalAnalysed: records.filter(r => r.sentiment_analysis && (Array.isArray(r.sentiment_analysis) ? r.sentiment_analysis.length > 0 : true)).length,
          ...baseStats
        }
      };

    case 'agent_performance':
      const agentStats = records.reduce((acc, record) => {
        const agent = record.agent_username || 'Unknown';
        if (!acc[agent]) {
          acc[agent] = {
            totalCalls: 0,
            totalDuration: 0,
            totalHoldTime: 0,
            dispositions: {},
            sentiments: {}
          };
        }
        
        acc[agent].totalCalls++;
        acc[agent].totalDuration += extractDuration(record.call_duration);
        acc[agent].totalHoldTime += extractTime(record.total_hold_time);
        
        const disp = record.disposition_title || 'Unknown';
        acc[agent].dispositions[disp] = (acc[agent].dispositions[disp] || 0) + 1;
        
        if (record.sentiment_analysis) {
          const sentiment = extractSentiment(record.sentiment_analysis);
          acc[agent].sentiments[sentiment] = (acc[agent].sentiments[sentiment] || 0) + 1;
        }
        
        return acc;
      }, {} as Record<string, any>);
      
      return {
        type: 'agent_performance',
        data: {
          agentMetrics: agentStats,
          totalAgents: Object.keys(agentStats).length,
          ...baseStats
        }
      };

    case 'timing':
      const timingStats = {
        avgCallDuration: records.reduce((sum, r) => sum + extractDuration(r.call_duration), 0) / records.length,
        avgHoldTime: records.reduce((sum, r) => sum + extractTime(r.total_hold_time), 0) / records.length,
        avgQueueTime: records.reduce((sum, r) => sum + extractTime(r.time_in_queue), 0) / records.length,
        durationDistribution: {
          short: records.filter(r => extractDuration(r.call_duration) < 300).length,
          medium: records.filter(r => extractDuration(r.call_duration) >= 300 && extractDuration(r.call_duration) < 900).length,
          long: records.filter(r => extractDuration(r.call_duration) >= 900).length
        },
        ...baseStats
      };
      
      return {
        type: 'timing',
        data: timingStats
      };

    case 'queue_analysis':
      const queueStats = records.reduce((acc, record) => {
        const queue = record.queue_name || 'Unknown';
        if (!acc[queue]) {
          acc[queue] = {
            totalCalls: 0,
            avgWaitTime: 0,
            avgCallDuration: 0,
            dispositions: {}
          };
        }
        
        acc[queue].totalCalls++;
        acc[queue].avgWaitTime += extractTime(record.time_in_queue);
        acc[queue].avgCallDuration += extractDuration(record.call_duration);
        
        const disp = record.disposition_title || 'Unknown';
        acc[queue].dispositions[disp] = (acc[queue].dispositions[disp] || 0) + 1;
        
        return acc;
      }, {} as Record<string, any>);
      
      // Calculate averages
      Object.keys(queueStats).forEach(queue => {
        queueStats[queue].avgWaitTime = queueStats[queue].avgWaitTime / queueStats[queue].totalCalls;
        queueStats[queue].avgCallDuration = queueStats[queue].avgCallDuration / queueStats[queue].totalCalls;
      });
      
      return {
        type: 'queue_analysis',
        data: {
          queueMetrics: queueStats,
          totalQueues: Object.keys(queueStats).length,
          ...baseStats
        }
      };

    case 'categories':
      const categoryStats = records.reduce((acc, record) => {
        const category = record.primary_category || 'Uncategorized';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      return {
        type: 'categories',
        data: {
          categoryBreakdown: categoryStats,
          ...baseStats
        }
      };

    case 'summary':
      return {
        type: 'summary',
        data: {
          overview: {
            totalCalls: records.length,
            uniqueAgents: new Set(records.map(r => r.agent_username).filter(Boolean)).size,
            uniqueQueues: new Set(records.map(r => r.queue_name).filter(Boolean)).size,
            avgCallDuration: records.reduce((sum, r) => sum + extractDuration(r.call_duration), 0) / records.length,
            avgHoldTime: records.reduce((sum, r) => sum + extractTime(r.total_hold_time), 0) / records.length,
            topDispositions: Object.entries(
              records.reduce((acc, r) => {
                const disp = r.disposition_title || 'Unknown';
                acc[disp] = (acc[disp] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).sort(([,a], [,b]) => b - a).slice(0, 5),
            sentimentDistribution: records.reduce((acc, r) => {
              const sentiment = extractSentiment(r.sentiment_analysis);
              acc[sentiment] = (acc[sentiment] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          },
          ...baseStats
        }
      };

    default:
      // For general queries, provide a balanced sample with key metrics
      const sampleSize = Math.min(10, records.length);
      const sampleRecords = records.slice(0, sampleSize).map(record => ({
        id: record.id,
        agent_username: record.agent_username,
        queue_name: record.queue_name,
        call_duration: extractDuration(record.call_duration),
        disposition_title: record.disposition_title,
        sentiment_analysis: extractSentiment(record.sentiment_analysis),
        primary_category: record.primary_category
      }));
      
      return {
        type: 'general',
        data: {
          sampleRecords,
          quickStats: {
            totalRecords: records.length,
            avgDuration: records.reduce((sum, r) => sum + extractDuration(r.call_duration), 0) / records.length,
            topDisposition: Object.entries(
              records.reduce((acc, r) => {
                const disp = r.disposition_title || 'Unknown';
                acc[disp] = (acc[disp] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).sort(([,a], [,b]) => b - a)[0]?.[0] || 'None'
          },
          ...baseStats
        }
      };
  }
};

const CallRecordsChat: React.FC<CallRecordsChatProps> = ({
  filteredRecords,
  loading
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: "Welcome to PRISM!\n\nI'm here to help you analyse your call data. I can provide insights on:\n\n• Disposition and outcome breakdowns\n• Agent performance metrics\n• Customer sentiment analysis\n• Call timing and queue analytics\n• Trending patterns\n• Executive summaries\n\nWhat would you like to explore first?",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (customQuery?: string) => {
    const queryText = customQuery || inputValue.trim();
    if (!queryText || loading || isTyping) return;

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
        const queryType = classifyQuery(queryText);
        const smartData = prepareSmartData(filteredRecords, queryType);
        
        const response = await fetch('/api/openai/query-calls', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: queryText,
            callData: smartData,
            queryType
          }),
        });

        if (response.status === 429 && retryAttempt < 3) {
          // Exponential backoff for rate limits
          const delay = Math.pow(2, retryAttempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          setRetryCount(retryAttempt + 1);
          return attemptQuery(retryAttempt + 1);
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }

        // Format the response content
        const formattedContent = formatAIResponse(data.response);

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: formattedContent,
          timestamp: new Date(),
          queryType
        };

        setMessages(prev => [...prev, assistantMessage]);
      } catch (error) {
        console.error('Error calling OpenAI:', error);
        
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: `❌ **Analysis Error**\n\n${error instanceof Error ? error.message : 'Unknown error occurred'}\n\nTip: Try rephrasing your question or use one of the quick prompts below.`,
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
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const smartPrompts = [
    "Show me disposition breakdown with percentages",
    "Compare agent performance metrics", 
    "Analyse customer sentiment trends",
    "What are our average call times by queue?",
    "Which agents have the best outcomes?",
    "Create an executive summary report",
    "Show me calls taking longer than 15 minutes",
    "What are the top customer issues?"
  ];

  return (
    <div className="flex flex-col h-full bg-black rounded-lg shadow-xl">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 bg-black rounded-t-lg">
        <div className="flex-1">
          <h3 className="font-bold text-white text-lg">PRISM AI Analytics</h3>
          <p className="text-sm text-white flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-800 rounded-full animate-pulse"></span>
            {loading ? 'Loading data...' : `${filteredRecords.length.toLocaleString()} records • AI-powered insights`}
          </p>
        </div>
        {retryCount > 0 && (
          <div className="flex items-center gap-2 text-white text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Retry {retryCount}/3
          </div>
        )}
      </div>

      {/* Messages */}
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
            {message.type === 'assistant' && (
              <div className="flex items-start">
              </div>
            )}
            
            <div className={`max-w-[85%] ${message.type === 'user' ? 'order-1' : ''}`}>
              <div
                className={`rounded-xl px-4 py-3 shadow-lg text-sm ${
                  message.type === 'user'
                    ? 'bg-emerald-800 text-white'
                    : message.error
                    ? 'bg-white text-black border border-emerald-800'
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
                {message.queryType && (
                  <div className="text-xs mt-2 opacity-70 italic">
                    Analysis type: {message.queryType.replace('_', ' ')}
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
                <div className="text-sm text-black">Thinking...</div>
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

      {/* Input */}
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
                : "Ask me anything about your call data..."
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
              {smartPrompts.map((prompt) => (
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
        
        {filteredRecords.length > 0 && (
          <div className="text-xs text-white mt-3 flex items-center justify-between">
            <span>Smart processing: Analysing {filteredRecords.length.toLocaleString()} records efficiently</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CallRecordsChat;