"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="panel">
      <h1>Something interrupted your training view.</h1>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
