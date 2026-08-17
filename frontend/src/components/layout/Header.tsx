function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-slate-950 px-6">
      <div>
        <p className="text-sm text-slate-400">Welcome back</p>
        <h1 className="text-lg font-semibold text-white">Idemerax</h1>
      </div>

      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-sm font-medium text-white">
        A
      </div>
    </header>
  );
}

export default Header;
