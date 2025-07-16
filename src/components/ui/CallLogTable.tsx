"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import CallRecord from "@/types/CallRecord";
import CallLogFilters, { FilterPeriod } from "./CallLogFilters";
import RefreshButton from "./RefreshButton";
import Link from "next/link";

interface CallLogTableProps {
  className?: string;
}

type SortField = "agent" | "timestamp" | "disposition" | null;
type SortDirection = "asc" | "desc";

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const CallLogTable: React.FC<CallLogTableProps> = ({ className }) => {
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [sortState, setSortState] = useState<SortState>({
    field: null,
    direction: "asc",
  });
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("all");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const recordsPerPage = 100;

  // Extract unique agents from call records
  const uniqueAgents = useMemo(() => {
    const agents = callRecords
      .map((record) => record.agent_username)
      .filter((agent, index, array) => agent && array.indexOf(agent) === index)
      .sort();
    return agents as string[];
  }, [callRecords]);

  // Filter records based on initiation_timestamp and selected agent
  const filteredRecords = useMemo(() => {
    let filtered = callRecords;

    // Filter by agent if selected
    if (selectedAgent) {
      filtered = filtered.filter(
        (record) => record.agent_username === selectedAgent
      );
    }

    // Filter by time period
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

  // Sort filtered records based on current sort state
  const sortedRecords = useMemo(() => {
    if (!sortState.field) return filteredRecords;

    const sorted = [...filteredRecords].sort((a, b) => {
      let aValue: string | number | Date;
      let bValue: string | number | Date;

      switch (sortState.field) {
        case "agent":
          aValue = (a.agent_username || "").toLowerCase();
          bValue = (b.agent_username || "").toLowerCase();
          break;
        case "timestamp":
          aValue = new Date(a.initiation_timestamp || 0);
          bValue = new Date(b.initiation_timestamp || 0);
          break;
        case "disposition":
          aValue = (a.disposition_title || "").toLowerCase();
          bValue = (b.disposition_title || "").toLowerCase();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sortState.direction === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortState.direction === "asc" ? 1 : -1;
      }
      return 0;
    });

    return sorted;
  }, [filteredRecords, sortState]);

  const totalPages = Math.ceil(sortedRecords.length / recordsPerPage);

  // Calculate current records to display from sorted results
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = startIndex + recordsPerPage;
  const currentRecords = sortedRecords.slice(startIndex, endIndex);

  useEffect(() => {
    fetchCallRecords();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpenDropdownId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
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

  const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return "N/A";

    try {
      const date = new Date(timestamp);
      return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "Invalid Date";
    }
  };

  const formatCallDuration = (
    duration: string | { minutes: number; seconds: number } | null
  ): string => {
    if (!duration) return "N/A";

    try {
      // If duration is a string, parse it as JSON
      let parsedDuration: { minutes: number; seconds: number };

      if (typeof duration === "string") {
        parsedDuration = JSON.parse(duration);
      } else {
        parsedDuration = duration;
      }

      const { minutes, seconds } = parsedDuration;

      // Validate that we have valid numbers
      if (typeof minutes !== "number" || typeof seconds !== "number") {
        return "N/A";
      }

      if (minutes === 0) {
        return `${seconds}s`;
      }
      return `${minutes}m ${seconds}s`;
    } catch (error) {
      console.error("Error parsing call duration:", error);
      return "N/A";
    }
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setOpenDropdownId(null); // Close dropdown when changing pages
    }
  };

  const generatePageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      const start = Math.max(1, currentPage - 2);
      const end = Math.min(totalPages, start + maxVisiblePages - 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }

    return pages;
  };

  const handleEllipsisClick = (recordId: string) => {
    setOpenDropdownId(openDropdownId === recordId ? null : recordId);
  };

  const handleMoreDetails = (record: CallRecord) => {
    // TODO: add routing to call log overview/transcription page
    console.log("More details for record:", record);
    setOpenDropdownId(null);
  };

  const handleDownloadAudio = (record: CallRecord) => {
    // TODO: Implement api path + implementation for download from recording_url (sftp)
    console.log("Download audio for record:", record);
    setOpenDropdownId(null);
  };

  const handleSort = (field: SortField) => {
    if (!field) return;

    setSortState((prev) => {
      if (prev.field === field) {
        //toggle direction
        return {
          field,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      } else {
        return {
          field,
          direction: "asc",
        };
      }
    });

    // Reset to first page
    setCurrentPage(1);
  };

  const handleFilterChange = (filter: FilterPeriod) => {
    setFilterPeriod(filter);
    setCurrentPage(1); // Reset to first page
  };

  const handleAgentChange = (agent: string) => {
    setSelectedAgent(agent);
    setCurrentPage(1); // Reset to first page
  };

  const getSortIcon = (field: SortField) => {
    if (sortState.field !== field) {
      return <span className="ml-1 text-gray-400">↕</span>;
    }

    return (
      <span className="ml-1 text-gray-700">
        {sortState.direction === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  const successfulOutcomes = [
    'Conversation - Lead Generated: New Business',
    'Conversation - Lead Generated: X Sell'
  ]

  const isSuccessfulOutcome = (dispositionTitle: string | null): boolean => {
    if (!dispositionTitle) return false;
    return successfulOutcomes.includes(dispositionTitle);
  };

  const getSortableHeaderClass = (field: SortField) => {
    const baseClass =
      "px-4 py-3 text-left text-xs font-medium text-emerald-800 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none";
    const activeClass = sortState.field === field ? "bg-gray-100" : "";
    return `${baseClass} ${activeClass}`;
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-gray-600">Loading call records...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 ${className}`}>
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

  if (callRecords.length === 0) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-gray-600">No call records found.</div>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Table Header Info */}
      <div className="mb-4 flex justify-between items-center gap-x-4">
        <div className="text-sm text-gray-600 flex items-center gap-x-4">
          <RefreshButton onRefresh={fetchCallRecords} disabled={loading} />
          Showing {startIndex + 1}-{Math.min(endIndex, sortedRecords.length)} of{" "}
          {sortedRecords.length} records
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
        <div>
          <Link href={"/insights"}>
            <button className="px-3 py-1.5 text-sm font-bold rounded-full bg-emerald-800 text-white min-w-[150px] cursor-pointer">
              Insights
            </button>
          </Link>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-auto max-h-[80vh]">
          <table className="w-full table-fixed">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th
                  className={`${getSortableHeaderClass("agent")} w-64`}
                  onClick={() => handleSort("agent")}
                >
                  <div className="flex items-center text-emerald-800">
                    Agent
                    <span className="text-lg">{getSortIcon("agent")}</span>
                  </div>
                </th>
                <th
                  className={`${getSortableHeaderClass("timestamp")} w-64`}
                  onClick={() => handleSort("timestamp")}
                >
                  <div className="flex items-center text-emerald-800">
                    Timestamp
                    <span className="text-lg">{getSortIcon("timestamp")}</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-emerald-800 uppercase tracking-wider w-24">
                  Duration
                </th>
                <th
                  className={`${getSortableHeaderClass("disposition")} w-80`}
                  onClick={() => handleSort("disposition")}
                >
                  <div className="flex items-center text-emerald-800">
                    Disposition
                    <span className="text-lg">
                      {getSortIcon("disposition")}
                    </span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-emerald-800 uppercase tracking-wider w-16">
                  
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-emerald-800 uppercase tracking-wider">
                  Summary
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-emerald-800 uppercase tracking-wider w-20"></th>
              </tr>
            </thead>
            <tbody className="bg-black divide-y divide-neutral-200">
              {currentRecords.map((record) => (
                <tr
                  key={record.contact_id}
                  className="hover:bg-neutral-600 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-white w-64 truncate">
                    {record.agent_username || "N/A"}
                  </td>
                  <td className="px-4 py-3 text-sm text-white w-64">
                    {formatTimestamp(record.initiation_timestamp)}
                  </td>
                  <td className="px-4 py-3 text-sm text-white w-24">
                    {formatCallDuration(record.call_duration)}
                  </td>
                  <td className="px-4 py-3 text-sm text-white w-80 truncate">
                    {record.disposition_title || "N/A"}
                  </td>
                  <td className="px-4 py-3 text-sm text-white w-16 text-center">
                    {isSuccessfulOutcome(record.disposition_title) && (
                      <span className="text-green-400 text-lg" title="Successful outcome">
                        ✓
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-white">
                    <div
                      className="truncate"
                      title={record.call_summary || "N/A"}
                    >
                      {record.call_summary || "N/A"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-white w-20 relative">
                    <div
                      ref={openDropdownId === record.id ? dropdownRef : null}
                    >
                      <button
                        onClick={() => handleEllipsisClick(record.contact_id)}
                        className="text-white hover:text-gray-300 focus:outline-none focus:text-gray-300 p-1 rounded transition-colors"
                        aria-label="More actions"
                      >
                        ⋯
                      </button>

                      {openDropdownId === record.contact_id && (
                        <div className="absolute right-16 top-4 mt-1 w-40 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                          <div className="py-1">
                            <Link href={`./${record.contact_id}`}>
                              <button
                                onClick={() => handleMoreDetails(record)}
                                className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left transition-colors"
                              >
                                More Details
                              </button>
                            </Link>
                            <button
                              onClick={() => handleDownloadAudio(record)}
                              className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left transition-colors"
                            >
                              Download Audio
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`px-3 py-2 text-sm font-medium rounded-md ${
                currentPage === 1
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              Previous
            </button>

            <div className="flex items-center space-x-1">
              {generatePageNumbers().map((page) => (
                <button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={`px-3 py-2 text-sm font-medium rounded-md ${
                    currentPage === page
                      ? "bg-emerald-800 text-white"
                      : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`px-3 py-2 text-sm font-medium rounded-md ${
                currentPage === totalPages
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              Next
            </button>
          </div>

          <div className="text-sm text-gray-600">
            Total: {sortedRecords.length} records
          </div>
        </div>
      )}
    </div>
  );
};

export default CallLogTable;