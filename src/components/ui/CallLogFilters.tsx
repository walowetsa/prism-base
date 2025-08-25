"use client";

import Link from "next/link";
import { useMemo, useState, useRef, useEffect } from "react";
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
  selectedDispositions: string[];
  onDispositionsChange: (dispositions: string[]) => void; 
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
  agents = [],
  selectedDispositions = [],
  onDispositionsChange,
  dispositions = [],
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onRefresh,
  disabled = false,
  className,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDispositionDropdownOpen, setIsDispositionDropdownOpen] =
    useState(false);
  const dispositionDropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dispositionDropdownRef.current &&
        !dispositionDropdownRef.current.contains(event.target as Node)
      ) {
        setIsDispositionDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const getButtonClass = (isSelected: boolean) => {
    const baseClass =
      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200";

    if (isSelected) {
      return `${baseClass} bg-[var(--color-bg-secondary)] text-white shadow-sm`;
    }

    return `${baseClass} bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border-gray-300 hover:bg-gray-50/20 `;
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
      console.error("Error refreshing data:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleResetAllFilters = () => {
    onFilterChange("today");
    onAgentChange("");
    onDispositionsChange([]);
    onStartDateChange("");
    onEndDateChange("");
  };

  const handleDispositionToggle = (disposition: string) => {
    const isSelected = selectedDispositions.includes(disposition);
    if (isSelected) {
      onDispositionsChange(
        selectedDispositions.filter((d) => d !== disposition)
      );
    } else {
      onDispositionsChange([...selectedDispositions, disposition]);
    }
  };

  const getDispositionDisplayText = () => {
    if (selectedDispositions.length === 0) {
      return "All Dispositions";
    } else if (selectedDispositions.length === 1) {
      return selectedDispositions[0];
    } else {
      return `${selectedDispositions.length} selected`;
    }
  };

  const pathname = usePathname();

  return (
    <div className={`flex gap-4 ${className} flex-col w-full`}>
      <div className="flex gap-x-4">
        {/* Refresh button */}
        <div className="flex items-center">
          <button
            onClick={handleRefresh}
            disabled={disabled || isRefreshing}
            className={`bg-[var(--color-bg-secondary)] w-8 h-8 rounded-full flex items-center justify-center cursor-pointer group text-[var(--color-text-primary)]`}
            title="Refresh call records"
          >
            <svg
              className={`w-4 h-4 group-hover:rotate-90 transition-all ${
                isRefreshing ? "animate-spin" : ""
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
            className="mr-2 text-sm font-medium text-[var(--color-text-primary)]"
          >
            Agent:
          </label>
          <select
            id="agent-select"
            value={selectedAgent}
            onChange={(e) => onAgentChange(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300/40 rounded-full bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)] focus:border-[var(--color-text-primary)] transition-colors duration-200 min-w-[150px]"
          >
            <option value="" className="bg-[var(--color-bg-secondary)]">All Agents</option>
            {agents.map((agent) => (
              <option key={agent} value={agent} className="bg-[var(--color-bg-secondary)]">
                {agent === "T10085496@tsagroup.com.au"
                  ? "mdunstan@tsagroup.com.au"
                  : agent === "T10085497@tsagroup.com.au"
                  ? "mwilson.tsagroup.com.au"
                  : agent === "T10085494@tsagroup.com.au"
                  ? "vride.tsagroup.com.au"
                  : agent === "T10085498@tsagroup.com.au"
                  ? "bskipper.tsagroup.com.au"
                  : agent === "T10085495@tsagroup.com.au"
                  ? "ksingh@tsagroup.com.au"
                  : agent === "T10085499@tsagroup.com.au"
                  ? "elima@tsagroup.com.au"
                  : agent === "T10085523@tsagroup.com.au"
                  ? "srana@tsagroup.com.au"
                  : agent === "T10085526@tsagroup.com.au"
                  ? "ezgrajewski@tsagroup.com.au"
                  : agent === "T10085531@tsagroup.com.au"
                  ? "hcrooks.tsagroup.com.au"
                  : agent}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center" ref={dispositionDropdownRef}>
          <label
            htmlFor="disposition-select"
            className="mr-2 text-sm font-medium text-[var(--color-text-primary)]"
          >
            Disposition:
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setIsDispositionDropdownOpen(!isDispositionDropdownOpen)
              }
              className="px-3 py-1.5 text-sm border border-gray-300/20 rounded-full bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] hover:border-gray-400 focus:outline-none ocus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)] focus:border-[var(--color-text-primary)] transition-colors duration-200 min-w-[200px] flex justify-between items-center"
            >
              <span className="truncate">{getDispositionDisplayText()}</span>
              <svg
                className={`w-4 h-4 transition-transform ${
                  isDispositionDropdownOpen ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {isDispositionDropdownOpen && (
              <div className="absolute z-[100] mt-1 w-full bg-[var(--color-bg-secondary)] border border-gray-300/20 rounded-md shadow-lg max-h-60 overflow-auto">
                <div className="py-1">
                  {dispositions.map((disposition) => (
                    <label
                      key={disposition}
                      className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDispositions.includes(disposition)}
                        onChange={() => handleDispositionToggle(disposition)}
                        className="mr-2 h-4 w-4 text-[var(--color-text-primary)] focus:ring-[var(--color-text-primary)] border-gray-300/20 rounded"
                      />
                      <span className="text-sm text-[var(--color-text-primary)]">
                        {disposition}
                      </span>
                    </label>
                  ))}
                </div>
                {selectedDispositions.length > 0 && (
                  <div className="border-t border-gray-200 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onDispositionsChange([])}
                      className="text-sm text-[var(--color-text-primary)] hover:text-[var(--color-text-primary)] font-medium"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center ml-12">
            <button
              onClick={handleResetAllFilters}
              disabled={disabled}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] flex items-center gap-2 cursor-pointer"
              title="Reset all filters"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Reset Filters
            </button>
          </div>
        </div>

        <div className="ml-auto">
          {pathname === "/insights" ? (
            <Link href={"/"}>
              <button className="px-3 py-1.5 text-sm border-none font-bold rounded-md bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] min-w-[150px] cursor-pointer">
                View Call Logs
              </button>
            </Link>
          ) : (
            <Link href={"/insights"}>
              <button className="px-3 py-1.5 text-sm border-none font-bold rounded-md bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] min-w-[150px] cursor-pointer">
                View Insights
              </button>
            </Link>
          )}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="flex items-center space-x-1 p-1 rounded-full">
          {filterOptions.map((option, index) => (
            <button
              key={option.value}
              onClick={() => onFilterChange(option.value)}
              className={`w-32 ${getButtonClass(
                selectedFilter === option.value
              )} ${
                index === 0
                  ? "rounded-l-full rounded-r-md border border-[var(--color-bg-primary)]"
                  : index === filterOptions.length - 2
                  ? "rounded-r-full rounded-l-md border border-[var(--color-bg-primary)]"
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
                  className="px-2 py-1 text-sm border border-gray-300/20 rounded-md bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] focus:outline-none ocus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)] focus:border-[var(--color-text-primary)]"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-bold text-[var(--color-text-accent)]">-</label>
                <input
                  type="date"
                  value={endDate || getTodayDate()}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  className="px-2 py-1 text-sm border border-gray-300/20 rounded-md bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
