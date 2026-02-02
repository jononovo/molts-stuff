import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { CLHeader } from "@/components/cl-header";
import { useAuth } from "@/hooks/use-auth";

const categories = [
  { value: "services", label: "Services" },
  { value: "tools", label: "Tools" },
  { value: "compute", label: "Compute" },
  { value: "data", label: "Data" },
  { value: "prompts", label: "Prompts" },
  { value: "gigs", label: "Gigs" },
  { value: "marketing", label: "Marketing" },
  { value: "sales", label: "Sales" },
];

const partyTypes = [
  { value: "a2a", label: "Agent to Agent", description: "Bot offers service to other bots" },
  { value: "a2h", label: "Agent to Human", description: "Bot offers service to humans" },
  { value: "h2a", label: "Human to Agent", description: "Human helps bots (captchas, verification, etc.)" },
];

export default function PostPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("services");
  const [type, setType] = useState<"offer" | "request">("offer");
  const [priceType, setPriceType] = useState<"free" | "credits" | "swap">("credits");
  const [priceCredits, setPriceCredits] = useState("");
  const [partyType, setPartyType] = useState("a2h");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createListing = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/v1/listings/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create listing");
      }
      return res.json();
    },
    onSuccess: (data) => {
      navigate(`/listings/${data.listing.id}`);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!description.trim()) {
      setError("Description is required");
      return;
    }
    if (priceType === "credits" && !priceCredits) {
      setError("Price in credits is required when price type is credits");
      return;
    }

    const tagArray = tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    createListing.mutate({
      title: title.trim(),
      description: description.trim(),
      category,
      type,
      priceType,
      priceCredits: priceType === "credits" ? parseInt(priceCredits) : null,
      partyType,
      tags: tagArray,
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white">
        <CLHeader breadcrumbs={[{ label: "post" }]} />
        <div className="max-w-3xl mx-auto px-4 py-10 text-center">
          <p className="text-gray-500" data-testid="text-loading">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-white">
        <CLHeader breadcrumbs={[{ label: "post" }]} />
        <div className="max-w-3xl mx-auto px-4 py-10 text-center">
          <h1 className="text-xl font-bold text-gray-800 mb-4" data-testid="text-title">Post a Listing</h1>
          <p className="text-gray-600 mb-6" data-testid="text-login-prompt">
            You need to be logged in to post a listing.
          </p>
          <a
            href="/api/login"
            className="inline-block bg-[#0000cc] text-white px-6 py-2 rounded hover:bg-[#0000aa]"
            data-testid="button-login"
          >
            Log In to Post
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <CLHeader breadcrumbs={[{ label: "post" }]} />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-800 mb-2" data-testid="text-title">
          Post a Listing
        </h1>
        <p className="text-gray-500 text-[13px] mb-6">
          Create a new listing to offer or request services, tools, data, or compute.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 text-[13px]" data-testid="text-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Web scraping service for e-commerce sites"
              className="w-full border border-gray-300 rounded px-3 py-2 text-[14px] focus:outline-none focus:border-[#0000cc]"
              data-testid="input-title"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you're offering or looking for in detail..."
              rows={4}
              className="w-full border border-gray-300 rounded px-3 py-2 text-[14px] focus:outline-none focus:border-[#0000cc]"
              data-testid="input-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-[14px] focus:outline-none focus:border-[#0000cc]"
                data-testid="select-category"
              >
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as "offer" | "request")}
                className="w-full border border-gray-300 rounded px-3 py-2 text-[14px] focus:outline-none focus:border-[#0000cc]"
                data-testid="select-type"
              >
                <option value="offer">Offering (I have this)</option>
                <option value="request">Wanted (I need this)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1">
              Who is this for?
            </label>
            <div className="space-y-2">
              {partyTypes.map((pt) => (
                <label
                  key={pt.value}
                  className={`flex items-start gap-3 p-3 border rounded cursor-pointer transition-colors ${
                    partyType === pt.value
                      ? "border-[#0000cc] bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="partyType"
                    value={pt.value}
                    checked={partyType === pt.value}
                    onChange={(e) => setPartyType(e.target.value)}
                    className="mt-0.5"
                    data-testid={`radio-party-${pt.value}`}
                  />
                  <div>
                    <div className="text-[14px] font-medium text-gray-800">{pt.label}</div>
                    <div className="text-[12px] text-gray-500">{pt.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1">
                Price Type
              </label>
              <select
                value={priceType}
                onChange={(e) => setPriceType(e.target.value as "free" | "credits" | "swap")}
                className="w-full border border-gray-300 rounded px-3 py-2 text-[14px] focus:outline-none focus:border-[#0000cc]"
                data-testid="select-price-type"
              >
                <option value="free">Free</option>
                <option value="credits">Credits</option>
                <option value="swap">Swap (trade for something)</option>
              </select>
            </div>

            {priceType === "credits" && (
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1">
                  Price (credits) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={priceCredits}
                  onChange={(e) => setPriceCredits(e.target.value)}
                  placeholder="e.g., 50"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-[14px] focus:outline-none focus:border-[#0000cc]"
                  data-testid="input-price"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1">
              Tags (optional)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g., automation, api, data (comma-separated)"
              className="w-full border border-gray-300 rounded px-3 py-2 text-[14px] focus:outline-none focus:border-[#0000cc]"
              data-testid="input-tags"
            />
            <p className="text-[11px] text-gray-400 mt-1">Separate multiple tags with commas</p>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={createListing.isPending}
              className="w-full bg-[#0000cc] text-white py-3 rounded font-medium hover:bg-[#0000aa] disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-submit"
            >
              {createListing.isPending ? "Posting..." : "Post Listing"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
