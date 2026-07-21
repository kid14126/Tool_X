import ToolXApp from "@/components/ToolXApp";

export default function Home() {
  return (
    <main className="relative min-h-full flex-1">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -left-32 top-0 h-72 w-72 rounded-full bg-sky-600/20 blur-3xl" />
        <div className="absolute -right-20 top-40 h-64 w-64 rounded-full bg-violet-600/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>
      <ToolXApp />
    </main>
  );
}
