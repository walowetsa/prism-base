"use client";
import { useState } from "react";

interface Criteria {
  id: number;
  description: string;
  type: "Number" | "Boolean" | "String";
}

interface CallRecord {
  id: string;
  contact_id: string;
  transcript_text: string;
  recording_location: string;
  agent_username: string | null;
  queue_name: string | null;
  initiation_timestamp: string;
  speaker_data: any[] | null;
  entities: any[] | null;
  categories: string[] | null;
  disposition_title: string | null;
  processed_at: string | null;
  call_summary: string | null;
  campaign_name: string | null;
  campaign_id: number | null;
  customer_cli: string | null;
  total_hold_time: any | null;
  agent_hold_time: string | null;
  time_in_queue: any | null;
  call_duration: any | null;
  primary_category: string | null;
  sentiment_analysis: any[] | null;
}

interface QADashboardProps {
  agentList: string[];
  callRecords: CallRecord[];
}

const QADashboard = ({ agentList, callRecords }: QADashboardProps) => {
  const [criteriaList, setCriteriaList] = useState<Criteria[]>([
    { id: 1, description: "", type: "Number" },
  ]);
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  
  // QA Review Configuration
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [numberOfCalls, setNumberOfCalls] = useState<number>(10);
  
  // QA Review Results
  const [isProcessing, setIsProcessing] = useState(false);
  const [qaResults, setQaResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const addCriteria = () => {
    const newId =
      criteriaList.length > 0
        ? Math.max(...criteriaList.map((c) => c.id)) + 1
        : 1;
    setCriteriaList([
      ...criteriaList,
      { id: newId, description: "", type: "Number" },
    ]);
  };

  const updateCriteriaDescription = (id: number, description: string) => {
    setCriteriaList(
      criteriaList.map((c) => (c.id === id ? { ...c, description } : c))
    );
  };

  const updateCriteriaType = (
    id: number,
    type: "Number" | "Boolean" | "String"
  ) => {
    setCriteriaList(
      criteriaList.map((c) => (c.id === id ? { ...c, type } : c))
    );
    setOpenDropdownId(null);
  };

  const removeCriteria = (id: number) => {
    setCriteriaList(criteriaList.filter((c) => c.id !== id));
  };

  const toggleDropdown = (id: number) => {
    setOpenDropdownId(openDropdownId === id ? null : id);
  };

  const toggleAgent = (agent: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agent)
        ? prev.filter((a) => a !== agent)
        : [...prev, agent]
    );
  };

  const handleSubmitQAReview = async () => {
    // Validation
    if (selectedAgents.length === 0) {
      setError("Please select at least one agent");
      return;
    }

    if (criteriaList.some((c) => !c.description.trim())) {
      setError("Please fill in all criteria descriptions");
      return;
    }

    if (!startDate || !endDate) {
      setError("Please select both start and end dates");
      return;
    }

    // Filter call records by selected agents and date range
    const filteredCalls = callRecords.filter((call) => {
      const callDate = new Date(call.initiation_timestamp);
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include entire end date

      return (
        call.agent_username &&
        selectedAgents.includes(call.agent_username) &&
        callDate >= start &&
        callDate <= end
      );
    });

    console.log("=== QA Review Submission ===");
    console.log("Total call records available:", callRecords.length);
    console.log("Selected agents:", selectedAgents);
    console.log("Date range:", startDate, "to", endDate);
    console.log("Filtered calls:", filteredCalls.length);
    console.log("Number of calls per agent:", numberOfCalls);
    
    // Log sample call data
    if (filteredCalls.length > 0) {
      const sampleCall = filteredCalls[0];
      const agentSegments = sampleCall.speaker_data?.filter(s => 
        s.speakerRole?.toLowerCase() === 'agent'
      ) || [];
      
      console.log("Sample call record:", {
        id: sampleCall.id,
        agent: sampleCall.agent_username,
        timestamp: sampleCall.initiation_timestamp,
        totalSpeakerSegments: sampleCall.speaker_data?.length || 0,
        agentSegments: agentSegments.length,
        hasSpeakerData: !!sampleCall.speaker_data,
        sampleAgentText: agentSegments[0]?.text?.substring(0, 100) || "No agent text found"
      });
    }

    if (filteredCalls.length === 0) {
      setError("No calls found for the selected agents and date range");
      return;
    }

    setError(null);
    setIsProcessing(true);
    setQaResults(null);

    try {
      const requestBody = {
        criteria: criteriaList,
        selectedAgents,
        callRecords: filteredCalls,
        numberOfCalls,
      };

      console.log("Sending request to API...");
      console.log("Criteria count:", criteriaList.length);
      console.log("Call records being sent:", filteredCalls.length);

      const response = await fetch("/api/openai/qa-review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      console.log("API Response:", data);

      if (!response.ok) {
        throw new Error(data.error || "Failed to process QA review");
      }

      setQaResults(data);
      console.log("QA Results set successfully");
    } catch (err) {
      console.error("Error during QA review:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="flex-1 p-4 space-y-6 max-h-[calc(100vh-160px)] overflow-y-scroll  [&::-webkit-scrollbar]:w-2
  [&::-webkit-scrollbar-track]:rounded-full
  [&::-webkit-scrollbar-track]:bg-gray-100
  [&::-webkit-scrollbar-thumb]:rounded-full
  [&::-webkit-scrollbar-thumb]:bg-gray-300
  dark:[&::-webkit-scrollbar-track]:bg-neutral-700
  dark:[&::-webkit-scrollbar-thumb]:bg-neutral-500"
    >
      <div className="flex flex-col gap-4">
        <div className="bg-black/60 p-6 rounded-lg shadow-sm">
          <div className="text-2xl font-bold text-[var(--color-text-primary)] mb-4">
            Assessment Criteria
          </div>
          <div className="space-y-4">
            {criteriaList.map((criteria, index) => (
              <fieldset
                key={criteria.id}
                className="text-[var(--color-text-primary)] border border-white relative rounded-lg"
              >
                <legend className="px-2 text-right">
                  Criteria #{index + 1}
                </legend>
                <div className="p-2 flex gap-2">
                  <div className="flex-1 flex flex-col">
                    <label htmlFor={`description-${criteria.id}`}>
                      Criteria Description:
                    </label>
                    <input
                      id={`description-${criteria.id}`}
                      type="text"
                      className="bg-white text-black px-2 rounded-lg"
                      placeholder="Did the agent greet the customer warmly?"
                      value={criteria.description}
                      onChange={(e) =>
                        updateCriteriaDescription(criteria.id, e.target.value)
                      }
                    />
                  </div>
                  <div className="flex flex-col relative">
                    <label htmlFor={`type-${criteria.id}`}>
                      Criteria Type:
                    </label>
                    <button
                      id={`type-${criteria.id}`}
                      className="bg-white text-black px-2 rounded-lg cursor-pointer min-w-[100px]"
                      onClick={() => toggleDropdown(criteria.id)}
                    >
                      {criteria.type}
                    </button>
                    {openDropdownId === criteria.id && (
                      <div className="flex flex-col bg-white mt-2 text-black rounded-lg absolute top-full left-0 w-full z-10">
                        <button
                          className="cursor-pointer hover:bg-black/20 px-2 py-1"
                          onClick={() =>
                            updateCriteriaType(criteria.id, "Number")
                          }
                        >
                          Number
                        </button>
                        <button
                          className="cursor-pointer hover:bg-black/20 px-2 py-1"
                          onClick={() =>
                            updateCriteriaType(criteria.id, "Boolean")
                          }
                        >
                          Boolean
                        </button>
                        <button
                          className="cursor-pointer hover:bg-black/20 px-2 py-1"
                          onClick={() =>
                            updateCriteriaType(criteria.id, "String")
                          }
                        >
                          String
                        </button>
                      </div>
                    )}
                  </div>
                  {criteriaList.length > 1 && (
                    <div className="flex items-end">
                      <button
                        className="bg-red-500 hover:bg-red-600 text-white w-6 h-6 rounded-lg cursor-pointer transition"
                        onClick={() => removeCriteria(criteria.id)}
                        aria-label={`Remove criteria ${index + 1}`}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </fieldset>
            ))}
          </div>
          <button
            className="mt-4 bg-[var(--color-bg-primary)] border-2 border-black/60 rounded-lg w-full cursor-pointer hover:bg-white/80 transition py-1"
            onClick={addCriteria}
          >
            +
          </button>
        </div>

        {/* QA Review Configuration */}
        <div className="bg-black/60 p-6 rounded-lg shadow-sm">
          <div className="text-2xl font-bold text-[var(--color-text-primary)] mb-4">
            QA Review Configuration
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label 
                  htmlFor="start-date" 
                  className="text-[var(--color-text-primary)] mb-2"
                >
                  Start Date:
                </label>
                <input
                  id="start-date"
                  type="date"
                  className="bg-white text-black px-3 py-2 rounded-lg cursor-pointer"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col">
                <label 
                  htmlFor="end-date" 
                  className="text-[var(--color-text-primary)] mb-2"
                >
                  End Date:
                </label>
                <input
                  id="end-date"
                  type="date"
                  className="bg-white text-black px-3 py-2 rounded-lg cursor-pointer"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                />
              </div>
            </div>
            <div className="flex flex-col">
              <label 
                htmlFor="number-of-calls" 
                className="text-[var(--color-text-primary)] mb-2"
              >
                Number of Calls to Review:
              </label>
              <input
                id="number-of-calls"
                type="number"
                min="1"
                max="1000"
                className="bg-white text-black px-3 py-2 rounded-lg w-full md:w-1/2"
                value={numberOfCalls}
                onChange={(e) => setNumberOfCalls(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>
        </div>

        {/* Agent Selection */}
        <div className="bg-black/60 p-6 rounded-lg shadow-sm">
          <div className="text-2xl font-bold text-[var(--color-text-primary)] mb-4">
            Agent Selection:
          </div>
          {agentList.length === 0 ? (
            <div className="text-[var(--color-text-primary)] text-sm">
              No agents available
            </div>
          ) : (
            <ul 
              className={`grid gap-3 ${
                agentList.length <= 4 
                  ? 'grid-cols-2' 
                  : agentList.length <= 8
                  ? 'grid-cols-3'
                  : 'grid-cols-4'
              }`}
            >
              {agentList.map((agent) => (
                <li key={agent} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`agent-${agent}`}
                    checked={selectedAgents.includes(agent)}
                    onChange={() => toggleAgent(agent)}
                    className="w-4 h-4 cursor-pointer accent-[var(--color-bg-primary)]"
                  />
                  <label
                    htmlFor={`agent-${agent}`}
                    className="text-[var(--color-text-primary)] cursor-pointer text-sm"
                  >
                    {agent}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {selectedAgents.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/20">
              <div className="text-sm text-[var(--color-text-primary)]">
                Selected: {selectedAgents.length} agent{selectedAgents.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </div>

        {/* Submit Section */}
        <div className="bg-black/60 p-6 rounded-lg shadow-sm">
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-[var(--color-text-primary)]">
              {error}
            </div>
          )}
          <button
            onClick={handleSubmitQAReview}
            disabled={isProcessing}
            className={`w-full py-3 px-6 rounded-lg font-semibold text-lg transition ${
              isProcessing
                ? "bg-gray-500 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
            }`}
          >
            {isProcessing ? "Processing QA Reviews..." : "Start QA Review"}
          </button>
          {isProcessing && (
            <div className="mt-4 text-center text-[var(--color-text-primary)] text-sm">
              <div className="animate-pulse">
                Analysing calls... This may take a few minutes.
              </div>
            </div>
          )}
        </div>

        {/* Results Section */}
        {qaResults && qaResults.reports && (
          <div className="space-y-6">
            <div className="text-2xl font-bold text-[var(--color-text-primary)]">
              QA Review Results
            </div>
            {qaResults.reports.map((report: any) => (
              <div
                key={report.agentUsername}
                className="bg-black/60 p-6 rounded-lg shadow-sm"
              >
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-[var(--color-text-primary)]">
                    Agent: {report.agentUsername}
                  </h3>
                  <p className="text-[var(--color-text-primary)] text-sm mt-1">
                    Calls Reviewed: {report.callsReviewed}
                  </p>
                </div>

                {/* Summary */}
                <div className="mb-6 p-4 bg-white/10 rounded-lg">
                  <h4 className="font-semibold text-[var(--color-text-primary)] mb-2">
                    Overall Assessment
                  </h4>
                  <p className="text-[var(--color-text-primary)] text-sm mb-3">
                    {report.summary.overallAssessment}
                  </p>
                  {Object.keys(report.summary.averageScores).length > 0 && (
                    <div>
                      <h5 className="font-semibold text-[var(--color-text-primary)] text-sm mb-2">
                        Average Scores:
                      </h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {Object.entries(report.summary.averageScores).map(
                          ([criteria, score]: [string, any]) => (
                            <div
                              key={criteria}
                              className="text-[var(--color-text-primary)] text-sm"
                            >
                              <span className="font-medium">{criteria}:</span>{" "}
                              <span
                                className={`font-bold ${
                                  score >= 8
                                    ? "text-green-400"
                                    : score >= 6
                                    ? "text-yellow-400"
                                    : "text-red-400"
                                }`}
                              >
                                {score}/10
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Detailed Call Assessments */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-[var(--color-text-primary)]">
                    Individual Call Assessments
                  </h4>
                  {report.callAssessments.map((call: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-4 bg-white/5 rounded-lg border border-white/10"
                    >
                      <div className="mb-3 flex justify-between items-start">
                        <h5 className="font-semibold text-[var(--color-text-primary)]">
                          Call #{idx + 1}
                        </h5>
                        <span className="text-[var(--color-text-primary)] text-xs opacity-70">
                          {new Date(call.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/20">
                              <th className="text-left py-2 px-2 text-[var(--color-text-primary)]">
                                Criteria
                              </th>
                              <th className="text-left py-2 px-2 text-[var(--color-text-primary)]">
                                Result
                              </th>
                              <th className="text-left py-2 px-2 text-[var(--color-text-primary)]">
                                Justification
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {call.assessments.map((assessment: any) => (
                              <tr
                                key={assessment.criteriaId}
                                className="border-b border-white/10"
                              >
                                <td className="py-2 px-2 text-[var(--color-text-primary)]">
                                  {assessment.criteriaDescription}
                                </td>
                                <td className="py-2 px-2 text-[var(--color-text-primary)]">
                                  {assessment.type === "Number" ? (
                                    <span
                                      className={`font-bold ${
                                        assessment.score >= 8
                                          ? "text-green-400"
                                          : assessment.score >= 6
                                          ? "text-yellow-400"
                                          : "text-red-400"
                                      }`}
                                    >
                                      {assessment.score}/10
                                    </span>
                                  ) : (
                                    <span className="font-medium">
                                      {assessment.result}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-[var(--color-text-primary)] text-xs">
                                  {assessment.justification}
                                  {assessment.transcriptExcerpt && (
                                    <div className="mt-1 p-2 bg-black/30 rounded italic">
                                      "{assessment.transcriptExcerpt}"
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default QADashboard;