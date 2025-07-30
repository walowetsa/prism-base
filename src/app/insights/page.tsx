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
  const [selectedDisposition, setSelectedDisposition] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // get agents
  const uniqueAgents = useMemo(() => {
    const agents = callRecords
      .map((record) => record.agent_username)
      .filter((agent, index, array) => agent && array.indexOf(agent) === index)
      .sort();
    return agents as string[];
  }, [callRecords]);

  // get dispositions
  const uniqueDispositions = useMemo(() => {
    const dispositions = callRecords
      .map((record) => record.disposition_title)
      .filter((disposition, index, array) => disposition && array.indexOf(disposition) === index)
      .sort();
    return dispositions as string[];
  }, [callRecords]);

  const filteredRecords = useMemo(() => {
    let filtered = callRecords;

    if (selectedAgent) {
      filtered = filtered.filter(
        (record) => record.agent_username === selectedAgent
      );
    }

    if (selectedDisposition) {
      filtered = filtered.filter(
        (record) => record.disposition_title === selectedDisposition
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

        case "dateRange":
          if (!startDate && !endDate) return true;
          
          const start = startDate ? new Date(startDate) : null;
          const end = endDate ? new Date(endDate) : null;
          
          // Set time to start and end of day for proper comparison
          if (start) {
            start.setHours(0, 0, 0, 0);
          }
          if (end) {
            end.setHours(23, 59, 59, 999);
          }
          
          const recordDateTime = new Date(record.initiation_timestamp);
          
          if (start && end) {
            return recordDateTime >= start && recordDateTime <= end;
          } else if (start) {
            return recordDateTime >= start;
          } else if (end) {
            return recordDateTime <= end;
          }
          
          return true;

        default:
          return true;
      }
    });
  }, [callRecords, filterPeriod, selectedAgent, selectedDisposition, startDate, endDate]);

  useEffect(() => {
    fetchCallRecords();
  }, []);

  // Initialize default dates when dateRange is selected
  useEffect(() => {
    if (filterPeriod === "dateRange" && !startDate && !endDate) {
      const today = new Date();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      setStartDate(sevenDaysAgo.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    }
  }, [filterPeriod, startDate, endDate]);

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
    
    if (filter !== "dateRange") {
      setStartDate("");
      setEndDate("");
    }
  };

  const handleAgentChange = (agent: string) => {
    setSelectedAgent(agent);
  };

  const handleDispositionChange = (disposition: string) => {
    setSelectedDisposition(disposition);
  };

  const handleStartDateChange = (date: string) => {
    setStartDate(date);
  };

  const handleEndDateChange = (date: string) => {
    setEndDate(date);
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
      <div className="mb-4 flex flex-col gap-4">
        {/* <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600 flex items-center gap-x-4">
            <RefreshButton onRefresh={fetchCallRecords} disabled={loading} />
            {!loading && (
              <>
                Analysing {filteredRecords.length} of {callRecords.length} records
              </>
            )}
          </div>
        </div> */}

        <div className="flex justify-center">
          <CallLogFilters
            selectedFilter={filterPeriod}
            onFilterChange={handleFilterChange}
            selectedAgent={selectedAgent}
            onAgentChange={handleAgentChange}
            agents={uniqueAgents}
            selectedDisposition={selectedDisposition}
            onDispositionChange={handleDispositionChange}
            dispositions={uniqueDispositions}
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={handleStartDateChange}
            onEndDateChange={handleEndDateChange}
            onRefresh={fetchCallRecords}
            disabled={loading}
          />
        </div>
      </div>
      
      <div className="flex gap-x-4 max-h-[calc(100vh-160px)]">
        <div className="flex-1 max-h-[calc(100vh-160px)]">
          <InsightsStatsDashboard
            filteredRecords={filteredRecords}
            totalRecords={callRecords.length}
            loading={loading}
          />
        </div>
        <div className="w-[30vw] min-w-[360px] max-w-[640px] max-h-[calc(100vh-220px)]">
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