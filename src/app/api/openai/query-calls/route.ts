/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Enhanced rate limiting with different tiers
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const requestQueue = new Map<string, Array<{ resolve: Function; reject: Function; request: any }>>();

// Token estimation (rough approximation)
const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4); // Rough estimation: 1 token ≈ 4 characters
};

// Smart data sampling for large datasets - IMPROVED
const sampleData = (records: any[], maxSamples: number = 500): any[] => {
  if (records.length <= maxSamples) return records;
  
  // Use random sampling instead of just taking first N records
  const sampleIndices = new Set<number>();
  while (sampleIndices.size < maxSamples) {
    const randomIndex = Math.floor(Math.random() * records.length);
    sampleIndices.add(randomIndex);
  }
  
  return Array.from(sampleIndices).map(i => records[i]);
};

// Enhanced data preparation that handles disposition counts properly
const prepareAccurateData = (records: any[], queryType: string): any => {
  // For disposition queries, ALWAYS use all records for accurate counts
  if (queryType === 'disposition') {
    const dispositions: Record<string, number> = records.reduce((acc, record) => {
      const disp = record.disposition_title || 'Unknown';
      acc[disp] = (acc[disp] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate percentages with proper typing - avoid Object.entries() issue
    const total = records.length;
    interface DispositionWithPercentage {
      title: string;
      count: number;
      percentage: string;
    }
    
    const dispositionsWithPercentages: DispositionWithPercentage[] = [];
    for (const [title, count] of Object.entries(dispositions)) {
      dispositionsWithPercentages.push({
        title,
        count: count as number,
        percentage: total > 0 ? ((count as number / total) * 100).toFixed(2) : '0.00'
      });
    }
    
    // Sort by count descending
    dispositionsWithPercentages.sort((a, b) => b.count - a.count);

    return {
      type: 'disposition',
      data: {
        totalRecords: total,
        dispositions: dispositions,
        dispositionsWithPercentages,
        dateRange: records.length > 0 ? {
          earliest: records.map(r => r.initiation_timestamp).filter(Boolean).sort()[0],
          latest: records.map(r => r.initiation_timestamp).filter(Boolean).sort().reverse()[0]
        } : null,
        analysisNote: `Complete analysis of all ${total} records`
      }
    };
  }

  // For other query types, we can still use sampling but with better logic
  return prepareSmartData(records, queryType);
};

// Original smart data function for non-disposition queries
const prepareSmartData = (records: any[], queryType: string): any => {
  const maxRecords = 1000; // Increased limit for better accuracy
  const workingRecords = records.length > maxRecords ? sampleData(records, maxRecords) : records;
  const samplingRatio = workingRecords.length / records.length;

  const baseStats = {
    totalRecords: records.length,
    analysedRecords: workingRecords.length,
    samplingRatio,
    dateRange: records.length > 0 ? {
      earliest: records.map(r => r.initiation_timestamp).filter(Boolean).sort()[0],
      latest: records.map(r => r.initiation_timestamp).filter(Boolean).sort().reverse()[0]
    } : null
  };

  // Helper functions
  const extractSentiment = (sentimentAnalysis: any): string => {
    if (!sentimentAnalysis) return 'Unknown';
    if (Array.isArray(sentimentAnalysis) && sentimentAnalysis.length > 0) {
      return sentimentAnalysis[0].sentiment || 'Unknown';
    } else if (typeof sentimentAnalysis === 'string') {
      return sentimentAnalysis;
    }
    return 'Unknown';
  };

  const extractDuration = (duration: any): number => {
    if (!duration) return 0;
    if (typeof duration === 'number') {
      return duration;
    } else if (typeof duration === 'object' && duration.minutes !== undefined && duration.seconds !== undefined) {
      return (duration.minutes * 60) + duration.seconds;
    }
    return 0;
  };

  const extractTime = (time: any): number => {
    if (!time) return 0;
    if (typeof time === 'number') {
      return time;
    } else if (typeof time === 'object' && time.minutes !== undefined && time.seconds !== undefined) {
      return (time.minutes * 60) + time.seconds;
    }
    return 0;
  };

  switch (queryType) {
    case 'agent_performance':
      const agentStats = workingRecords.reduce((acc, record) => {
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
        
        const sentiment = extractSentiment(record.sentiment_analysis);
        acc[agent].sentiments[sentiment] = (acc[agent].sentiments[sentiment] || 0) + 1;
        
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

    case 'summary':
      // Fix topDispositions calculation with proper typing
      const dispositionCounts = workingRecords.reduce((acc, r) => {
        const disp = r.disposition_title || 'Unknown';
        acc[disp] = (acc[disp] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const topDispositions = Object.entries(dispositionCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 5);

      return {
        type: 'summary',
        data: {
          overview: {
            totalCalls: records.length,
            analysedCalls: workingRecords.length,
            uniqueAgents: new Set(workingRecords.map(r => r.agent_username).filter(Boolean)).size,
            uniqueQueues: new Set(workingRecords.map(r => r.queue_name).filter(Boolean)).size,
            avgCallDuration: workingRecords.reduce((sum, r) => sum + extractDuration(r.call_duration), 0) / workingRecords.length,
            avgHoldTime: workingRecords.reduce((sum, r) => sum + extractTime(r.total_hold_time), 0) / workingRecords.length,
            topDispositions,
            sentimentDistribution: workingRecords.reduce((acc, r) => {
              const sentiment = extractSentiment(r.sentiment_analysis);
              acc[sentiment] = (acc[sentiment] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          },
          ...baseStats
        }
      };

    default:
      // For general queries, provide a smart sample
      const sampleRecords = workingRecords.slice(0, 10).map(record => ({
        id: record.id,
        agent_username: record.agent_username,
        queue_name: record.queue_name,
        call_duration: extractDuration(record.call_duration),
        disposition_title: record.disposition_title,
        sentiment_analysis: extractSentiment(record.sentiment_analysis),
        primary_category: record.primary_category
      }));
      
      // Fix topDisposition calculation with proper typing
      const generalDispositionCounts = workingRecords.reduce((acc, r) => {
        const disp = r.disposition_title || 'Unknown';
        acc[disp] = (acc[disp] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const topDisposition = Object.entries(generalDispositionCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))[0]?.[0] || 'None';
      
      return {
        type: 'general',
        data: {
          sampleRecords,
          quickStats: {
            totalRecords: records.length,
            avgDuration: workingRecords.reduce((sum, r) => sum + extractDuration(r.call_duration), 0) / workingRecords.length,
            topDisposition
          },
          ...baseStats
        }
      };
  }
};

// Advanced data aggregation with smart compression - UPDATED
const compressCallData = (callData: any, queryType: string): any => {
  const { data } = callData;
  
  // Different compression strategies based on query type
  switch (queryType) {
    case 'disposition':
      // For disposition queries, keep all the accurate data
      return {
        type: 'disposition',
        data: {
          totalRecords: data.totalRecords,
          dispositions: data.dispositions,
          dispositionsWithPercentages: data.dispositionsWithPercentages,
          dateRange: data.dateRange,
          analysisNote: data.analysisNote
        }
      };
      
    case 'agent_performance':
      // Compress agent data to key metrics only
      const compressedAgents: any = {};
      Object.entries(data.agentMetrics || {}).forEach(([agent, metrics]: [string, any]) => {
        // Fix the topDisposition calculation with proper typing
        const dispositionEntries = Object.entries(metrics.dispositions) as [string, number][];
        const topDisposition = dispositionEntries
          .sort(([,a], [,b]) => b - a)[0]?.[0];
          
        compressedAgents[agent] = {
          totalCalls: metrics.totalCalls,
          avgDuration: metrics.totalDuration / metrics.totalCalls,
          avgHoldTime: metrics.totalHoldTime / metrics.totalCalls,
          topDisposition,
          successRate: calculateSuccessRate(metrics.dispositions)
        };
      });
      
      return {
        type: 'agent_performance',
        data: {
          totalRecords: data.totalRecords,
          agentMetrics: compressedAgents,
          totalAgents: data.totalAgents
        }
      };
      
    case 'summary':
      return {
        type: 'summary',
        data: {
          overview: data.overview,
          totalRecords: data.totalRecords,
          dateRange: data.dateRange
        }
      };
      
    default:
      // For general queries, use statistical sampling
      const sampleRecords = sampleData(data.sampleRecords || [], 20);
      return {
        type: 'general',
        data: {
          sampleRecords,
          quickStats: data.quickStats,
          totalRecords: data.totalRecords,
          samplingNote: data.samplingNote || `Analysis based on ${sampleRecords.length} representative samples from ${data.totalRecords} total records`
        }
      };
  }
};

// Calculate success rate from dispositions
const calculateSuccessRate = (dispositions: Record<string, number>): number => {
  const total = Object.values(dispositions).reduce((sum, count) => sum + count, 0);
  
  // Fix the Object.entries() typing issue
  const successful = Object.entries(dispositions)
    .filter(([disp]) => 
      disp.toLowerCase().includes('resolved') || 
      disp.toLowerCase().includes('completed') ||
      disp.toLowerCase().includes('satisfied')
    )
    .reduce((sum, [, count]) => sum + (count as number), 0);
    
  return total > 0 ? (successful / total) * 100 : 0;
};

// Queue management for large requests
const processQueue = async (clientIP: string) => {
  const queue = requestQueue.get(clientIP) || [];
  if (queue.length === 0) return;
  
  const { resolve, reject, request } = queue.shift()!;
  requestQueue.set(clientIP, queue);
  
  try {
    const result = await processLargeRequest(request);
    resolve(result);
  } catch (error) {
    reject(error);
  }
  
  // Process next in queue after delay
  if (queue.length > 0) {
    setTimeout(() => processQueue(clientIP), 2000);
  }
};

// Process large requests in chunks - UPDATED
const processLargeRequest = async (requestData: any): Promise<any> => {
  const { query, callData, queryType } = requestData;
  
  // Use the new accurate data preparation
  const processedData = prepareAccurateData(callData.originalRecords || callData, queryType);
  
  // Compress data for API call
  const compressedData = compressCallData(processedData, queryType);
  const dataString = JSON.stringify(compressedData);
  const estimatedTokens = estimateTokens(dataString);
  
  // If still too large, use chunking strategy (but avoid for disposition queries)
  if (estimatedTokens > 8000 && queryType !== 'disposition') {
    return await processWithChunking(query, callData, queryType);
  }
  
  // Normal processing
  return await processSingleRequest(query, compressedData, queryType);
};

// Chunking strategy for very large datasets
const processWithChunking = async (query: string, callData: any, queryType: string) => {
  const data = callData.originalRecords || callData;
  const chunkSize = 1000; // Increased chunk size
  const chunks = [];
  
  // Create random chunks instead of sequential ones
  const shuffledData = [...data].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < shuffledData.length; i += chunkSize) {
    chunks.push(shuffledData.slice(i, i + chunkSize));
    if (chunks.length >= 3) break; // Limit to 3 chunks
  }
  
  const chunkResults = [];
  
  for (const chunk of chunks) {
    const chunkData = prepareSmartData(chunk, queryType);
    
    try {
      const result = await processSingleRequest(
        `${query} (analysing subset of data)`, 
        chunkData, 
        queryType
      );
      chunkResults.push(result);
    } catch (error) {
      console.warn('Chunk processing failed:', error);
    }
  }
  
  // Combine results
  if (chunkResults.length === 0) {
    throw new Error('Unable to process data chunks');
  }
  
  // Use the first successful result and add a note about chunking
  const combinedResult = chunkResults[0];
  combinedResult.response += `\n\n*Note: Analysis based on representative data samples due to large dataset size (${data.length} total records).*`;
  
  return combinedResult;
};

// Single request processing
const processSingleRequest = async (query: string, callData: any, queryType: string) => {
  const systemPrompt = generateSystemPrompt(queryType, {
    type: callData.type,
    recordCount: callData.data.totalRecords || 0,
    queryType
  });

  const userPrompt = `Query: "${query}"

Call Center Data (${callData.type} analysis):
${JSON.stringify(callData.data, null, 2)}

Please provide a comprehensive analysis that directly addresses the query with specific insights, metrics, and actionable recommendations. 
${queryType === 'disposition' ? 'Focus on the exact counts and percentages provided - these are accurate counts from the complete dataset.' : ''}`;

  // Choose model and token limits based on complexity
  const model = queryType === 'summary' || queryType === 'agent_performance' ? 'gpt-4o' : 'gpt-4o-mini';
  const maxTokens = queryType === 'summary' ? 3000 : 2000;

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: maxTokens,
    temperature: 0.1,
    presence_penalty: 0.1,
    frequency_penalty: 0.1,
  });

  return {
    response: completion.choices[0]?.message?.content,
    metadata: {
      queryType,
      tokensUsed: completion.usage?.total_tokens,
      model,
      dataPoints: callData.data.totalRecords || 0
    }
  };
};

// Enhanced rate limiting with queue support
const checkRateLimit = (identifier: string): { allowed: boolean; shouldQueue: boolean } => {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 15; // Reduced from 20 for safety
  const queueLimit = 5;

  const current = rateLimitMap.get(identifier);
  if (!current) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return { allowed: true, shouldQueue: false };
  }

  if (now > current.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return { allowed: true, shouldQueue: false };
  }

  if (current.count >= maxRequests) {
    const queue = requestQueue.get(identifier) || [];
    if (queue.length < queueLimit) {
      return { allowed: false, shouldQueue: true };
    }
    return { allowed: false, shouldQueue: false };
  }

  current.count++;
  return { allowed: true, shouldQueue: false };
};

// Generate system prompts
const generateSystemPrompt = (queryType: string, dataInfo: any): string => {
  const basePrompt = `You are PRISM, an expert call center analytics AI assistant. You provide actionable insights with specific numbers and percentages.

Always format your responses in an easily interpretable way - Not as markdown.

IMPORTANT GUIDELINES:
- Use specific metrics and percentages whenever possible
- Provide actionable recommendations
- Format responses clearly with headers and bullet points
- Focus on business impact and operational improvements
- Always cite specific numbers from the data
- Use emojis sparingly but effectively for visual appeal
- For disposition analysis, the counts provided are EXACT and represent the complete dataset`;

  switch (queryType) {
    case 'disposition':
      return basePrompt + `

DISPOSITION ANALYSIS FOCUS:
- The disposition counts and percentages provided are accurate for the entire dataset
- Focus on identifying patterns in call outcomes
- Highlight the most common dispositions and their business impact
- Suggest improvements based on disposition trends
- Calculate success rates and identify areas needing attention`;

    case 'agent_performance':
      return basePrompt + `

AGENT PERFORMANCE FOCUS:
- Compare agent metrics fairly
- Identify top performers and areas for improvement
- Look at call handling efficiency
- Analyze disposition patterns by agent
- Provide coaching recommendations`;

    case 'summary':
      return basePrompt + `

SUMMARY ANALYSIS FOCUS:
- Provide a comprehensive overview of call center performance
- Highlight key metrics and trends
- Identify the most critical areas for attention
- Offer strategic recommendations for improvement`;

    default:
      return basePrompt + `

GENERAL ANALYSIS:
- Answer the specific question asked
- Provide relevant context and insights
- Use the data provided to support your analysis
- Offer actionable next steps`;
  }
};

export async function POST(request: NextRequest) {
  try {
    const { query, callData, queryType = 'general' } = await request.json();

    if (!query || !callData) {
      return NextResponse.json(
        { error: 'Query and call data are required' },
        { status: 400 }
      );
    }

    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';

    const rateCheck = checkRateLimit(clientIP);
    
    if (!rateCheck.allowed) {
      if (rateCheck.shouldQueue) {
        // Add to queue
        return new Promise((resolve, reject) => {
          const queue = requestQueue.get(clientIP) || [];
          queue.push({
            resolve: (result: any) => resolve(NextResponse.json(result)),
            reject: (error: any) => resolve(NextResponse.json(
              { error: 'Request failed in queue', retryable: true },
              { status: 500 }
            )),
            request: { query, callData, queryType }
          });
          requestQueue.set(clientIP, queue);
          
          // Start processing queue if not already running
          if (queue.length === 1) {
            setTimeout(() => processQueue(clientIP), 1000);
          }
        });
      } else {
        return NextResponse.json(
          { 
            error: 'Rate limit exceeded and queue is full. Please wait before making another request.',
            retryable: true 
          },
          { status: 429 }
        );
      }
    }

    // Process the request
    const result = await processLargeRequest({ query, callData, queryType });
    
    console.log(`✅ Query processed: ${queryType} | Tokens: ${result.metadata?.tokensUsed} | Model: ${result.metadata?.model}`);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('❌ Error calling OpenAI:', error);

    // Enhanced error handling
    if (error?.status === 429) {
      return NextResponse.json(
        { 
          error: 'AI service is currently experiencing high demand. The request will be automatically retried.',
          retryable: true
        },
        { status: 429 }
      );
    }

    if (error?.code === 'context_length_exceeded' || error?.status === 413) {
      return NextResponse.json(
        { 
          error: 'Dataset too large for analysis. Try filtering your data or asking a more specific question.',
          retryable: false,
          suggestion: 'Consider using filters to reduce your dataset size or ask about specific metrics.'
        },
        { status: 413 }
      );
    }

    return NextResponse.json(
      { 
        error: `Analysis failed: ${error.message || 'Unknown error'}. Please try again or contact support if the problem persists.`,
        retryable: true
      },
      { status: 500 }
    );
  }
}