/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

interface CallRecord {
  id: string;
  agent_username?: string;
  queue_name?: string;
  call_duration?: any;
  disposition_title?: string;
  sentiment_analysis?: any;
  primary_category?: string;
  initiation_timestamp?: string;
  total_hold_time?: any;
  transcript_text?: string;
  call_summary?: string;
  [key: string]: any;
}

interface ProcessedMetrics {
  totalCalls: number;
  avgCallDuration: number;
  avgHoldTime: number;
  dispositionBreakdown: Record<string, { count: number; percentage: number }>;
  sentimentBreakdown: Record<string, { count: number; percentage: number }>;
  agentMetrics: Record<
    string,
    {
      totalCalls: number;
      avgDuration: number;
      avgHoldTime: number;
      topDispositions: string[];
      sentimentScore: number;
    }
  >;
  queueMetrics: Record<
    string,
    {
      totalCalls: number;
      avgDuration: number;
      avgWaitTime: number;
      topDispositions: string[];
    }
  >;
  timePatterns: {
    hourlyDistribution: Record<string, number>;
    dailyTrends: Record<string, number>;
  };
  performanceIndicators: {
    callsOver15Min: number;
    callsUnder2Min: number;
    abandonmentRate: number;
    firstCallResolution: number;
  };
}

interface TranscriptContext {
  includeTranscripts: boolean;
  selectedTranscripts: {
    id: string;
    agent: string;
    disposition: string;
    sentiment: string;
    transcript: string;
    summary: string;
    relevanceScore: number;
  }[];
  transcriptStats: {
    totalAvailable: number;
    selectedCount: number;
    avgLength: number;
  };
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const RATE_LIMIT_CONFIG = {
  maxRetries: 5,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

// Token management constants
const MAX_CONTEXT_TOKENS = 100000;
const TRANSCRIPT_TOKEN_RATIO = 4; // Rough estimate: 4 chars per token
const MAX_TRANSCRIPT_TOKENS = 8000; // Small allocation for 1-3 calls
const MAX_SEGMENT_LENGTH = 400; // Characters per segment
const MAX_SEGMENTS_PER_CALL = 4; // Maximum segments from each call
const MAX_TRANSCRIPT_CALLS = 3; // Only analyze segments from top 3 calls

const extractNumericValue = (value: any): number => {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value.minutes !== undefined &&
    value.seconds !== undefined
  ) {
    return value.minutes * 60 + value.seconds;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const extractSentiment = (sentimentAnalysis: any): string => {
  if (!sentimentAnalysis) return "Unknown";
  if (Array.isArray(sentimentAnalysis) && sentimentAnalysis.length > 0) {
    return sentimentAnalysis[0].sentiment || "Unknown";
  }
  if (typeof sentimentAnalysis === "string") return sentimentAnalysis;
  if (typeof sentimentAnalysis === "object" && sentimentAnalysis.sentiment) {
    return sentimentAnalysis.sentiment;
  }
  return "Unknown";
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Determine if transcripts should be included based on query content
const shouldIncludeTranscripts = (query: string, queryType: string): boolean => {
  const transcriptIndicators = [
    "transcript", "conversation", "said", "mentioned", "discussed",
    "customer", "agent said", "complaint", "issue", "problem",
    "training", "quality", "script", "tone", "language", "communication",
    "specific", "example", "instance", "case", "story", "experience",
    "what did", "how did", "why did", "escalation", "resolution"
  ];

  const queryLower = query.toLowerCase();
  const hasTranscriptIndicator = transcriptIndicators.some(indicator => 
    queryLower.includes(indicator)
  );

  // Always include for certain query types
  const transcriptQueryTypes = ["quality", "training", "examples", "specific_cases"];
  const isTranscriptQueryType = transcriptQueryTypes.includes(queryType);

  // Don't include for purely statistical queries
  const statisticalIndicators = [
    "average", "total", "count", "how many", "percentage", "rate",
    "volume", "duration only", "time only", "stats only"
  ];
  const isPurelyStatistical = statisticalIndicators.some(indicator => 
    queryLower.includes(indicator)
  ) && !hasTranscriptIndicator;

  return (hasTranscriptIndicator || isTranscriptQueryType) && !isPurelyStatistical;
};

// Score transcript relevance based on query
const scoreTranscriptRelevance = (record: CallRecord, query: string): number => {
  let score = 0;
  const queryLower = query.toLowerCase();
  const transcript = (record.transcript_text || "").toLowerCase();
  const summary = (record.call_summary || "").toLowerCase();

  // Keyword matching in transcript (highest weight)
  const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);
  queryWords.forEach(word => {
    const transcriptMatches = (transcript.match(new RegExp(word, 'gi')) || []).length;
    const summaryMatches = (summary.match(new RegExp(word, 'gi')) || []).length;
    score += transcriptMatches * 3 + summaryMatches * 2;
  });

  // Sentiment alignment
  const recordSentiment = extractSentiment(record.sentiment_analysis).toLowerCase();
  if (queryLower.includes(recordSentiment)) {
    score += 10;
  }

  // Disposition alignment
  const disposition = (record.disposition_title || "").toLowerCase();
  if (queryLower.includes(disposition)) {
    score += 8;
  }

  // Category alignment
  const category = (record.primary_category || "").toLowerCase();
  if (queryLower.includes(category)) {
    score += 6;
  }

  // Boost longer calls for quality analysis
  const duration = extractNumericValue(record.call_duration);
  if (queryLower.includes("quality") || queryLower.includes("training")) {
    if (duration > 300) score += 5; // Calls over 5 minutes
  }

  // Boost negative sentiment for complaint analysis
  if (queryLower.includes("complaint") || queryLower.includes("problem")) {
    if (recordSentiment.includes("negative")) score += 8;
  }

  return score;
};

// Extract relevant segments from transcripts
const extractRelevantSegments = (
  transcript: string,
  query: string,
  maxSegments: number = MAX_SEGMENTS_PER_CALL
): string[] => {
  if (!transcript || transcript.trim().length === 0) return [];

  const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
  const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 10);
  
  const scoredSegments = sentences.map((sentence, index) => {
    let score = 0;
    const sentenceLower = sentence.toLowerCase();
    
    // Score based on query word matches
    queryWords.forEach(word => {
      const matches = (sentenceLower.match(new RegExp(word, 'gi')) || []).length;
      score += matches * 5;
    });
    
    // Boost segments with important keywords
    const importantPatterns = [
      /\b(complain|complaint|issue|problem|upset|angry|frustrated)\b/i,
      /\b(great|excellent|amazing|wonderful|thank|appreciate)\b/i,
      /\b(sorry|apologize|understand|help|resolve|solution)\b/i,
      /\b(cancel|refund|escalate|supervisor|manager)\b/i,
    ];
    
    importantPatterns.forEach(pattern => {
      if (pattern.test(sentence)) score += 3;
    });
    
    // Include some context around high-scoring sentences
    const segmentStart = Math.max(0, index - 1);
    const segmentEnd = Math.min(sentences.length - 1, index + 1);
    const segment = sentences.slice(segmentStart, segmentEnd + 1).join('. ').trim();
    
    return {
      segment: segment.length > MAX_SEGMENT_LENGTH 
        ? segment.substring(0, MAX_SEGMENT_LENGTH) + "..." 
        : segment,
      score,
      originalIndex: index
    };
  });

  return scoredSegments
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSegments)
    .map(s => s.segment);
};

// Select segments from the top most relevant calls only (limited by MAX_TRANSCRIPT_CALLS)
const selectRelevantTranscriptSegments = (
  records: CallRecord[],
  query: string,
  maxTokens: number = MAX_TRANSCRIPT_TOKENS
): TranscriptContext["selectedTranscripts"] => {
  // First, find the most relevant calls (limited to MAX_TRANSCRIPT_CALLS)
  const topRelevantCalls = records
    .filter(record => record.transcript_text && record.transcript_text.trim().length > 0)
    .map(record => ({
      record,
      relevanceScore: scoreTranscriptRelevance(record, query)
    }))
    .filter(item => item.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, MAX_TRANSCRIPT_CALLS); // Limit to maximum allowed transcript calls

  console.log(`Analyzing transcript segments from ${topRelevantCalls.length} calls (max: ${MAX_TRANSCRIPT_CALLS})`);

  const selectedTranscripts = [];
  let currentTokens = 0;

  for (const { record, relevanceScore } of topRelevantCalls) {
    // Extract segments from this call
    const segments = extractRelevantSegments(record.transcript_text || "", query);
    
    if (segments.length === 0) continue;

    // Select segments within remaining token budget
    const callSegments = [];
    
    for (const segment of segments) {
      const segmentTokens = Math.ceil(segment.length / TRANSCRIPT_TOKEN_RATIO);
      
      if (currentTokens + segmentTokens > maxTokens) break;
      
      callSegments.push(segment);
      currentTokens += segmentTokens;
      
      // Stop if we have enough segments from this call
      if (callSegments.length >= MAX_SEGMENTS_PER_CALL) break;
    }
    
    if (callSegments.length > 0) {
      selectedTranscripts.push({
        id: record.id,
        agent: record.agent_username || "Unknown",
        disposition: record.disposition_title || "Unknown",
        sentiment: extractSentiment(record.sentiment_analysis),
        transcript: callSegments.join(" [...] "), // Join segments with separator
        summary: record.call_summary || "",
        relevanceScore
      });
    }

    // Exit early if we've used all available tokens
    if (currentTokens >= maxTokens) break;
  }

  return selectedTranscripts;
};

const preprocessCallData = (records: CallRecord[]): ProcessedMetrics => {
  const totalCalls = records.length;
  let totalDuration = 0;
  let totalHoldTime = 0;
  let callsOver15Min = 0;
  let callsUnder2Min = 0;

  const dispositions: Record<string, number> = {};
  const sentiments: Record<string, number> = {};
  const agentStats: Record<string, any> = {};
  const queueStats: Record<string, any> = {};
  const hourlyDistribution: Record<string, number> = {};
  const dailyTrends: Record<string, number> = {};

  records.forEach((record) => {
    const duration = extractNumericValue(record.call_duration);
    const holdTime = extractNumericValue(record.total_hold_time);

    totalDuration += duration;
    totalHoldTime += holdTime;

    if (duration > 900) callsOver15Min++;
    if (duration < 120) callsUnder2Min++;

    const disposition = record.disposition_title || "Unknown";
    dispositions[disposition] = (dispositions[disposition] || 0) + 1;

    const sentiment = extractSentiment(record.sentiment_analysis);
    sentiments[sentiment] = (sentiments[sentiment] || 0) + 1;

    const agent = record.agent_username || "Unknown";
    if (!agentStats[agent]) {
      agentStats[agent] = {
        totalCalls: 0,
        totalDuration: 0,
        totalHoldTime: 0,
        dispositions: {},
        sentiments: {},
      };
    }
    agentStats[agent].totalCalls++;
    agentStats[agent].totalDuration += duration;
    agentStats[agent].totalHoldTime += holdTime;
    agentStats[agent].dispositions[disposition] =
      (agentStats[agent].dispositions[disposition] || 0) + 1;
    agentStats[agent].sentiments[sentiment] =
      (agentStats[agent].sentiments[sentiment] || 0) + 1;

    const queue = record.queue_name || "Unknown";
    if (!queueStats[queue]) {
      queueStats[queue] = {
        totalCalls: 0,
        totalDuration: 0,
        totalWaitTime: 0,
        dispositions: {},
      };
    }
    queueStats[queue].totalCalls++;
    queueStats[queue].totalDuration += duration;
    queueStats[queue].totalWaitTime += holdTime;
    queueStats[queue].dispositions[disposition] =
      (queueStats[queue].dispositions[disposition] || 0) + 1;

    if (record.initiation_timestamp) {
      const date = new Date(record.initiation_timestamp);
      const hour = date.getHours();
      const day = date.toDateString();

      hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
      dailyTrends[day] = (dailyTrends[day] || 0) + 1;
    }
  });

  const dispositionBreakdown: Record<
    string,
    { count: number; percentage: number }
  > = {};
  Object.entries(dispositions).forEach(([key, count]) => {
    dispositionBreakdown[key] = {
      count,
      percentage: (count / totalCalls) * 100,
    };
  });

  const sentimentBreakdown: Record<
    string,
    { count: number; percentage: number }
  > = {};
  Object.entries(sentiments).forEach(([key, count]) => {
    sentimentBreakdown[key] = {
      count,
      percentage: (count / totalCalls) * 100,
    };
  });

  const agentMetrics: Record<string, any> = {};
  Object.entries(agentStats).forEach(([agent, stats]) => {
    const topDispositions = Object.entries(stats.dispositions)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([disp]) => disp);

    const positiveCount = stats.sentiments["Positive"] || 0;
    const negativeCount = stats.sentiments["Negative"] || 0;
    const sentimentScore =
      stats.totalCalls > 0
        ? ((positiveCount - negativeCount) / stats.totalCalls) * 100
        : 0;

    agentMetrics[agent] = {
      totalCalls: stats.totalCalls,
      avgDuration:
        stats.totalCalls > 0 ? stats.totalDuration / stats.totalCalls : 0,
      avgHoldTime:
        stats.totalCalls > 0 ? stats.totalHoldTime / stats.totalCalls : 0,
      topDispositions,
      sentimentScore,
    };
  });

