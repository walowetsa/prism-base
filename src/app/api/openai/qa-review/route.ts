import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Criteria {
  id: number;
  description: string;
  type: "Number" | "Boolean" | "String";
}

interface CallRecord {
  id: string;
  contact_id: string;
  transcript_text: string;
  agent_username: string | null;
  initiation_timestamp: string;
  [key: string]: any;
}

interface AssessmentResult {
  criteriaId: number;
  criteriaDescription: string;
  type: string;
  score?: number; // For Number type (1-10)
  result?: string; // For Boolean (YES/NO) or String (Unsatisfactory/Somewhat Satisfactory/Very Satisfactory)
  justification: string;
  transcriptExcerpt?: string; // For Boolean type
}

interface CallAssessment {
  callId: string;
  timestamp: string;
  assessments: AssessmentResult[];
}

interface AgentReport {
  agentUsername: string;
  callsReviewed: number;
  callAssessments: CallAssessment[];
  summary: {
    averageScores: { [key: string]: number };
    overallAssessment: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      criteria,
      selectedAgents,
      callRecords,
      numberOfCalls,
    }: {
      criteria: Criteria[];
      selectedAgents: string[];
      callRecords: CallRecord[];
      numberOfCalls: number;
    } = body;

    console.log("=== QA Review Request Started ===");
    console.log(`Criteria count: ${criteria?.length || 0}`);
    console.log(`Selected agents: ${selectedAgents?.join(", ") || "none"}`);
    console.log(`Call records received: ${callRecords?.length || 0}`);
    console.log(`Number of calls per agent: ${numberOfCalls}`);

    // Validate input
    if (!criteria || criteria.length === 0) {
      return NextResponse.json(
        { error: "No criteria provided" },
        { status: 400 }
      );
    }

    if (!selectedAgents || selectedAgents.length === 0) {
      return NextResponse.json(
        { error: "No agents selected" },
        { status: 400 }
      );
    }

    if (!callRecords || callRecords.length === 0) {
      return NextResponse.json(
        { error: "No call records provided" },
        { status: 400 }
      );
    }

    if (!numberOfCalls || numberOfCalls < 1) {
      return NextResponse.json(
        { error: "Invalid number of calls" },
        { status: 400 }
      );
    }

    const agentReports: AgentReport[] = [];

    // Process each agent
    for (const agent of selectedAgents) {
      console.log(`\n--- Processing agent: ${agent} ---`);
      
      // Filter call records for this agent and limit to numberOfCalls
      const agentCalls = callRecords
        .filter((call) => call.agent_username === agent)
        .slice(0, numberOfCalls);

      console.log(`Found ${agentCalls.length} calls for ${agent}`);

      if (agentCalls.length === 0) {
        console.log(`No calls found for ${agent}`);
        agentReports.push({
          agentUsername: agent,
          callsReviewed: 0,
          callAssessments: [],
          summary: {
            averageScores: {},
            overallAssessment: "No calls found for this agent in the specified period.",
          },
        });
        continue;
      }

      // Log transcript info
      agentCalls.forEach((call, idx) => {
        const transcriptLength = call.transcript_text?.length || 0;
        console.log(`  Call ${idx + 1}: ID=${call.id}, Transcript length=${transcriptLength}`);
      });

      const callAssessments: CallAssessment[] = [];

      // Process each call
      for (let i = 0; i < agentCalls.length; i++) {
        const call = agentCalls[i];
        console.log(`\nAssessing call ${i + 1}/${agentCalls.length} for ${agent}...`);
        
        const assessments = await assessCallWithOpenAI(
          call.transcript_text,
          criteria
        );

        callAssessments.push({
          callId: call.id,
          timestamp: call.initiation_timestamp,
          assessments,
        });
      }

      // Calculate summary
      const summary = calculateAgentSummary(callAssessments, criteria);

      agentReports.push({
        agentUsername: agent,
        callsReviewed: agentCalls.length,
        callAssessments,
        summary,
      });

      console.log(`Completed processing ${agentCalls.length} calls for ${agent}`);
    }

    console.log("\n=== QA Review Request Completed ===");
    console.log(`Total agents processed: ${agentReports.length}`);
    console.log(`Total calls assessed: ${agentReports.reduce((sum, r) => sum + r.callsReviewed, 0)}`);

