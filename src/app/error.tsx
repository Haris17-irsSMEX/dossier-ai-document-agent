"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <main className="app-shell">
      <div className="workspace">
        <section className="panel">
          <h1>Something went wrong</h1>
          <p className="lead">
            The request could not be completed. Your existing application data
            has not been removed.
          </p>
          <button className="button" type="button" onClick={reset}>
            Try again
          </button>
        </section>
      </div>
    </main>
  );
}
