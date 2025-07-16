'use client'

import { useMemo } from 'react'

export type FilterPeriod = 'all' | 'today' | 'yesterday' | 'last7days' | 'lastMonth'

interface CallLogFiltersProps {
  selectedFilter: FilterPeriod
  onFilterChange: (filter: FilterPeriod) => void
  selectedAgent: string
  onAgentChange: (agent: string) => void
  agents: string[]
  className?: string
}

const CallLogFilters: React.FC<CallLogFiltersProps> = ({ 
  selectedFilter, 
  onFilterChange,
  selectedAgent,
  onAgentChange,
  agents,
  className 
}) => {
  const filterOptions = useMemo(() => [
    { value: 'all' as FilterPeriod, label: 'All' },
    { value: 'today' as FilterPeriod, label: 'Today' },
    { value: 'yesterday' as FilterPeriod, label: 'Yesterday' },
    { value: 'last7days' as FilterPeriod, label: 'Last 7 Days' },
    { value: 'lastMonth' as FilterPeriod, label: 'Last Month' },
  ], [])

  const getButtonClass = (isSelected: boolean) => {
    const baseClass = "px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200"
    
    if (isSelected) {
      return `${baseClass} bg-emerald-800 text-white shadow-sm`
    }
    
    return `${baseClass} bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400`
  }

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {/* Time Filter */}
      <div className="flex items-center space-x-1 p-1 rounded-full">
        {filterOptions.map((option, index) => (
          <button
            key={option.value}
            onClick={() => onFilterChange(option.value)}
            className={`w-32 ${getButtonClass(selectedFilter === option.value)} ${index === 0 ? "rounded-l-full rounded-r-md" : index === filterOptions.length - 1 ? "rounded-r-full rounded-l-md" : ""}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Agent Dropdown */}
      <div className="flex items-center">
        <label htmlFor="agent-select" className="mr-2 text-sm font-medium text-gray-700">
          Agent:
        </label>
        <select
          id="agent-select"
          value={selectedAgent}
          onChange={(e) => onAgentChange(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-full bg-white text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-200 min-w-[150px]"
        >
          <option value="">All Agents</option>
          {agents.map((agent) => (
            <option key={agent} value={agent}>
              {agent}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export default CallLogFilters