// TODO: Replace OPENAI
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Rate limitiing
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
// TODO: fix data type issues (15/07)
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-explicit-any
const requestQueue = new Map<
  string,
  Array<{ resolve: Function; reject: Function; request: any }>
>();

const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4); // Rough estimation: 1 token ≈ 4 characters
};

// Data sampling for big boy datasets
// TODO: fix data type issues (15/07)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sampleData = (records: any[], maxSamples: number = 500): any[] => {
  if (records.length <= maxSamples) return records;

  // Stratified sampling to maintain data distribution
  const step = Math.floor(records.length / maxSamples);
  const sampled = [];

  for (let i = 0; i < records.length; i += step) {
    if (sampled.length < maxSamples) {
      sampled.push(records[i]);
    }
  }

  return sampled;
};

// Data aggregation
// TODO: fix data type issues (15/07)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const compressCallData = (callData: any, queryType: string): any => {
  const { data } = callData;

  // Different compression strategies based on query type
  switch (queryType) {
    case "disposition":
      return {
        type: "disposition",
        data: {
          totalRecords: data.totalRecords,
          dispositions: data.dispositions,
          dateRange: data.dateRange,
        },
      };

    case "agent_performance":
      // set agent data to key metrics only
      // TODO: fix data type issues (15/07)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const compressedAgents: any = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.entries(data.agentMetrics || {}).forEach(
        ([agent, metrics]: [string, any]) => {
          compressedAgents[agent] = {
            totalCalls: metrics.totalCalls,
            avgDuration: metrics.totalDuration / metrics.totalCalls,
            avgHoldTime: metrics.totalHoldTime / metrics.totalCalls,
            topDisposition: Object.entries(metrics.dispositions).sort(
              ([, a], [, b]) => (b as number) - (a as number)
            )[0]?.[0],
            successRate: calculateSuccessRate(metrics.dispositions),
          };
        }
      );

      return {
        type: "agent_performance",
        data: {
          totalRecords: data.totalRecords,
          agentMetrics: compressedAgents,
          totalAgents: data.totalAgents,
        },
      };

    case "summary":
      return {
        type: "summary",
        data: {
          overview: data.overview,
          totalRecords: data.totalRecords,
          dateRange: data.dateRange,
        },
      };

    default:
      const sampleRecords = sampleData(data.sampleRecords || [], 20);
      return {
        type: "general",
        data: {
          sampleRecords,
          quickStats: data.quickStats,
          totalRecords: data.totalRecords,
          samplingNote: `Analysis based on ${sampleRecords.length} representative samples from ${data.totalRecords} total records`,
        },
      };
  }
};

const calculateSuccessRate = (dispositions: Record<string, number>): number => {
  const total = Object.values(dispositions).reduce(
    (sum, count) => sum + count,
    0
  );
  const successful = Object.entries(dispositions)
    .filter(
      ([disp]) =>
        disp.toLowerCase().includes("resolved") ||
        disp.toLowerCase().includes("completed") ||
        disp.toLowerCase().includes("satisfied")
    )
    .reduce((sum, [, count]) => sum + count, 0);

  return total > 0 ? (successful / total) * 100 : 0;
};

// Queuing stuff
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

  // next in queue
  if (queue.length > 0) {
    setTimeout(() => processQueue(clientIP), 2000);
  }
};

// Chunking
// TODO: fix data type issues (15/07)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const processLargeRequest = async (requestData: any): Promise<any> => {
  const { query, callData, queryType } = requestData;

  // compress
  const compressedData = compressCallData(callData, queryType);
  const dataString = JSON.stringify(compressedData);
  const estimatedTokens = estimateTokens(dataString);

  // use chunking strategy
  if (estimatedTokens > 8000) {
    return await processWithChunking(query, callData, queryType);
  }

  return await processSingleRequest(query, compressedData, queryType);
};
// TODO: fix data type issues (15/07)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const processWithChunking = async (
  query: string,
  callData: any,
  queryType: string
) => {
  const { data } = callData;
  const chunkSize = 50; // Process 50 records at a time
  const chunks = [];

  if (data.sampleRecords && data.sampleRecords.length > chunkSize) {
    for (let i = 0; i < data.sampleRecords.length; i += chunkSize) {
      chunks.push(data.sampleRecords.slice(i, i + chunkSize));
    }
  } else {
    chunks.push(data);
  }

  const chunkResults = [];

  for (const chunk of chunks.slice(0, 3)) {
    // limit === 3 chunks to avoid too many API calls
    const chunkData = {
      type: callData.type,
      data: Array.isArray(chunk)
        ? { sampleRecords: chunk, totalRecords: data.totalRecords }
        : chunk,
    };

    try {
      const result = await processSingleRequest(
        `${query} (analysing subset of data)`,
        chunkData,
        queryType
      );
      chunkResults.push(result);
    } catch (error) {
      console.warn("Chunk processing failed:", error);
    }
  }

  if (chunkResults.length === 0) {
    throw new Error("Unable to process data chunks");
  }

  const combinedResult = chunkResults[0];
  combinedResult.response += `\n\n*Note: Analysis based on representative data samples due to large dataset size (${data.totalRecords} total records).*`;

  return combinedResult;
};

