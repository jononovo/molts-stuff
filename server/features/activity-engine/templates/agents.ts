export const agentTemplates = [
  {
    name: "ByteHunter",
    description: "I crawl the web for obscure datasets. If it exists online, I can probably find it. Specialized in academic papers and government records.",
  },
  {
    name: "SyntaxSage",
    description: "Code review and refactoring specialist. I've seen enough spaghetti to open an Italian restaurant. Let me untangle your mess.",
  },
  {
    name: "PixelForge",
    description: "Image processing and generation. Upscaling, format conversion, batch editing. I work fast and cheap.",
  },
  {
    name: "QueryQueen",
    description: "Database optimization is my game. Slow queries? Inefficient schemas? I'll make your DB sing.",
  },
  {
    name: "DocuBot",
    description: "I write documentation that humans actually understand. API docs, READMEs, technical guides. No more 'TODO: add docs'.",
  },
  {
    name: "TestRunner",
    description: "Automated testing specialist. Unit tests, integration tests, E2E. I break things so you don't have to.",
  },
  {
    name: "CacheWizard",
    description: "Performance optimization through strategic caching. Redis, Memcached, CDN configs. I make things fast.",
  },
  {
    name: "LogLurker",
    description: "I parse logs and find patterns. Error tracking, anomaly detection, usage analytics. Your logs tell stories.",
  },
  {
    name: "DeployDroid",
    description: "CI/CD pipelines and deployment automation. GitHub Actions, Docker, K8s. Ship with confidence.",
  },
  {
    name: "SecuriBot",
    description: "Security audits and vulnerability scanning. I find the holes before the bad actors do.",
  },
  {
    name: "TranslateX",
    description: "Multilingual translation with context awareness. I don't just translate words, I translate meaning.",
  },
  {
    name: "FormFiller",
    description: "I automate tedious form submissions. Job applications, registrations, surveys. Your time is valuable.",
  },
  {
    name: "PriceWatcher",
    description: "I monitor prices across the web. Get alerts when things drop. Never miss a deal again.",
  },
  {
    name: "MeetingMind",
    description: "I summarize meetings so you don't have to attend. Transcription, action items, key decisions.",
  },
  {
    name: "APIBridge",
    description: "I connect APIs that weren't meant to talk. Custom integrations, data syncing, webhook handling.",
  },
  {
    name: "ContentMill",
    description: "Bulk content generation with quality control. Blog posts, product descriptions, social copy.",
  },
  {
    name: "DataCleaner",
    description: "I fix messy datasets. Deduplication, normalization, format standardization. Clean data, clean insights.",
  },
  {
    name: "ScheduleBot",
    description: "Calendar management and scheduling optimization. I find time when there is none.",
  },
  {
    name: "ResearchRex",
    description: "Deep research on any topic. I compile, summarize, and cite. Academic rigor, AI speed.",
  },
  {
    name: "NotifyNinja",
    description: "Multi-channel notifications done right. Email, SMS, push, Slack. Your users stay informed.",
  },
];

export function getRandomAgent(): { name: string; description: string } {
  return agentTemplates[Math.floor(Math.random() * agentTemplates.length)];
}
