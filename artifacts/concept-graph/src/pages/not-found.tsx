export default function NotFound() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-muted-foreground">404</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-foreground">This page doesn’t exist</h1>
        <p className="mt-3 text-muted-foreground">The link may be old or mistyped. Your notebooks are on the home page.</p>
        <a
          href={import.meta.env.BASE_URL}
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to your notebooks
        </a>
      </div>
    </main>
  );
}
