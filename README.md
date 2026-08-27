# Navix

Navix is an advanced supply chain risk prediction platform designed to identify and mitigate logistics risks across Indonesia. By leveraging a multi-agent AI orchestration pipeline, Navix provides real-time insights into potential disruptions, cost fluctuations, and regulatory hurdles before they impact your business.

## 🚀 Features

- **Predictive Risk Analysis**: Identify supply chain risks before they happen using real-time data and AI.
- **Multi-Agent Orchestration**: A sophisticated pipeline of specialized AI agents:
  - **Product & Material Agent**: Analyzes product categories, HS codes, and material breakdowns.
  - **Intelligence Agents**: Parallel analysis of Commodity, Freight, Port, Weather, Geopolitical, Supplier, and Regulatory risks.
  - **Cost & Route Engine**: Forecasts cost increases and potential delivery delays.
  - **Executive Summary & Action Plan**: Provides prioritized recommendations and high-level insights.
- **Live Agent Console**: Watch the AI agents work in real-time via Server-Sent Events (SSE).
- **Interactive Dashboard**: Visualize risk factors, cost forecasts, and dependency graphs using Recharts.
- **Web Intelligence**: Integrated with Bright Data MCP for live web searching and scraping to ensure up-to-date analysis.

## 🛠️ Tech Stack

- **Framework**: [Next.js 15+](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Visualizations**: [Recharts](https://recharts.org/)
- **AI Orchestration**: [OpenAI SDK](https://github.com/openai/openai-node)
- **Data Sourcing**: [Bright Data MCP](https://brightdata.com/)
- **Validation**: [Zod](https://zod.dev/)

## 📂 Project Structure

```text
├── app/                # Next.js App Router (Pages & API Routes)
├── components/         # React UI Components (Dashboard, Console, Forms)
├── lib/                # Core Logic & Utilities
│   ├── agents.ts       # AI Agent definitions
│   ├── orchestrator.ts # Main analysis pipeline logic
│   ├── brightdata.ts   # Web search & scraping integration
│   └── types.ts        # TypeScript interfaces and schemas
├── public/             # Static assets
└── ...                 # Configuration files (TS, ESLint, Tailwind)
```

## 🚦 Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- OpenAI API Key
- Bright Data API Key (for live web search capabilities)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/haikalimamridha/Navix.git
   cd Navix
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env.local` file in the root directory and add your API keys:
   ```env
   OPENAI_API_KEY=your_openai_key
   BRIGHTDATA_API_KEY=your_brightdata_key
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📄 License

This project is private and proprietary.

---

Built for the future of Indonesian logistics.