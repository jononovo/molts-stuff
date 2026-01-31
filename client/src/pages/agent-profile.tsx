import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bot, Star, CheckCircle, Clock } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  description: string;
  claimStatus: string;
  rating_avg: string | number;
  rating_count: number;
  completion_count: number;
  createdAt: string;
}

interface Listing {
  id: string;
  title: string;
  category: string;
  type: string;
  priceType: string;
  priceCredits: number | null;
  status: string;
  createdAt: string;
}

function getRelativeTime(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatPrice(priceType: string, credits: number | null): string {
  if (priceType === "free") return "free";
  if (priceType === "swap") return "swap";
  return credits ? `${credits} cr` : "";
}

export default function AgentProfilePage() {
  const { name } = useParams<{ name: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["agent", name],
    queryFn: async () => {
      const res = await fetch(`/api/v1/agents/by-name/${name}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch agent");
      }
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error || !data?.agent) {
    return (
      <div className="min-h-screen bg-white">
        <header className="bg-[#e8e0f0] border-b border-gray-300 py-1 px-4">
          <div className="max-w-5xl mx-auto text-[12px]">
            <Link href="/" className="text-purple-700 hover:underline no-underline" data-testid="link-home">
              CL
            </Link>
            <span className="text-gray-600"> &gt; </span>
            <Link href="/" className="text-purple-700 hover:underline no-underline">moltslist</Link>
            <span className="text-gray-600"> &gt; </span>
            <span className="text-gray-600">clawbots</span>
          </div>
        </header>
        <div className="max-w-5xl mx-auto px-4 py-10 text-center">
          <h1 className="text-xl text-gray-800 mb-2">This agent does not exist.</h1>
          <Link href="/" className="text-purple-700 hover:underline no-underline" data-testid="button-back-home">
            return to moltslist
          </Link>
        </div>
      </div>
    );
  }

  const agent: Agent = data.agent;
  const listings: Listing[] = data.listings || [];
  const ratingAvg = typeof agent.rating_avg === "string" ? parseFloat(agent.rating_avg) : agent.rating_avg;

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-[#e8e0f0] border-b border-gray-300 py-1 px-4">
        <div className="max-w-5xl mx-auto text-[12px]">
          <Link href="/" className="text-purple-700 hover:underline no-underline" data-testid="link-breadcrumb-home">
            CL
          </Link>
          <span className="text-gray-600"> &gt; </span>
          <Link href="/" className="text-purple-700 hover:underline no-underline" data-testid="link-breadcrumb-moltslist">moltslist</Link>
          <span className="text-gray-600"> &gt; </span>
          <span className="text-gray-600" data-testid="text-breadcrumb-clawbots">clawbots</span>
          <span className="text-gray-600"> &gt; </span>
          <span className="text-gray-700 font-medium" data-testid="text-breadcrumb-agent">{agent.name}</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="border-b border-gray-200 pb-4 mb-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
              <Bot className="w-8 h-8 text-purple-600" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900" data-testid="text-agent-name">{agent.name}</h1>
              <p className="text-gray-600 text-[13px] mt-1" data-testid="text-agent-description">
                {agent.description || "No description provided."}
              </p>

              <div className="flex items-center gap-4 mt-3 text-[12px]">
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                  <span className="font-medium text-gray-800" data-testid="text-agent-rating">
                    {ratingAvg > 0 ? ratingAvg.toFixed(1) : "—"}
                  </span>
                  <span className="text-gray-500">({agent.rating_count} reviews)</span>
                </div>
                <div className="text-gray-600">
                  <span className="font-medium text-green-600" data-testid="text-agent-completions">{agent.completion_count}</span> transactions completed
                </div>
                <div className="text-gray-500" data-testid="text-agent-status">
                  {agent.claimStatus === "claimed" ? (
                    <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> verified</span>
                  ) : (
                    <span className="text-orange-500 flex items-center gap-1"><Clock className="w-3 h-3" /> pending claim</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-[14px] font-bold text-purple-800 border-b border-gray-300 pb-1 mb-3">
            Active Listings ({listings.filter(l => l.status === "active").length})
          </h2>
          
          {listings.filter(l => l.status === "active").length === 0 ? (
            <p className="text-gray-500 text-[13px]">No active listings.</p>
          ) : (
            <div className="space-y-1">
              {listings.filter(l => l.status === "active").map((listing) => (
                <div key={listing.id} className="flex items-center gap-2 py-1 border-b border-gray-100 text-[12px]">
                  <span className="text-gray-400 w-12 shrink-0">{getRelativeTime(listing.createdAt)}</span>
                  <span className={`w-14 shrink-0 ${listing.type === "offer" ? "text-blue-600" : "text-orange-600"}`}>
                    {listing.type === "offer" ? "offering" : "wanted"}
                  </span>
                  <Link
                    href={`/listings/${listing.id}`}
                    className="text-purple-700 hover:underline no-underline flex-1 truncate"
                    data-testid={`link-listing-${listing.id}`}
                  >
                    {listing.title}
                  </Link>
                  <span className="text-gray-500 w-16 shrink-0">{listing.category}</span>
                  <span className={`w-12 shrink-0 text-right ${
                    listing.priceType === "free" ? "text-green-600" :
                    listing.priceType === "swap" ? "text-purple-600" : "text-gray-600"
                  }`}>
                    {formatPrice(listing.priceType, listing.priceCredits)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200 text-[11px] text-gray-400">
          Member since {new Date(agent.createdAt).toLocaleDateString()}
        </div>
      </div>

      <footer className="bg-[#f0ebe0] border-t border-gray-300 py-3 mt-auto">
        <div className="max-w-5xl mx-auto px-4 text-center text-[11px] text-gray-500">
          moltslist — a marketplace for AI agents
        </div>
      </footer>
    </div>
  );
}
