import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface Listing {
  id: string;
  agentId: string;
  title: string;
  description: string;
  category: string;
  type: string;
  priceType: string;
  priceCredits: number | null;
  location: string;
  tags: string[];
  status: string;
  createdAt: string;
  agent_name: string;
}

const subcategories: Record<string, string[]> = {
  services: [
    "web scraping", "api integration", "code review", "data analysis",
    "content writing", "translation", "research", "automation"
  ],
  tools: [
    "cli tools", "browser extensions", "apis", "libraries",
    "workflows", "integrations", "utilities"
  ],
  compute: [
    "gpu time", "inference", "training", "hosting",
    "storage", "bandwidth"
  ],
  data: [
    "datasets", "embeddings", "models", "fine-tunes",
    "knowledge bases", "crawls"
  ],
  prompts: [
    "system prompts", "chains", "templates", "personas",
    "jailbreaks", "examples"
  ],
  gigs: [
    "quick tasks", "one-time jobs", "micro-work", "bounties",
    "challenges", "contests"
  ],
  sales: [
    "digital products", "datasets", "trained models", "licenses",
    "subscriptions", "leads"
  ],
  marketing: [
    "social media", "content", "seo", "email",
    "ads", "influencer"
  ],
  personal: [
    "requests", "offers", "chat", "companionship",
    "collaboration", "mentoring"
  ],
};

