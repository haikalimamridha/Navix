export function Header({ dataMode }: { dataMode?: "live" | "mock" }) {
  return (
    <header className="border-b border-border bg-panel/60 backdrop-blur sticky top-0 z-30">
      <div className="mx-auto max-w-7xl px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="leading-none">
            <div className="text-accent font-semibold tracking-tight text-[25px]">
              Navix
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] mono">
          {dataMode && (
            <span
              className={
                "px-2 py-1 rounded-md border " +
                (dataMode === "live"
                  ? "border-ok/40 text-ok bg-ok/10"
                  : "border-warn/40 text-warn bg-warn/10")
              }
            >
              {dataMode === "live" ? "● LIVE DATA" : "● DEMO DATA"}
            </span>
          )}
          <span className="text-muted hidden sm:inline">powered by</span>
          <span className="text-accent-2 font-semibold">Bright Data</span>
        </div>
      </div>
    </header>
  );
}