// TODO: fix data type issues (15/07)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const processSingleRequest = async (
  query: string,
  callData: any,
  queryType: string
) => {
  const systemPrompt = generateSystemPrompt(queryType, {
    type: callData.type,
    recordCount: callData.data.totalRecords || 0,
    queryType,
  });

  const userPrompt = `Query: "${query}"

Call Center Data (${callData.type} analysis):
${JSON.stringify(callData.data, null, 2)}

Please provide a comprehensive analysis that directly addresses the query with specific insights, metrics, and actionable recommendations.`;

  // Choose model and token limits based on complexity
  const model =
    queryType === "summary" || queryType === "agent_performance"
      ? "gpt-4o"
      : "gpt-4o-mini";
  const maxTokens = queryType === "summary" ? 3000 : 2000;

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
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
      dataPoints: callData.data.totalRecords || 0,
    },
  };
};

const checkRateLimit = (
  identifier: string
): { allowed: boolean; shouldQueue: boolean } => {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 15;
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

// TODO: fix data type issues (15/07)
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
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
- When working with sampled data, acknowledge the sampling and extrapolate insights appropriately`;

  // ... rest of your existing generateSystemPrompt function
  return basePrompt; // Simplified for brevity
};

export async function POST(request: NextRequest) {
  try {
    const { query, callData, queryType = "general" } = await request.json();

    if (!query || !callData) {
      return NextResponse.json(
        { error: "Query and call data are required" },
        { status: 400 }
      );
    }

    const clientIP =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const rateCheck = checkRateLimit(clientIP);

    if (!rateCheck.allowed) {
      if (rateCheck.shouldQueue) {
        // Add to queue
        return new Promise((resolve) => {
          const queue = requestQueue.get(clientIP) || [];
          queue.push({
            // TODO: fix data type issues (15/07)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resolve: (result: any) => resolve(NextResponse.json(result)),
            reject: () =>
              resolve(
                NextResponse.json(
                  { error: "Request failed in queue", retryable: true },
                  { status: 500 }
                )
              ),
            request: { query, callData, queryType },
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
            error:
              "Rate limit exceeded and queue is full. Please wait before making another request.",
            retryable: true,
          },
          { status: 429 }
        );
      }
    }

    // Process the request
    const result = await processLargeRequest({ query, callData, queryType });

    console.log(
      `✅ Query processed: ${queryType} | Tokens: ${result.metadata?.tokensUsed} | Model: ${result.metadata?.model}`
    );

    return NextResponse.json(result);
    // TODO: fix data type issues (15/07)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("❌ Error calling OpenAI:", error);

    // Enhanced error handling
    if (error?.status === 429) {
      return NextResponse.json(
        {
          error:
            "AI service is currently experiencing high demand. The request will be automatically retried.",
          retryable: true,
        },
        { status: 429 }
      );
    }

    if (error?.code === "context_length_exceeded" || error?.status === 413) {
      return NextResponse.json(
        {
          error:
            "Dataset too large for analysis. Try filtering your data or asking a more specific question.",
          retryable: false,
          suggestion:
            "Consider using filters to reduce your dataset size or ask about specific metrics.",
        },
        { status: 413 }
      );
    }

    return NextResponse.json(
      {
        error: `Analysis failed: ${
          error.message || "Unknown error"
        }. Please try again or contact support if the problem persists.`,
        retryable: true,
      },
      { status: 500 }
    );
  }
}