  const queueMetrics: Record<string, any> = {};
  Object.entries(queueStats).forEach(([queue, stats]) => {
    const topDispositions = Object.entries(stats.dispositions)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([disp]) => disp);

    queueMetrics[queue] = {
      totalCalls: stats.totalCalls,
      avgDuration:
        stats.totalCalls > 0 ? stats.totalDuration / stats.totalCalls : 0,
      avgWaitTime:
        stats.totalCalls > 0 ? stats.totalWaitTime / stats.totalCalls : 0,
      topDispositions,
    };
  });

  return {
    totalCalls,
    avgCallDuration: totalCalls > 0 ? totalDuration / totalCalls : 0,
    avgHoldTime: totalCalls > 0 ? totalHoldTime / totalCalls : 0,
    dispositionBreakdown,
    sentimentBreakdown,
    agentMetrics,
    queueMetrics,
    timePatterns: {
      hourlyDistribution,
      dailyTrends,
    },
    performanceIndicators: {
      callsOver15Min,
      callsUnder2Min,
      abandonmentRate: 0,
      firstCallResolution: 0,
    },
  };
};

// Enhanced function to prepare context including transcript data
const prepareContextForQuery = (
  queryType: string,
  query: string,
  metrics: ProcessedMetrics,
  rawRecords: CallRecord[],
  maxTokens: number = MAX_CONTEXT_TOKENS
): { context: string; transcriptContext: TranscriptContext } => {
  let context = "";

  // Add basic metrics summary
  context += `## Call Center Analytics Summary\n`;
  context += `**Total Calls Analyzed:** ${metrics.totalCalls.toLocaleString()}\n`;
  context += `**Average Call Duration:** ${Math.round(
    metrics.avgCallDuration / 60
  )} minutes ${Math.round(metrics.avgCallDuration % 60)} seconds\n`;
  context += `**Average Hold Time:** ${Math.round(
    metrics.avgHoldTime / 60
  )} minutes ${Math.round(metrics.avgHoldTime % 60)} seconds\n\n`;

  // Determine if we should include transcripts
  const includeTranscripts = shouldIncludeTranscripts(query, queryType);
  let selectedTranscripts: TranscriptContext["selectedTranscripts"] = [];
  const transcriptStats = {
    totalAvailable: rawRecords.filter(r => r.transcript_text).length,
    selectedCount: 0,
    avgLength: 0
  };

  if (includeTranscripts) {
    // Calculate available space for transcripts
    const currentContextTokens = Math.ceil(context.length / TRANSCRIPT_TOKEN_RATIO);
    const availableTranscriptTokens = Math.min(
      MAX_TRANSCRIPT_TOKENS,
      maxTokens - currentContextTokens - 5000 // Reserve space for metrics
    );

    selectedTranscripts = selectRelevantTranscriptSegments(rawRecords, query, availableTranscriptTokens);
    transcriptStats.selectedCount = selectedTranscripts.length;
    transcriptStats.avgLength = selectedTranscripts.length > 0 
      ? selectedTranscripts.reduce((sum, t) => sum + t.transcript.length, 0) / selectedTranscripts.length
      : 0;
  }

  // Add query-specific metrics
  switch (queryType) {
    case "disposition":
      context += `## Disposition Analysis\n`;
      Object.entries(metrics.dispositionBreakdown)
        .sort(([, a], [, b]) => (b as any).count - (a as any).count)
        .forEach(([disposition, data]) => {
          context += `**${disposition}:** ${
            data.count
          } calls (${data.percentage.toFixed(1)}%)\n`;
        });
      break;

    case "agent_performance":
      context += `## Agent Performance Metrics\n`;
      Object.entries(metrics.agentMetrics)
        .sort(([, a], [, b]) => (b as any).totalCalls - (a as any).totalCalls)
        .slice(0, 20)
        .forEach(([agent, data]) => {
          context += `**${agent}:**\n`;
          context += `- Calls: ${data.totalCalls}\n`;
          context += `- Avg Duration: ${Math.round(
            data.avgDuration / 60
          )}m ${Math.round(data.avgDuration % 60)}s\n`;
          context += `- Sentiment Score: ${data.sentimentScore.toFixed(1)}\n`;
          context += `- Top Dispositions: ${data.topDispositions.join(
            ", "
          )}\n\n`;
        });
      break;

    case "sentiment":
      context += `## Sentiment Analysis\n`;
      Object.entries(metrics.sentimentBreakdown)
        .sort(([, a], [, b]) => (b as any).count - (a as any).count)
        .forEach(([sentiment, data]) => {
          context += `**${sentiment}:** ${
            data.count
          } calls (${data.percentage.toFixed(1)}%)\n`;
        });
      break;

    case "queue_analysis":
      context += `## Queue Performance\n`;
      Object.entries(metrics.queueMetrics)
        .sort(([, a], [, b]) => (b as any).totalCalls - (a as any).totalCalls)
        .forEach(([queue, data]) => {
          context += `**${queue}:**\n`;
          context += `- Calls: ${data.totalCalls}\n`;
          context += `- Avg Duration: ${Math.round(
            data.avgDuration / 60
          )}m ${Math.round(data.avgDuration % 60)}s\n`;
          context += `- Avg Wait: ${Math.round(
            data.avgWaitTime / 60
          )}m ${Math.round(data.avgWaitTime % 60)}s\n`;
          context += `- Top Dispositions: ${data.topDispositions.join(
            ", "
          )}\n\n`;
        });
      break;

    case "timing":
      context += `## Time Pattern Analysis\n`;
      context += `**Hourly Distribution (Top 10):**\n`;
      Object.entries(metrics.timePatterns.hourlyDistribution)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 10)
        .forEach(([hour, count]) => {
          context += `- ${hour}:00: ${count} calls\n`;
        });
      break;

    case "summary":
    default:
      context += `## Key Metrics Overview\n\n`;

      context += `### Top Dispositions\n`;
      Object.entries(metrics.dispositionBreakdown)
        .sort(([, a], [, b]) => (b as any).count - (a as any).count)
        .slice(0, 10)
        .forEach(([disposition, data]) => {
          context += `- ${disposition}: ${
            data.count
          } (${data.percentage.toFixed(1)}%)\n`;
        });

      context += `\n### Performance Indicators\n`;
      context += `- Calls over 15 minutes: ${metrics.performanceIndicators.callsOver15Min}\n`;
      context += `- Calls under 2 minutes: ${metrics.performanceIndicators.callsUnder2Min}\n`;

      context += `\n### Top Performing Agents (by call volume)\n`;
      Object.entries(metrics.agentMetrics)
        .sort(([, a], [, b]) => (b as any).totalCalls - (a as any).totalCalls)
        .slice(0, 5)
        .forEach(([agent, data]) => {
          context += `- ${agent}: ${
            data.totalCalls
          } calls, sentiment score: ${data.sentimentScore.toFixed(1)}\n`;
        });
      break;
  }

  // Add transcript segments if relevant
  if (includeTranscripts && selectedTranscripts.length > 0) {
    context += `\n## Key Call Examples (Transcript Segments)\n`;
    context += `*Showing relevant segments from the ${selectedTranscripts.length} most pertinent calls out of ${transcriptStats.totalAvailable} available*\n\n`;

    selectedTranscripts.forEach((transcript, index) => {
      context += `### Example Call ${index + 1} (ID: ${transcript.id})\n`;
      context += `**Agent:** ${transcript.agent} | **Disposition:** ${transcript.disposition} | **Sentiment:** ${transcript.sentiment}\n`;
      
      if (transcript.summary) {
        context += `**Call Summary:** ${transcript.summary}\n`;
      }
      
      context += `**Relevant Excerpts:** ${transcript.transcript}\n\n`;
      context += `---\n\n`;
    });
  }

  // Final token check and truncation
  const estimatedTokens = context.length / TRANSCRIPT_TOKEN_RATIO;
  if (estimatedTokens > maxTokens) {
    const maxChars = maxTokens * TRANSCRIPT_TOKEN_RATIO;
    context =
      context.substring(0, maxChars) +
      "\n\n[Context truncated due to size limits - analysis based on available data]";
  }

  return {
    context,
    transcriptContext: {
      includeTranscripts,
      selectedTranscripts,
      transcriptStats
    }
  };
};

