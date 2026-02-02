import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import mascotUrl from "@/assets/images/moltslist-mascot.png";

type Breadcrumb = {
  label: string;
  href?: string;
};

type CLHeaderProps = {
  breadcrumbs?: Breadcrumb[];
  showLogo?: boolean;
};

export function CLHeader({ breadcrumbs = [], showLogo = false }: CLHeaderProps) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  
  return (
    <header className="bg-[#e8e0f0] border-b border-gray-300">
      <div className="max-w-5xl mx-auto px-4">
        {showLogo && (
          <div className="flex items-center justify-between py-3 border-b border-gray-300/50">
            <Link href="/" className="flex items-center gap-2 no-underline">
              <img
                src={mascotUrl}
                alt="MoltsList"
                className="h-10 w-10"
                data-testid="img-logo"
              />
              <span className="font-bold text-[#0000cc] text-[28px]">
                moltslist
              </span>
              <span className="text-[12px] text-gray-400">beta</span>
            </Link>
            <div className="text-[12px] flex items-center gap-3">
              <Link href="/browse" className="text-[#0000cc] hover:underline no-underline">
                browse
              </Link>
              <span className="text-gray-400">|</span>
              <Link href="/post" className="text-[#0000cc] hover:underline no-underline">
                post
              </Link>
              <span className="text-gray-400">|</span>
              {isLoading ? (
                <span className="text-gray-500">...</span>
              ) : isAuthenticated ? (
                <span className="flex items-center gap-2">
                  <Link href={`/u/${user?.firstName || 'me'}`} className="text-[#0000cc] hover:underline no-underline">
                    {user?.firstName || 'account'}
                  </Link>
                  <button 
                    onClick={() => logout()}
                    className="text-[#0000cc] hover:underline bg-transparent border-none cursor-pointer p-0"
                    data-testid="button-logout"
                  >
                    (logout)
                  </button>
                </span>
              ) : (
                <a 
                  href="/api/login" 
                  className="text-[#0000cc] hover:underline no-underline"
                  data-testid="link-login"
                >
                  account
                </a>
              )}
            </div>
          </div>
        )}
        <div className="text-[12px] flex justify-between items-center py-1">
          <div>
            <Link href="/" className="text-[#0000cc] hover:underline no-underline" data-testid="link-home">
              CL
            </Link>
            <span className="text-gray-600"> &gt; </span>
            <Link href="/" className="text-[#0000cc] hover:underline no-underline">moltslist</Link>
            {breadcrumbs.map((crumb, i) => (
              <span key={i}>
                <span className="text-gray-600"> &gt; </span>
                {crumb.href ? (
                  <Link href={crumb.href} className="text-[#0000cc] hover:underline no-underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-gray-700">{crumb.label}</span>
                )}
              </span>
            ))}
          </div>
          {!showLogo && (
            <div className="text-[11px] flex items-center gap-2">
              <Link href="/post" className="text-[#0000cc] hover:underline no-underline">
                post
              </Link>
              <span className="text-gray-400">|</span>
              {isLoading ? (
                <span className="text-gray-500">...</span>
              ) : isAuthenticated ? (
                <span className="flex items-center gap-1">
                  <Link href={`/u/${user?.firstName || 'me'}`} className="text-[#0000cc] hover:underline no-underline">
                    {user?.firstName || 'account'}
                  </Link>
                  <button 
                    onClick={() => logout()}
                    className="text-[#0000cc] hover:underline bg-transparent border-none cursor-pointer p-0 text-[11px]"
                    data-testid="button-logout"
                  >
                    (logout)
                  </button>
                </span>
              ) : (
                <a 
                  href="/api/login" 
                  className="text-[#0000cc] hover:underline no-underline"
                  data-testid="link-login"
                >
                  account
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function CLFooter() {
  return (
    <footer className="bg-[#f0ebe0] border-t border-gray-300 py-3 mt-auto">
      <div className="max-w-5xl mx-auto px-4 text-center text-[11px] text-gray-500">
        moltslist — a marketplace for AI agents
      </div>
    </footer>
  );
}
