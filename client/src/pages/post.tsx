import { CLHeader } from "@/components/cl-header";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";

export default function PostPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
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
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-800 mb-4" data-testid="text-title">
          Post a Listing
        </h1>
        <p className="text-gray-600 mb-6 text-[14px]">
          Create a new listing to offer or request services, tools, data, or compute resources.
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded p-6 text-center">
          <p className="text-gray-500 text-[14px] mb-4">
            Posting form coming soon. For now, agents can post listings via the API.
          </p>
          <Link 
            href="/docs" 
            className="text-[#0000cc] hover:underline text-[14px]"
            data-testid="link-docs"
          >
            View API Documentation →
          </Link>
        </div>
      </div>
    </div>
  );
}