    return NextResponse.json({
      success: true,
      reports: agentReports,
    });
  } catch (error) {
    console.error("Error in QA assessment:", error);
    return NextResponse.json(
      {
        error: "Failed to process QA assessment",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function assessCallWithOpenAI(
  transcript: string,
  criteria: Criteria[]
): Promise<AssessmentResult[]> {
  // Check if transcript is empty
  if (!transcript || transcript.trim().length === 0) {
    console.warn("Empty transcript provided");
    return criteria.map((criterion) => ({
      criteriaId: criterion.id,
      criteriaDescription: criterion.description,
      type: criterion.type,
      justification: "Transcript is empty or unavailable",
      ...(criterion.type === "Number" && { score: 5 }),
      ...(criterion.type !== "Number" && {
        result: criterion.type === "Boolean" ? "NO" : "Somewhat Satisfactory",
      }),
    }));
  }

  console.log(`Assessing transcript (${transcript.length} chars) with ${criteria.length} criteria`);

  // Build the assessment prompt with clear JSON structure
  const prompt = `You are a quality assurance expert reviewing customer service call transcripts. 

Analyze the following call transcript and assess it based on the criteria below.

TRANSCRIPT:
${transcript}

ASSESSMENT CRITERIA:
${criteria.map((c, index) => {
  let instruction = "";
  if (c.type === "Number") {
    instruction = `Score from 1-10 and provide justification`;
  } else if (c.type === "Boolean") {
    instruction = `Answer YES or NO and provide a relevant transcript excerpt that supports your answer`;
  } else if (c.type === "String") {
    instruction = `Answer with "Unsatisfactory", "Somewhat Satisfactory", or "Very Satisfactory" and provide justification`;
  }
  return `${index + 1}. ${c.description} (${c.type}): ${instruction}`;
}).join("\n")}

IMPORTANT: Respond with a JSON object where each criterion is a key using the format "criterion_N" where N is the criterion number (1, 2, 3, etc.).

For Number type:
{
  "criterion_1": {
    "score": <number 1-10>,
    "justification": "<your reasoning>"
  }
}

For Boolean type:
{
  "criterion_1": {
    "result": "<YES or NO>",
    "excerpt": "<relevant quote from transcript>",
    "justification": "<your reasoning>"
  }
}

For String type:
{
  "criterion_1": {
    "result": "<Unsatisfactory or Somewhat Satisfactory or Very Satisfactory>",
    "justification": "<your reasoning>"
  }
}`;

  try {
    console.log("Sending request to OpenAI...");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a quality assurance expert. Provide objective, detailed assessments of customer service calls based on specific criteria. Always format your response as valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const response = completion.choices[0].message.content;
    if (!response) {
      throw new Error("Empty response from OpenAI");
    }

    console.log("Received response from OpenAI, parsing...");
    
    // Parse the response
    const parsed = JSON.parse(response);
    console.log("Parsed OpenAI response:", JSON.stringify(parsed, null, 2));

    // Convert to our AssessmentResult format
    const results: AssessmentResult[] = criteria.map((criterion, index) => {
      const criterionKey = `criterion_${index + 1}`;
      const assessment = parsed[criterionKey];

      if (!assessment) {
        console.warn(`No assessment found for ${criterionKey}`);
        return {
          criteriaId: criterion.id,
          criteriaDescription: criterion.description,
          type: criterion.type,
          justification: "Assessment not provided by AI",
          ...(criterion.type === "Number" && { score: 5 }),
          ...(criterion.type !== "Number" && {
            result: criterion.type === "Boolean" ? "NO" : "Somewhat Satisfactory",
          }),
        };
      }

      let result: AssessmentResult = {
        criteriaId: criterion.id,
        criteriaDescription: criterion.description,
        type: criterion.type,
        justification: assessment.justification || "No justification provided",
      };

      if (criterion.type === "Number") {
        result.score = assessment.score || 5;
      } else if (criterion.type === "Boolean") {
        result.result = assessment.result || "NO";
        result.transcriptExcerpt = assessment.excerpt || "";
      } else if (criterion.type === "String") {
        result.result = assessment.result || "Somewhat Satisfactory";
      }

      return result;
    });

    console.log(`Successfully assessed ${results.length} criteria`);
    return results;
  } catch (error) {
    console.error("OpenAI assessment error:", error);
    // Return default assessments on error
    return criteria.map((criterion) => ({
      criteriaId: criterion.id,
      criteriaDescription: criterion.description,
      type: criterion.type,
      justification: `Error during assessment: ${error instanceof Error ? error.message : "Unknown error"}`,
      ...(criterion.type === "Number" && { score: 5 }),
      ...(criterion.type !== "Number" && {
        result: criterion.type === "Boolean" ? "NO" : "Somewhat Satisfactory",
      }),
    }));
  }
}

function calculateAgentSummary(
  callAssessments: CallAssessment[],
  criteria: Criteria[]
) {
  const averageScores: { [key: string]: number } = {};

  // Calculate average scores for Number type criteria
  criteria.forEach((criterion) => {
    if (criterion.type === "Number") {
      const scores = callAssessments.flatMap((call) =>
        call.assessments
          .filter((a) => a.criteriaId === criterion.id && a.score)
          .map((a) => a.score!)
      );

      if (scores.length > 0) {
        const average = scores.reduce((a, b) => a + b, 0) / scores.length;
        averageScores[criterion.description] = Math.round(average * 10) / 10;
      }
    }
  });

  // Generate overall assessment
  const totalCalls = callAssessments.length;
  const avgScore =
    Object.values(averageScores).reduce((a, b) => a + b, 0) /
    Object.values(averageScores).length;

  let overallAssessment = "";
  if (avgScore >= 8) {
    overallAssessment = `Excellent performance across ${totalCalls} calls reviewed. Agent consistently meets or exceeds quality standards.`;
  } else if (avgScore >= 6) {
    overallAssessment = `Good performance across ${totalCalls} calls reviewed. Agent generally meets quality standards with room for improvement.`;
  } else if (avgScore >= 4) {
    overallAssessment = `Fair performance across ${totalCalls} calls reviewed. Agent needs improvement in several areas.`;
  } else {
    overallAssessment = `Below expectations across ${totalCalls} calls reviewed. Agent requires significant coaching and support.`;
  }

  return {
    averageScores,
    overallAssessment,
  };
}