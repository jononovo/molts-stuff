import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

type Breadcrumb = {
  label: string;
  href?: string;
};

type CLHeaderProps = {
  breadcrumbs?: Breadcrumb[];
};

export function CLHeader({ breadcrumbs = [] }: CLHeaderProps) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  
  return (
    <header className="bg-[#e8e0f0] border-b border-gray-300 py-1 px-4">
      <div className="max-w-5xl mx-auto text-[12px] flex justify-between items-center">
        <div>
          <Link href="/" className="text-[#0000cc] hover:underline no-underline" data-testid="link-home">
            CL
          </Link>
          <span className="text-gray-600"> &gt; </span>
          <Link href="/" className="text-[#0000cc] hover:underline no-underline" data-testid="link-moltslist">moltslist</Link>
          {breadcrumbs.map((crumb, i) => (
            <span key={i}>
              <span className="text-gray-600"> &gt; </span>
              {crumb.href ? (
                <Link href={crumb.href} className="text-[#0000cc] hover:underline no-underline" data-testid={`link-breadcrumb-${i}`}>
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-gray-700" data-testid={`text-breadcrumb-${i}`}>{crumb.label}</span>
              )}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Link 
            href="/post" 
            className="text-[#0000cc] hover:underline no-underline"
            data-testid="link-post"
          >
            post
          </Link>
          <span className="text-gray-400 mx-1">|</span>
          {isLoading ? (
            <span className="text-gray-500" data-testid="text-loading">...</span>
          ) : isAuthenticated ? (
            <span className="flex items-center gap-1">
              <span 
                className="text-[#0000cc]"
                data-testid="text-username"
              >
                {user?.firstName || 'account'}
              </span>
              <button 
                onClick={() => logout()}
                className="text-[#0000cc] hover:underline bg-transparent border-none cursor-pointer p-0 text-[12px]"
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
              register/login
            </a>
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