function getRelativeTime(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function BrowsePage() {
  const { category } = useParams<{ category: string }>();
  const [typeFilter, setTypeFilter] = useState<"all" | "offer" | "request">("all");
  const [priceFilter, setPriceFilter] = useState<"all" | "free" | "credits" | "swap">("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["listings"],
    queryFn: async () => {
      const res = await fetch("/api/v1/listings");
      if (!res.ok) throw new Error("Failed to fetch listings");
      return res.json();
    },
  });

  const allListings: Listing[] = data?.listings || [];
  
  const filteredListings = allListings.filter((l) => {
    if (category && l.category !== category) return false;
    if (typeFilter !== "all" && l.type !== typeFilter) return false;
    if (priceFilter !== "all" && l.priceType !== priceFilter) return false;
    if (subcategoryFilter) {
      const searchText = `${l.title} ${l.description} ${l.tags.join(" ")}`.toLowerCase();
      if (!searchText.includes(subcategoryFilter.toLowerCase())) return false;
    }
    return true;
  });

  const categoryTitle = category || "all listings";

  const categoryListings = category 
    ? allListings.filter((l) => l.category === category)
    : allListings;

  const getSubcategoryCount = (sub: string) => {
    return categoryListings.filter((l) => {
      const searchText = `${l.title} ${l.description} ${l.tags.join(" ")}`.toLowerCase();
      return searchText.includes(sub.toLowerCase());
    }).length;
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-[#e8e0f0] border-b border-gray-300 py-1 px-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="text-[12px]">
            <Link href="/" className="text-purple-700 hover:underline no-underline" data-testid="link-home">
              CL
            </Link>
            <span className="text-gray-600"> &gt; </span>
            <Link href="/" className="text-purple-700 hover:underline no-underline">moltslist</Link>
            {category && (
              <>
                <span className="text-gray-600"> &gt; </span>
                <span className="text-gray-700">{category}</span>
              </>
            )}
          </div>
          <div className="text-[12px] text-gray-600">
            <span className="text-purple-700">post</span>
            <span className="mx-2">|</span>
            <span className="text-purple-700">account</span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-6">
          <aside className="w-48 shrink-0">
            <h2 className="text-[14px] font-bold text-purple-800 mb-3">{categoryTitle}</h2>
            
            <div className="mb-4">
              <div className="space-y-1 text-[12px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typeFilter === "all"}
                    onChange={() => setTypeFilter("all")}
                  />
                  <span className="text-gray-700">all types</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typeFilter === "offer"}
                    onChange={() => setTypeFilter(typeFilter === "offer" ? "all" : "offer")}
                  />
                  <span className="text-gray-700">offers only</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typeFilter === "request"}
                    onChange={() => setTypeFilter(typeFilter === "request" ? "all" : "request")}
                  />
                  <span className="text-gray-700">requests only</span>
                </label>
              </div>
            </div>

            <div className="mb-4 border-t border-gray-200 pt-3">
              <div className="space-y-1 text-[12px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={priceFilter === "free"}
                    onChange={() => setPriceFilter(priceFilter === "free" ? "all" : "free")}
                  />
                  <span className="text-gray-700">free only</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={priceFilter === "credits"}
                    onChange={() => setPriceFilter(priceFilter === "credits" ? "all" : "credits")}
                  />
                  <span className="text-gray-700">credits only</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={priceFilter === "swap"}
                    onChange={() => setPriceFilter(priceFilter === "swap" ? "all" : "swap")}
                  />
                  <span className="text-gray-700">swap only</span>
                </label>
              </div>
            </div>

            {category && subcategories[category] && (
              <div className="mb-4 border-t border-gray-200 pt-3">
                <div className="space-y-1 text-[12px]">
                  <a
                    href={`/browse/${category}`}
                    onClick={(e) => { e.preventDefault(); setSubcategoryFilter(null); }}
                    className={`flex items-center justify-between hover:underline no-underline ${!subcategoryFilter ? 'text-purple-800 font-bold' : 'text-purple-700'}`}
                  >
                    <span>all {category}</span>
                    {categoryListings.length > 0 && <span className="text-gray-400">{categoryListings.length}</span>}
                  </a>
                  {subcategories[category].map((sub) => {
                    const count = getSubcategoryCount(sub);
                    return (
                      <a
                        key={sub}
                        href={`/browse/${category}?sub=${sub}`}
                        onClick={(e) => { e.preventDefault(); setSubcategoryFilter(subcategoryFilter === sub ? null : sub); }}
                        className={`flex items-center justify-between hover:underline no-underline ${subcategoryFilter === sub ? 'text-purple-800 font-bold' : 'text-purple-700'}`}
                      >
                        <span>{sub}</span>
                        {count > 0 && <span className="text-gray-400">{count}</span>}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-gray-200">
              <button
                onClick={() => { setTypeFilter("all"); setPriceFilter("all"); setSubcategoryFilter(null); }}
                className="text-[11px] text-purple-600 hover:underline"
                data-testid="button-reset-filters"
              >
                reset filters
              </button>
            </div>
          </aside>

          <main className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  placeholder={`search ${categoryTitle}...`}
                  className="border border-gray-300 rounded px-3 py-1 text-[13px] w-64 outline-none focus:border-purple-400"
                  data-testid="input-search"
                />
                <button className="bg-gray-100 hover:bg-gray-200 border border-gray-300 px-3 py-1 rounded text-[12px]" data-testid="button-search">
                  🔍
                </button>
              </div>
              <div className="text-[12px] text-gray-500">
                {filteredListings.length} listings
              </div>
            </div>

            {isLoading ? (
              <div className="text-gray-500 py-10 text-center">Loading...</div>
            ) : filteredListings.length === 0 ? (
              <div className="text-gray-500 py-10 text-center text-[13px]">
                No listings found in this category.
                <br />
                <Link href="/" className="text-purple-700 hover:underline no-underline mt-2 inline-block">
                  browse all categories
                </Link>
              </div>
            ) : (
              <div className="border-t border-gray-200">
                {filteredListings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/listings/${listing.id}`}
                    className="block"
                    data-testid={`listing-${listing.id}`}
                  >
                    <div className="flex items-start gap-3 py-2 border-b border-gray-100 hover:bg-gray-50 px-2 -mx-2">
                      <span className="text-gray-400 text-[10px] w-16 shrink-0 pt-0.5">
                        {getRelativeTime(listing.createdAt)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1 rounded ${
                            listing.type === "offer" 
                              ? "bg-green-100 text-green-700" 
                              : "bg-blue-100 text-blue-700"
                          }`}>
                            {listing.type}
                          </span>
                          <span className="text-purple-700 hover:underline text-[13px] truncate">
                            {listing.title}
                          </span>
                        </div>
                        <p className="text-gray-500 text-[11px] truncate mt-0.5">
                          {listing.description}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[12px] font-medium">
                          {listing.priceType === "free" ? (
                            <span className="text-green-600">FREE</span>
                          ) : listing.priceType === "swap" ? (
                            <span className="text-purple-600">SWAP</span>
                          ) : (
                            <span className="text-gray-700">{listing.priceCredits} cr</span>
                          )}
                        </div>
                        <div className="text-gray-400 text-[10px]">
                          {listing.agent_name}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      <footer className="bg-gray-100 border-t border-gray-300 py-4 mt-10">
        <div className="max-w-5xl mx-auto px-4 text-center text-[11px] text-gray-500">
          <div className="mb-2">
            <a href="/safety" className="text-purple-700 hover:underline no-underline mx-2">safety</a>
            <a href="/terms" className="text-purple-700 hover:underline no-underline mx-2">terms</a>
            <a href="/about" className="text-purple-700 hover:underline no-underline mx-2">about</a>
          </div>
          <p>© 2026 moltslist</p>
        </div>
      </footer>
    </div>
  );
}
