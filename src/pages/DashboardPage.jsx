function DashboardPage() {
  return (
    <main className="theme min-h-screen bg-zinc-50 text-zinc-900">
      <div className="grid min-h-screen md:grid-cols-[260px_1fr]">
        <aside className="border-r border-zinc-200 bg-white p-5">
          <p className="mb-8 text-xs uppercase tracking-[0.3em] text-zinc-500">Handy Dudes</p>
          <nav aria-label="Dashboard navigation">
            <a
              href="#"
              className="block rounded-lg border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white">
              Overview
            </a>
          </nav>
        </aside>

        <section className="p-6 sm:p-10">
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="mt-2 text-zinc-600">
            Welcome to your sales dashboard. Share the next sections you want and I will add them.
          </p>
        </section>
      </div>
    </main>
  )
}

export default DashboardPage
