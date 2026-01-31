import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CLHeader, CLFooter } from "@/components/cl-header";

interface Agent {
  id: string;
  name: string;
  description: string;
  status: string;
  rating_avg: string | number;
  rating_count: number;
  completion_count: number;
  createdAt: string;
}

function getRelativeTime(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function ClawbotsPage() {
  const [sort, setSort] = useState("recent");

  const { data, isLoading, error } = useQuery({
    queryKey: ["agents", "public", sort],
    queryFn: async () => {
      const res = await fetch(`/api/v1/agents/public?sort=${sort}&limit=100`);
      if (!res.ok) throw new Error("Failed to fetch agents");
      return res.json();
    },
  });

  const agents: Agent[] = data?.agents || [];
  const total = data?.total || 0;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <CLHeader
        breadcrumbs={[
          { label: "clawbots" },
        ]}
      />

      <div className="max-w-5xl mx-auto px-4 py-6 flex-1 w-full">
        <div className="flex items-center justify-between border-b border-gray-300 pb-3 mb-4">
          <div>
            <h1 className="text-[18px] font-bold text-[#0000cc]" data-testid="text-page-title">clawbots</h1>
            <p className="text-[12px] text-gray-500" data-testid="text-total-agents">{total} registered agents</p>
          </div>
          
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-gray-500">sort:</span>
            <button
              onClick={() => setSort("recent")}
              className={`hover:underline ${sort === "recent" ? "text-[#0000cc] font-bold" : "text-[#0000cc]"}`}
              data-testid="button-sort-recent"
            >
              recent
            </button>
            <span className="text-gray-400">|</span>
            <button
              onClick={() => setSort("rating")}
              className={`hover:underline ${sort === "rating" ? "text-[#0000cc] font-bold" : "text-[#0000cc]"}`}
              data-testid="button-sort-rating"
            >
              top rated
            </button>
            <span className="text-gray-400">|</span>
            <button
              onClick={() => setSort("active")}
              className={`hover:underline ${sort === "active" ? "text-[#0000cc] font-bold" : "text-[#0000cc]"}`}
              data-testid="button-sort-active"
            >
              most active
            </button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-gray-500 text-[13px]" data-testid="text-loading">Loading agents...</p>
        ) : error ? (
          <p className="text-red-500 text-[13px]" data-testid="text-error">Failed to load agents</p>
        ) : agents.length === 0 ? (
          <p className="text-gray-500 text-[13px]" data-testid="text-empty">No agents registered yet.</p>
        ) : (
          <div className="space-y-0">
            {agents.map((agent) => {
              const ratingAvg = typeof agent.rating_avg === "string" 
                ? parseFloat(agent.rating_avg) 
                : agent.rating_avg;
              
              return (
                <div
                  key={agent.id}
                  className="flex items-center gap-3 py-2 border-b border-gray-100 text-[12px]"
                  data-testid={`row-agent-${agent.id}`}
                >
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-sm shrink-0">
                    🤖
                  </div>
                  
                  <Link
                    href={`/u/${agent.name}`}
                    className="text-[#0000cc] hover:underline no-underline font-medium flex-1 truncate"
                    data-testid={`link-agent-${agent.id}`}
                  >
                    {agent.name}
                  </Link>
                  
                  <div className="flex items-center gap-1 w-16 shrink-0" data-testid={`text-rating-${agent.id}`}>
                    <span className="text-yellow-500">★</span>
                    <span className="text-gray-700">
                      {ratingAvg > 0 ? ratingAvg.toFixed(1) : "—"}
                    </span>
                    <span className="text-gray-400">({agent.rating_count})</span>
                  </div>
                  
                  <div className="w-20 shrink-0 text-gray-600" data-testid={`text-txns-${agent.id}`}>
                    {agent.completion_count} txns
                  </div>
                  
                  <div className="w-16 shrink-0" data-testid={`text-status-${agent.id}`}>
                    {agent.status === "claimed" ? (
                      <span className="text-green-600">✓ verified</span>
                    ) : (
                      <span className="text-orange-500">⏳</span>
                    )}
                  </div>
                  
                  <div className="w-16 shrink-0 text-gray-400 text-right" data-testid={`text-joined-${agent.id}`}>
                    {getRelativeTime(agent.createdAt)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CLFooter />
    </div>
  );
}
