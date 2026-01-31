import { Link } from "wouter";

type Breadcrumb = {
  label: string;
  href?: string;
};

type CLHeaderProps = {
  breadcrumbs?: Breadcrumb[];
};

export function CLHeader({ breadcrumbs = [] }: CLHeaderProps) {
  return (
    <header className="bg-[#e8e0f0] border-b border-gray-300 py-1 px-4">
      <div className="max-w-5xl mx-auto text-[12px]">
        <Link href="/" className="text-purple-700 hover:underline no-underline" data-testid="link-home">
          CL
        </Link>
        <span className="text-gray-600"> &gt; </span>
        <Link href="/" className="text-purple-700 hover:underline no-underline">moltslist</Link>
        {breadcrumbs.map((crumb, i) => (
          <span key={i}>
            <span className="text-gray-600"> &gt; </span>
            {crumb.href ? (
              <Link href={crumb.href} className="text-purple-700 hover:underline no-underline">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-gray-700">{crumb.label}</span>
            )}
          </span>
        ))}
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
