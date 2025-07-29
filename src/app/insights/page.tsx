"use client";

import { useState, useEffect, useMemo } from "react";
import CallRecord from "@/types/CallRecord";
import CallLogFilters, {
  FilterPeriod,
} from "../../components/ui/CallLogFilters";
import RefreshButton from "../../components/ui/RefreshButton";
import InsightsStatsDashboard from "../../components/dashboards/InsightsStatsDashboard";
import CallRecordsChat from "../../components/ai/CallRecordsChat";

const InsightsPage = () => {
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("today");
  const [selectedAgent, setSelectedAgent] = useState<string>("");

  // get agents
  const uniqueAgents = useMemo(() => {
    const agents = callRecords
      .map((record) => record.agent_username)
      .filter((agent, index, array) => agent && array.indexOf(agent) === index)
      .sort();
    return agents as string[];
  }, [callRecords]);

  const filteredRecords = useMemo(() => {
    let filtered = callRecords;

    if (selectedAgent) {
      filtered = filtered.filter(
        (record) => record.agent_username === selectedAgent
      );
    }

    if (filterPeriod === "all") return filtered;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return filtered.filter((record) => {
      if (!record.initiation_timestamp) return false;

      const recordDate = new Date(record.initiation_timestamp);
      const recordDay = new Date(
        recordDate.getFullYear(),
        recordDate.getMonth(),
        recordDate.getDate()
      );

      switch (filterPeriod) {
        case "today":
          return recordDay.getTime() === today.getTime();

        case "yesterday":
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          return recordDay.getTime() === yesterday.getTime();

        case "last7days":
          const sevenDaysAgo = new Date(today);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          return recordDate >= sevenDaysAgo;

        case "lastMonth":
          const thirtyDaysAgo = new Date(today);
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          return recordDate >= thirtyDaysAgo;

        default:
          return true;
      }
    });
  }, [callRecords, filterPeriod, selectedAgent]);

  useEffect(() => {
    fetchCallRecords();
  }, []);

  const fetchCallRecords = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/supabase/call-logs");

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setCallRecords(result.data || []);
    } catch (err) {
      console.error("Error fetching call records:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch call records"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (filter: FilterPeriod) => {
    setFilterPeriod(filter);
  };

  const handleAgentChange = (agent: string) => {
    setSelectedAgent(agent);
  };

  if (error) {
    return (
      <div className="flex-1 p-4">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800">
            <strong>Error:</strong> {error}
          </div>
          <button
            onClick={fetchCallRecords}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 ">
      <div className="mb-4 flex justify-between items-center gap-x-4">
        <div className="text-sm text-gray-600 flex items-center gap-x-4">
          <RefreshButton onRefresh={fetchCallRecords} disabled={loading} />
          {!loading && (
            <>
              Analysing {filteredRecords.length} of {callRecords.length} records
            </>
          )}
        </div>

        <div className="flex items-center gap-3 flex-1">
          <CallLogFilters
            selectedFilter={filterPeriod}
            onFilterChange={handleFilterChange}
            selectedAgent={selectedAgent}
            onAgentChange={handleAgentChange}
            agents={uniqueAgents}
          />
        </div>
      </div>
      <div className="flex gap-x-4 max-h-[calc(100vh-120px)]">
        <div className="flex-1 max-h-[calc(100vh-120px)]">
          <InsightsStatsDashboard
            filteredRecords={filteredRecords}
            totalRecords={callRecords.length}
            loading={loading}
          />
        </div>
        <div className="w-[30vw] min-w-[360px] max-w-[640px] h-[85vh]">
          <CallRecordsChat
            filteredRecords={filteredRecords}
            totalRecords={callRecords.length}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
};

export default InsightsPage;
