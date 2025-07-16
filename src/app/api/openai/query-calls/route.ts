/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Rate limiting cache (in production, use Redis or similar)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Clean up old entries
const cleanupRateLimit = () => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
};

// Simple rate limiting
const checkRateLimit = (identifier: string): boolean => {
  cleanupRateLimit();
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 20; // 20 requests per minute

  const current = rateLimitMap.get(identifier);
  if (!current) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (now > current.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (current.count >= maxRequests) {
    return false;
  }

  current.count++;
  return true;
};

// Generate system prompts based on query type
const generateSystemPrompt = (queryType: string, dataInfo: any): string => {
  const basePrompt = `You are PRISM, an expert call center analytics AI assistant. You provide actionable insights with specific numbers and percentages.

Always format your responses in an easily interpretable way - Not as markdown.

IMPORTANT GUIDELINES:
- Use specific metrics and percentages whenever possible
- Provide actionable recommendations
- Format responses clearly with headers and bullet points
- Focus on business impact and operational improvements
- Always cite specific numbers from the data
- Use emojis sparingly but effectively for visual appeal`;

  const typeSpecificPrompts = {
    disposition: `
SPECIALIZATION: Call disposition and outcome analysis
- Calculate disposition percentages and success rates
- Identify patterns in call outcomes
- Recommend process improvements based on disposition trends
- Highlight unusual or concerning disposition patterns`,

    sentiment: `
SPECIALIZATION: Customer sentiment analysis
- Analyze sentiment distribution and trends
- Correlate sentiment with other metrics (duration, agent, etc.)
- Identify opportunities to improve customer satisfaction
- Provide actionable insights for training and process improvement`,

    agent_performance: `
SPECIALIZATION: Agent performance analytics
- Compare agent metrics fairly and constructively
- Identify top performers and improvement opportunities
- Suggest coaching areas based on data patterns
- Calculate performance metrics like calls per hour, resolution rates
- Focus on team development and individual growth`,

    timing: `
SPECIALIZATION: Call timing and efficiency analysis
- Analyze call duration patterns and efficiency metrics
- Identify bottlenecks in call handling
- Compare timing across different periods, agents, or queues
- Suggest workflow optimizations`,

    queue_analysis: `
SPECIALIZATION: Queue and department performance
- Compare queue performance metrics
- Analyze wait times and service levels
- Identify resource allocation opportunities
- Suggest load balancing improvements`,

    categories: `
SPECIALIZATION: Call categorization and topic analysis
- Analyze issue distribution and patterns
- Identify trending topics or problems
- Suggest knowledge base improvements
- Recommend process optimizations based on common issues`,

    summary: `
SPECIALIZATION: Executive summary and overview reporting
- Provide high-level insights suitable for management
- Include key performance indicators
- Highlight both successes and areas for improvement
- Make data-driven recommendations for strategic decisions`,

    general: `
SPECIALIZATION: General call center data analysis
- Adapt analysis to the specific question asked
- Provide relevant insights from available data
- Make intelligent connections between different metrics
- Suggest follow-up analyses that might be valuable`
  };

  return `${basePrompt}

${typeSpecificPrompts[queryType as keyof typeof typeSpecificPrompts] || typeSpecificPrompts.general}

DATA CONTEXT:
${JSON.stringify(dataInfo, null, 2)}`;
};

// Optimize data payload based on query type
const optimizePayload = (callData: any, queryType: string): string => {
  const { data } = callData;
  
  // For most query types, we can work with aggregated data
  if (queryType !== 'general') {
    return JSON.stringify(data, null, 2);
  }
  
  // For general queries, include sample records but limit detail
  return JSON.stringify({
    ...data,
    sampleRecords: data.sampleRecords?.slice(0, 5) // Limit to 5 samples for general queries
  }, null, 2);
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

    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';

    // Check rate limit
    if (!checkRateLimit(clientIP)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a moment before making another request.' },
        { status: 429 }
      );
    }

    // Generate optimized system prompt
    const systemPrompt = generateSystemPrompt(queryType, {
      type: callData.type,
      recordCount: callData.data.totalRecords || 0,
      queryType
    });

    // Optimize data payload
    const optimizedData = optimizePayload(callData, queryType);

    // Create a more focused user prompt
    const userPrompt = `Query: "${query}"

Call Center Data (${callData.type} analysis):
${optimizedData}

Please provide a comprehensive analysis that directly addresses the query with specific insights, metrics, and actionable recommendations.`;

    // Choose model based on complexity
    const model = queryType === 'summary' || queryType === 'agent_performance' ? 'gpt-4o' : 'gpt-4o-mini';

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: queryType === 'summary' ? 4000 : 3000,
      temperature: 0.1, // Lower temperature for more consistent, factual responses
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
    });

    const response = completion.choices[0]?.message?.content;

    if (!response) {
      throw new Error('No response generated from AI model');
    }

    // Log successful request for monitoring
    console.log(`✅ Query processed: ${queryType} | Tokens: ${completion.usage?.total_tokens} | Model: ${model}`);

    return NextResponse.json({ 
      response,
      metadata: {
        queryType,
        tokensUsed: completion.usage?.total_tokens,
        model,
        dataPoints: callData.data.totalRecords || 0
      }
    });

  } catch (error: any) {
    console.error('❌ Error calling OpenAI:', error);

    // Enhanced error handling with specific messages
    if (error?.status === 429) {
      return NextResponse.json(
        { 
          error: 'AI service is currently experiencing high demand. The request will be automatically retried.',
          retryable: true
        },
        { status: 429 }
      );
    }

    if (error?.status === 401) {
      console.error('🔑 Authentication failed - check OpenAI API key');
      return NextResponse.json(
        { error: 'Authentication failed. Please contact your administrator.' },
        { status: 401 }
      );
    }

    if (error?.status === 413 || error?.code === 'context_length_exceeded') {
      return NextResponse.json(
        { 
          error: 'Query too complex for current dataset size. Try filtering your data or asking a more specific question.',
          retryable: false
        },
        { status: 413 }
      );
    }

    if (error?.status === 400) {
      return NextResponse.json(
        { 
          error: 'Invalid request format. Please try rephrasing your question.',
          retryable: false
        },
        { status: 400 }
      );
    }

    // Network or timeout errors
    if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT') {
      return NextResponse.json(
        { 
          error: 'Network timeout. Please try again.',
          retryable: true
        },
        { status: 503 }
      );
    }

    // Generic error with helpful message
    return NextResponse.json(
      { 
        error: `Analysis failed: ${error.message || 'Unknown error'}. Please try again or contact support if the problem persists.`,
        retryable: true
      },
      { status: 500 }
    );
  }
}