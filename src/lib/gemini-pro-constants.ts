export interface GeminiPerk {
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  highlight?: boolean;
}

export const GEMINI_PRO_PERKS: GeminiPerk[] = [
  {
    title: "18 Months Full Validity",
    subtitle: "1.5 Years Uninterrupted",
    description: "Enjoy active access for a complete 18 months without monthly subscription fees or renewals.",
    icon: "CalendarCheck",
    highlight: true,
  },
  {
    title: "Google Gemini 1.5 Pro & 2.0 Flash",
    subtitle: "Next-Gen AI Intelligence",
    description: "Full access to Google's flagship reasoning models with up to 1M+ token context window for massive documents and deep reasoning.",
    icon: "Sparkles",
    highlight: true,
  },
  {
    title: "2 TB Google One Cloud Storage",
    subtitle: "2,000 GB High-Speed Cloud",
    description: "Massive 2TB cloud storage across Google Drive, Gmail, and Google Photos for all your documents, videos, and backups.",
    icon: "Cloud",
    highlight: true,
  },
  {
    title: "Gemini in Google Workspace",
    subtitle: "Native AI Integration",
    description: "Use Gemini directly inside Gmail, Google Docs, Sheets, and Slides to compose, summarize, and automate workflows effortlessly.",
    icon: "FileText",
  },
  {
    title: "Deep Multimodal Analysis",
    subtitle: "Code, PDF, Audio & Video",
    description: "Upload full codebases, hundreds of pages of PDFs, datasets, and hours of video for instant synthesis and accurate answers.",
    icon: "Cpu",
  },
  {
    title: "Priority Generation & High Limits",
    subtitle: "Zero Delays or Throttling",
    description: "Skip peak-hour queues with dedicated high bandwidth, maximum rate limits, and ultra-fast generation times.",
    icon: "Zap",
  },
  {
    title: "Official Direct Activation Link",
    subtitle: "Sent via WhatsApp & Email",
    description: "Official setup activation link delivered directly to your provided WhatsApp number and email by admin after payment.",
    icon: "KeyRound",
    highlight: true,
  },
];

export const DEFAULT_GEMINI_PRICE_GHS = 50;
