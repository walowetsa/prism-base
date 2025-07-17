import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import CallRecord from "@/types/CallRecord";

interface InsightsStatsDashboardProps {
  filteredRecords: CallRecord[];
  totalRecords: number;
  loading: boolean;
}

const InsightsStatsDashboard: React.FC<InsightsStatsDashboardProps> = ({
  filteredRecords,
//   totalRecords,
  loading
}) => {
  const successfulOutcomes = [
    'Conversation - Lead Generated: New Business',
    'Conversation - Lead Generated: X Sell'
  ];

  // Calculate statistics
  const statistics = useMemo(() => {
    const totalCalls = filteredRecords.length;
    const successfulCalls = filteredRecords.filter(record => 
      record.disposition_title && successfulOutcomes.includes(record.disposition_title)
    ).length;
    
    const successRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0;

    // Calculate average call duration - FIXED VERSION
const validDurations = filteredRecords
  .map(record => {
    if (!record.call_duration) return null;
    try {
      let parsedDuration: { minutes?: number; seconds: number };
      if (typeof record.call_duration === "string") {
        parsedDuration = JSON.parse(record.call_duration);
      } else {
        parsedDuration = record.call_duration;
      }
      
      // Extract seconds and provide default value for minutes
      const { seconds, minutes = 0 } = parsedDuration;
      
      // Validate that we have valid numbers
      if (typeof seconds !== "number" || seconds < 0) {
        return null;
      }
      
      // Validate minutes if it exists
      if (minutes !== undefined && (typeof minutes !== "number" || minutes < 0)) {
        return null;
      }
      
      return minutes * 60 + seconds;
    } catch {
      return null;
    }
  })
  .filter(duration => duration !== null) as number[];

    const averageDurationSeconds = validDurations.length > 0 
      ? validDurations.reduce((sum, duration) => sum + duration, 0) / validDurations.length 
      : 0;

    // Calls by agent
    const callsByAgent = filteredRecords.reduce((acc, record) => {
      const agent = record.agent_username || "Unknown";
      acc[agent] = (acc[agent] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Top dispositions
    const dispositionCounts = filteredRecords.reduce((acc, record) => {
      const disposition = record.disposition_title || "Unknown";
      acc[disposition] = (acc[disposition] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topDispositions = Object.entries(dispositionCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    // Daily call volume data
    const dailyCallVolume = filteredRecords.reduce((acc, record) => {
      if (!record.initiation_timestamp) return acc;
      
      const date = new Date(record.initiation_timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
      
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const dailyVolumeData = Object.entries(dailyCallVolume)
      .map(([date, calls]) => ({ date, calls }))
      .sort((a, b) => new Date(a.date + ', 2024').getTime() - new Date(b.date + ', 2024').getTime());

    // Call sentiment breakdown
    const sentimentCounts = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
    
    filteredRecords.forEach(record => {
      if (!record.sentiment_analysis) return;
      
      try {
        let sentimentArray;
        if (typeof record.sentiment_analysis === "string") {
          sentimentArray = JSON.parse(record.sentiment_analysis);
        } else {
          sentimentArray = record.sentiment_analysis;
        }
        
        if (Array.isArray(sentimentArray)) {
          sentimentArray.forEach(item => {
            if (item.sentiment && sentimentCounts.hasOwnProperty(item.sentiment)) {
              sentimentCounts[item.sentiment as keyof typeof sentimentCounts]++;
            }
          });
        }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        // Skip records with invalid sentiment_analysis format
      }
    });

    const sentimentData = [
      { name: 'Positive', count: sentimentCounts.POSITIVE, color: '#065f46' },
      { name: 'Neutral', count: sentimentCounts.NEUTRAL, color: '#10b981' },
      { name: 'Negative', count: sentimentCounts.NEGATIVE, color: '#dc2626' }
    ];

    return {
      totalCalls,
      successfulCalls,
      successRate,
      averageDurationSeconds,
      callsByAgent,
      topDispositions,
      dailyVolumeData,
      sentimentData
    };
  }, [filteredRecords, successfulOutcomes]);

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    if (minutes === 0) {
      return `${remainingSeconds}s`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-gray-600">Loading insights...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 space-y-6 max-h-[82vh] overflow-y-scroll">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-black p-6 rounded-lg shadow-sm">
          <div className="text-2xl font-bold text-emerald-800">{statistics.totalCalls}</div>
          <div className="text-sm text-neutral-200">Total Calls</div>
        </div>
        
        <div className="bg-black p-6 rounded-lg shadow-sm">
          <div className="text-2xl font-bold text-emerald-800">{statistics.successfulCalls}</div>
          <div className="text-sm text-neutral-200">Leads Generated</div>
        </div>
        
        <div className="bg-black p-6 rounded-lg shadow-sm">
          <div className="text-2xl font-bold text-emerald-800">
            {formatPercentage(statistics.successRate)}
          </div>
          <div className="text-sm text-neutral-200">Generation Rate</div>
        </div>
        
        <div className="bg-black p-6 rounded-lg shadow-sm">
          <div className="text-2xl font-bold text-emerald-800">
            {formatDuration(statistics.averageDurationSeconds)}
          </div>
          <div className="text-sm text-neutral-200">Avg Handle Time</div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-black p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-emerald-800 mb-4">Calls by Agent</h3>
          <div className="space-y-3">
            {Object.entries(statistics.callsByAgent)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 5)
              .map(([agent, count]) => (
              <div key={agent} className="flex items-center justify-between">
                <span className="text-sm text-neutral-200 truncate flex-1 mr-2">{agent}</span>
                <div className="flex items-center gap-2">
                  <div 
                    className="bg-emerald-800 h-2 rounded"
                    style={{ 
                      width: `${Math.max((count / Math.max(...Object.values(statistics.callsByAgent))) * 100, 5)}px`,
                      minWidth: '20px'
                    }}
                  ></div>
                  <span className="text-sm font-medium text-neutral-200 w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-black p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-emerald-600 mb-4">Top Dispositions</h3>
          <div className="space-y-3">
            {statistics.topDispositions.map(([disposition, count]) => (
              <div key={disposition} className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm text-neutral-200 truncate" title={disposition}>
                    {disposition}
                  </span>
                  {successfulOutcomes.includes(disposition) && (
                    <span className="text-emerald-800 text-sm">✓</span>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <div 
                    className="bg-emerald-800 h-2 rounded"
                    style={{ 
                      width: `${Math.max((count / statistics.topDispositions[0][1]) * 100, 5)}px`,
                      minWidth: '20px'
                    }}
                  ></div>
                  <span className="text-sm font-medium text-neutral-200 w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {statistics.totalCalls > 0 && (
        <div className="bg-black p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-neutral-200 mb-4">Leads Generated</h3>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-neutral-800 rounded-full h-4 overflow-hidden">
              <div 
                className="bg-emerald-800 h-full transition-all duration-500 rounded-r-full"
                style={{ width: `${statistics.successRate}%` }}
              ></div>
            </div>
            <div className="text-sm text-neutral-200">
              {statistics.successfulCalls}/{statistics.totalCalls} leads generated.
            </div>
          </div>
        </div>
      )}

      {/* Daily Call Volume Chart */}
      {statistics.dailyVolumeData.length > 0 && (
        <div className="bg-black p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-neutral-200 mb-4">Daily Call Volume</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={statistics.dailyVolumeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="date" 
                  stroke="#d1d5db"
                  fontSize={12}
                />
                <YAxis 
                  stroke="#d1d5db"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#000',
                    border: '1px solid #065f46',
                    borderRadius: '8px',
                    color: '#d1d5db'
                  }}
                  labelStyle={{ color: '#d1d5db' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="calls" 
                  stroke="#065f46" 
                  strokeWidth={2}
                  dot={{ fill: '#065f46', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: '#065f46' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Call Sentiment Breakdown */}
      {(statistics.sentimentData.some(item => item.count > 0)) && (
        <div className="bg-black p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-neutral-200 mb-4">Call Sentiment Analysis</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statistics.sentimentData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="name" 
                  stroke="#d1d5db"
                  fontSize={12}
                />
                <YAxis 
                  stroke="#d1d5db"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#000',
                    border: '1px solid #065f46',
                    borderRadius: '8px',
                    color: '#d1d5db'
                  }}
                  labelStyle={{ color: '#d1d5db' }}
                  formatter={(value: number) => [value, 'Sentiment Instances']}
                />
                <Bar 
                  dataKey="count" 
                  radius={[4, 4, 0, 0]}
                >
                  {statistics.sentimentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex justify-center gap-6">
            {statistics.sentimentData.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: item.color }}
                ></div>
                <span className="text-sm text-neutral-200">
                  {item.name}: {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default InsightsStatsDashboard;