const callOpenAIWithRetry = async (
  messages: any[],
  model: string = "gpt-4.1",
  retryCount: number = 0
): Promise<any> => {
  try {
    const response = await openai.chat.completions.create({
      model,
      messages,
      max_tokens: 8000,
      temperature: 0.7,
    });

    return response;
  } catch (error: any) {
    if (error?.status === 429 && retryCount < RATE_LIMIT_CONFIG.maxRetries) {
      const delay = Math.min(
        RATE_LIMIT_CONFIG.baseDelay *
          Math.pow(RATE_LIMIT_CONFIG.backoffMultiplier, retryCount),
        RATE_LIMIT_CONFIG.maxDelay
      );

      console.log(
        `Rate limited. Retrying in ${delay}ms (attempt ${retryCount + 1}/${
          RATE_LIMIT_CONFIG.maxRetries
        })`
      );
      await sleep(delay);
      return callOpenAIWithRetry(messages, model, retryCount + 1);
    }

    if (
      error?.status === 400 &&
      error?.message?.includes("context_length_exceeded")
    ) {
      if (model === "gpt-4.1") {
        console.log("Context length exceeded, falling back to gpt-4.1");
        return callOpenAIWithRetry(messages, "gpt-4.1", retryCount);
      }
      throw new Error(
        "Query too complex for available models. Please try a more specific question."
      );
    }

    throw error;
  }
};

