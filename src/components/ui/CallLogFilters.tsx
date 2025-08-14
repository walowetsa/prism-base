"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

export type FilterPeriod =
  | "all"
  | "today"
  | "yesterday"
  | "last7days"
  | "lastMonth"
  | "dateRange";

interface CallLogFiltersProps {
  selectedFilter: FilterPeriod;
  onFilterChange: (filter: FilterPeriod) => void;
  selectedAgent: string;
  onAgentChange: (agent: string) => void;
  agents: string[];
  selectedDisposition: string;
  onDispositionChange: (disposition: string) => void;
  dispositions: string[];
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onRefresh: () => Promise<void>;
  disabled?: boolean;
  className?: string;
}

const CallLogFilters: React.FC<CallLogFiltersProps> = ({
  selectedFilter,
  onFilterChange,
  selectedAgent,
  onAgentChange,
  agents,
  selectedDisposition,
  onDispositionChange,
  dispositions,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onRefresh,
  disabled = false,
  className,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filterOptions = useMemo(
    () => [
      { value: "all" as FilterPeriod, label: "All" },
      { value: "today" as FilterPeriod, label: "Today" },
      { value: "yesterday" as FilterPeriod, label: "Yesterday" },
      { value: "last7days" as FilterPeriod, label: "Last 7 Days" },
      { value: "lastMonth" as FilterPeriod, label: "Last Month" },
      { value: "dateRange" as FilterPeriod, label: "Date Range" },
    ],
    []
  );

  const getButtonClass = (isSelected: boolean) => {
    const baseClass =
      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200";

    if (isSelected) {
      return `${baseClass} bg-emerald-800 text-white shadow-sm`;
    }

    return `${baseClass} bg-neutral-200 text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400`;
  };

  const formatDateForInput = (date: Date): string => {
    return date.toISOString().split("T")[0];
  };

  const getTodayDate = (): string => {
    return formatDateForInput(new Date());
  };

  const getDefaultStartDate = (): string => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return formatDateForInput(date);
  };

  const handleRefresh = async () => {
    if (isRefreshing || disabled) return;

    try {
      setIsRefreshing(true);
      await onRefresh();
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const pathname = usePathname()

  return (
    <div className={`flex gap-4 ${className} flex-col w-full`}>
      <div className="flex gap-x-4">
        {/* Refresh button */}
        <div className="flex items-center">
          <button
            onClick={handleRefresh}
            disabled={disabled || isRefreshing}
            className={`bg-black w-8 h-8 rounded-full flex items-center justify-center cursor-pointer group text-emerald-600`}
            title="Refresh call records"
          >
            <svg
              className={`w-4 h-4 group-hover:rotate-90 transition-all ${
                isRefreshing ? 'animate-spin' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        {/* filter by agent */}
        <div className="flex items-center">
          <label
            htmlFor="agent-select"
            className="mr-2 text-sm font-medium text-gray-700"
          >
            Agent:
          </label>
          <select
            id="agent-select"
            value={selectedAgent}
            onChange={(e) => onAgentChange(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-full bg-neutral-200 text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-200 min-w-[150px]"
          >
            <option value="">All Agents</option>
            {agents.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>
        </div>

        {/* filter by disposition */}
        <div className="flex items-center">
          <label
            htmlFor="disposition-select"
            className="mr-2 text-sm font-medium text-gray-700"
          >
            Disposition:
          </label>
          <select
            id="disposition-select"
            value={selectedDisposition}
            onChange={(e) => onDispositionChange(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-full bg-neutral-200 text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-200 min-w-[200px]"
          >
            <option value="">All Dispositions</option>
            {dispositions.map((disposition) => (
              <option key={disposition} value={disposition}>
                {disposition}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto">
          {
            pathname === '/insights' ?
          <Link href={"/"}>
            <button className="px-3 py-1.5 text-sm border-none font-bold rounded-md bg-emerald-800 text-white min-w-[150px] cursor-pointer">
              View Call Logs
            </button>
          </Link> :

          <Link href={"/insights"}>
            <button className="px-3 py-1.5 text-sm border-none font-bold rounded-md bg-emerald-800 text-white min-w-[150px] cursor-pointer">
              View Insights
            </button>
          </Link>
            
          }
        </div>
      </div>
      <div className="flex flex-col">
        {/* filter by time */}
        <div className="flex items-center space-x-1 p-1 rounded-full">
          {filterOptions.map((option, index) => (
            <button
              key={option.value}
              onClick={() => onFilterChange(option.value)}
              className={`w-32 ${getButtonClass(
                selectedFilter === option.value
              )} ${
                index === 0
                  ? "rounded-l-full rounded-r-md"
                  : index === filterOptions.length - 2
                  ? "rounded-r-full rounded-l-md"
                  : index === filterOptions.length - 1
                  ? "ml-4"
                  : "rounded-none"
              }`}
            >
              {option.label}
            </button>
          ))}

          {selectedFilter === "dateRange" && (
            <div className="ml-8 flex items-center gap-2 p-2 rounded-lg">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate || getDefaultStartDate()}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  className="px-2 py-1 text-sm border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-bold text-emerald-800">-</label>
                <input
                  type="date"
                  value={endDate || getTodayDate()}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  className="px-2 py-1 text-sm border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallLogFilters;