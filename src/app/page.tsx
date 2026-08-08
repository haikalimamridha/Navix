import Header from "@/src/components/Header";
import AnalyzeForm from "@/src/components/AnalyzeForm";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <Header />

      {/* Hero Section */}
      <section className="relative overflow-hidden">

        <div className="mx-auto max-w-7xl px-6 pb-20 pt-20 lg:px-8 lg:pt-28">
          <div className="mx-auto max-w-4xl text-center">

            {/* Heading */}
            <h1 className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              See the risk
              <br />
              <span className="text-cyan-400">
                before it ships.
              </span>
            </h1>

            {/* Description */}
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-slate-400">
              Navix analyzes global supply-chain intelligence to predict
              disruptions, freight cost increases, and shipping delays before
              they impact your shipment.
            </p>
          </div>

          {/* Analysis Card */}
          <div className="relative z-10 mx-auto mt-16 max-w-5xl">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-2 shadow-2xl shadow-cyan-950/20 backdrop-blur">
              <div className="rounded-xl border border-slate-800/80 bg-slate-950 p-6 sm:p-8">
                <div className="mb-7">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400">
                      ✦
                    </div>

                    <div>
                      <h2 className="font-semibold text-white">
                        Analyze a Shipment
                      </h2>
                      <p className="text-sm text-slate-500">
                        Enter your shipment details to begin risk analysis.
                      </p>
                    </div>
                  </div>
                </div>

                <AnalyzeForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>© 2026 Navix</p>
          <p>AI-powered supply chain intelligence</p>
        </div>
      </footer>
    </main>
  );
}