export default function Header() {
  return (
    <header className="relative z-20 border-b border-slate-900 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
        <a href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400 font-bold text-slate-950">
            N
          </div>

          <span className="text-lg font-bold tracking-tight">
            <span className="text-cyan-400">Navix</span>
          </span>
        </a>

        <div className="hidden items-center gap-8 text-sm text-slate-400 sm:flex">
          <a
            href="#analyze"
            className="rounded-lg border border-slate-700 px-4 py-2 text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-400"
          >
            Analyze
          </a>
        </div>
      </div>
    </header>
  );
}