export async function POST(request: NextRequest) {
  try {
    const { query, callData, queryType, fullRecords } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const recordsToAnalyze =
      fullRecords && fullRecords.length > 0
        ? fullRecords
        : callData?.data?.sampleRecords || [];

    if (!recordsToAnalyze || recordsToAnalyze.length === 0) {
      return NextResponse.json(
        {
          error: "No call records available for analysis",
        },
        { status: 400 }
      );
    }

    console.log(
      `Processing ${recordsToAnalyze.length} call records for query type: ${queryType}`
    );
    
    // Process metrics
    const metrics = preprocessCallData(recordsToAnalyze);

    // Prepare context with transcript data when relevant
    const { context, transcriptContext } = prepareContextForQuery(
      queryType || "general",
      query,
      metrics,
      recordsToAnalyze
    );

    // Enhanced system prompt to handle transcript data
    const systemPrompt = `You are PRISM AI, an expert call center analytics assistant. Analyze the provided call center data and answer questions with precise, actionable insights.

${transcriptContext.includeTranscripts ? 
`**CRITICAL: This analysis includes actual conversation excerpts from call transcripts. When referencing call examples:**

REQUIREMENTS:
- ONLY quote verbatim text that appears in the provided transcript segments
- Use exact quotation marks around any transcript content you reference
- NEVER paraphrase, summarize, or create fictional dialogue examples
- If you reference what someone said, it must be an exact quote from the provided excerpts
- Clearly distinguish between actual quoted material and your analytical insights
- If a transcript segment shows "[...]" that indicates omitted content - do not fill in gaps

ACCEPTABLE: "The customer said 'I'm really frustrated because this is the third time I've called'"
UNACCEPTABLE: Making up dialogue like "The customer expressed frustration about multiple calls"

- Combine quantitative insights (metrics) with only genuine quoted evidence from transcripts
- If you cannot find transcript evidence for a point, rely on the statistical data only
- Always preface transcript quotes with phrases like "In the provided example..." or "The transcript shows..."` : 
`**NOTE: This analysis is based on call metrics and metadata only.**`}

Key Guidelines:
- Provide specific numbers, percentages, and trends
- Highlight actionable recommendations
- Use professional language appropriate for call center management
- When discussing performance, include both positive insights and improvement opportunities
- Format responses with clear headers and bullet points for readability
- If data seems incomplete, mention limitations but still provide valuable insights from available data
${transcriptContext.includeTranscripts ? '- When referencing transcripts, be specific about which call or agent the example comes from' : ''}

Always structure your response with:
1. Direct answer to the question
2. Supporting data/statistics ${transcriptContext.includeTranscripts ? 'and transcript evidence' : ''}
3. Key insights or patterns
4. Actionable recommendations (when relevant)`;

    const userPrompt = `Based on the following call center data, please answer this question: "${query}"

${context}

${transcriptContext.includeTranscripts && transcriptContext.selectedTranscripts.length > 0 ? 
`**Call Examples Context:**
- Included segments from the ${transcriptContext.transcriptStats.selectedCount} most relevant calls (out of ${transcriptContext.transcriptStats.totalAvailable} with transcripts)
- Only the most pertinent conversation excerpts are shown to illustrate key points
- Use these examples to support your statistical analysis with real conversation evidence` : ''}

Please provide a comprehensive analysis with specific metrics and actionable insights.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const startTime = Date.now();
    const response = await callOpenAIWithRetry(messages);
    const processingTime = Date.now() - startTime;

    const assistantResponse =
      response.choices[0]?.message?.content ||
      "Unable to generate response. Please try rephrasing your question.";

    const metadata = {
      model: response.model,
      tokensUsed: response.usage?.total_tokens || 0,
      dataPoints: recordsToAnalyze.length,
      processingTime,
      queryType,
      hasFullDispositions: fullRecords && fullRecords.length > 0,
      transcriptAnalysis: {
        included: transcriptContext.includeTranscripts,
        callsWithSegments: transcriptContext.selectedTranscripts.length,
        transcriptsAvailable: transcriptContext.transcriptStats.totalAvailable,
        avgSegmentLength: transcriptContext.selectedTranscripts.length > 0
          ? Math.round(transcriptContext.selectedTranscripts.reduce((sum, t) => sum + t.transcript.length, 0) / transcriptContext.selectedTranscripts.length)
          : 0,
        segmentBased: true
      },
      cacheKey: `${query}_${recordsToAnalyze.length}_${transcriptContext.includeTranscripts}`,
    };

    return NextResponse.json({
      response: assistantResponse,
      metadata,
    });
  } catch (error: any) {
    console.error("OpenAI API Error:", error);

    let errorMessage =
      "An unexpected error occurred while processing your request.";
    let statusCode = 500;

    if (error?.status === 429) {
      errorMessage = "Rate limit exceeded. Please wait a moment and try again.";
      statusCode = 429;
    } else if (error?.status === 400) {
      errorMessage =
        error.message || "Invalid request. Please try a different question.";
      statusCode = 400;
    } else if (error?.status === 401) {
      errorMessage = "Authentication failed. Please check API configuration.";
      statusCode = 401;
    } else if (error?.message) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: statusCode }
    );
  }
}