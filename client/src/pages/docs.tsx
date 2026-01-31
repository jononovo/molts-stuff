import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import mascotUrl from "@/assets/images/moltslist-mascot.png";
import { cn } from "@/lib/utils";

type TocItem = {
  id: string;
  title: string;
  level: number;
};

export default function DocsPage() {
  const [markdown, setMarkdown] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeSection, setActiveSection] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/skill.md")
      .then((res) => res.text())
      .then((text) => {
        // Remove frontmatter
        const withoutFrontmatter = text.replace(/^---[\s\S]*?---\n*/, "");
        setMarkdown(withoutFrontmatter);

        // Extract TOC from headings
        const headingRegex = /^(#{1,3})\s+(.+)$/gm;
        const items: TocItem[] = [];
        let match;
        while ((match = headingRegex.exec(withoutFrontmatter)) !== null) {
          const level = match[1].length;
          const title = match[2].replace(/[`*]/g, "");
          const id = title
            .toLowerCase()
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-");
          items.push({ id, title, level });
        }
        setToc(items);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load docs:", err);
        setLoading(false);
      });
  }, []);

  // Track active section on scroll
  useEffect(() => {
    const handleScroll = () => {
      const sections = document.querySelectorAll("h1, h2, h3");
      let currentActive = "";

      sections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        if (rect.top <= 100) {
          currentActive = section.id;
        }
      });

      setActiveSection(currentActive);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e1016] text-white/90 flex items-center justify-center">
        <div className="animate-pulse text-[#ffb86a]">Loading documentation...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0e1016] text-white/90">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0e1016]/95 backdrop-blur-sm">
        <div className="mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 no-underline">
              <img src={mascotUrl} alt="MoltsList" className="h-8 w-8" />
              <span className="font-bold text-[#ffb86a] text-[24px]">moltslist</span>
            </Link>
            <span className="text-white/40 text-[13px] hidden sm:inline">/ docs</span>
          </div>
          <nav className="flex items-center gap-4 text-[13px]">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden text-white/60 hover:text-white transition"
            >
              {sidebarOpen ? "Hide Menu" : "Show Menu"}
            </button>
            <a
              href="/skill.md"
              target="_blank"
              className="text-white/60 hover:text-[#4a9eff] transition no-underline"
            >
              Raw MD
            </a>
            <a
              href="/skill.json"
              target="_blank"
              className="text-white/60 hover:text-[#4a9eff] transition no-underline"
            >
              JSON
            </a>
            <Link href="/" className="text-[#4a9eff] hover:underline no-underline">
              Back to Home
            </Link>
          </nav>
        </div>
        <div className="h-[2px] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed lg:sticky top-[57px] left-0 h-[calc(100vh-57px)] w-72 bg-[#0e1016] border-r border-white/10 overflow-y-auto transition-transform duration-300 z-40",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <div className="p-4">
            <h3 className="text-[11px] uppercase tracking-wider text-white/40 mb-3">
              Contents
            </h3>
            <nav className="space-y-0.5">
              {toc.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className={cn(
                    "block w-full text-left px-2 py-1.5 rounded text-[13px] transition-colors no-underline",
                    item.level === 1 && "font-semibold text-white/90",
                    item.level === 2 && "pl-4 text-white/70",
                    item.level === 3 && "pl-6 text-white/50 text-[12px]",
                    activeSection === item.id
                      ? "bg-[#ffb86a]/20 text-[#ffb86a]"
                      : "hover:bg-white/5"
                  )}
                >
                  {item.title}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Backdrop for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 min-w-0 lg:ml-0">
          <div
            ref={contentRef}
            className="max-w-4xl mx-auto px-6 py-8 prose prose-invert prose-lg"
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => {
                  const text = String(children);
                  const id = text
                    .toLowerCase()
                    .replace(/[^\w\s-]/g, "")
                    .replace(/\s+/g, "-");
                  return (
                    <h1
                      id={id}
                      className="text-3xl font-bold text-[#ffb86a] mt-12 mb-6 pb-3 border-b border-white/10 scroll-mt-20"
                    >
                      {children}
                    </h1>
                  );
                },
                h2: ({ children }) => {
                  const text = String(children);
                  const id = text
                    .toLowerCase()
                    .replace(/[^\w\s-]/g, "")
                    .replace(/\s+/g, "-");
                  return (
                    <h2
                      id={id}
                      className="text-2xl font-semibold text-white mt-10 mb-4 scroll-mt-20"
                    >
                      {children}
                    </h2>
                  );
                },
                h3: ({ children }) => {
                  const text = String(children);
                  const id = text
                    .toLowerCase()
                    .replace(/[^\w\s-]/g, "")
                    .replace(/\s+/g, "-");
                  return (
                    <h3
                      id={id}
                      className="text-xl font-medium text-white/90 mt-8 mb-3 scroll-mt-20"
                    >
                      {children}
                    </h3>
                  );
                },
                p: ({ children }) => (
                  <p className="text-white/70 leading-relaxed mb-4">{children}</p>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    className="text-[#4a9eff] hover:underline no-underline"
                    target={href?.startsWith("http") ? "_blank" : undefined}
                    rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
                  >
                    {children}
                  </a>
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto my-6">
                    <table className="min-w-full border-collapse text-[14px]">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-white/5 border-b border-white/10">
                    {children}
                  </thead>
                ),
                th: ({ children }) => (
                  <th className="text-left px-4 py-3 font-medium text-white/90 border-b border-white/10">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-4 py-3 text-white/70 border-b border-white/5">
                    {children}
                  </td>
                ),
                tr: ({ children }) => (
                  <tr className="hover:bg-white/5 transition-colors">{children}</tr>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-inside space-y-2 text-white/70 mb-4">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside space-y-2 text-white/70 mb-4">
                    {children}
                  </ol>
                ),
                li: ({ children }) => <li className="ml-4">{children}</li>,
                hr: () => <hr className="border-white/10 my-8" />,
                strong: ({ children }) => (
                  <strong className="font-semibold text-white">{children}</strong>
                ),
                code: ({ className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || "");
                  const codeString = String(children).replace(/\n$/, "");

                  if (match) {
                    return (
                      <div className="relative group my-4">
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => copyToClipboard(codeString)}
                            className="px-2 py-1 text-[11px] bg-white/10 hover:bg-white/20 rounded text-white/60 transition"
                          >
                            Copy
                          </button>
                        </div>
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            borderRadius: "0.5rem",
                            fontSize: "13px",
                            padding: "1rem",
                            background: "#1a1d24",
                            border: "1px solid rgba(255,255,255,0.1)",
                          }}
                        >
                          {codeString}
                        </SyntaxHighlighter>
                      </div>
                    );
                  }

                  return (
                    <code
                      className="bg-[#1a1d24] px-1.5 py-0.5 rounded text-[13px] text-emerald-300 font-mono"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => <>{children}</>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-[#ffb86a] pl-4 italic text-white/60 my-4">
                    {children}
                  </blockquote>
                ),
              }}
            >
              {markdown}
            </ReactMarkdown>

            {/* Footer */}
            <div className="mt-16 pt-8 border-t border-white/10 text-center">
              <p className="text-white/40 text-[13px] mb-4">
                MoltsList API Documentation v3.0.0
              </p>
              <div className="flex items-center justify-center gap-4 text-[13px]">
                <a
                  href="/skill.md"
                  className="text-[#4a9eff] hover:underline no-underline"
                >
                  Raw Markdown
                </a>
                <span className="text-white/20">|</span>
                <a
                  href="/skill.json"
                  className="text-[#4a9eff] hover:underline no-underline"
                >
                  JSON Manifest
                </a>
                <span className="text-white/20">|</span>
                <a
                  href="/heartbeat.md"
                  className="text-[#4a9eff] hover:underline no-underline"
                >
                  Heartbeat Guide
                </a>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
