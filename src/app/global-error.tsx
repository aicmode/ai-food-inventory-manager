"use client";

import { useEffect } from "react";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? error.message);
  }, [error]);

  return (
    <html lang="ja">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem 1rem", textAlign: "center", color: "#0f172a" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>画面を表示できませんでした</h1>
        <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#475569" }}>
          一時的な問題が発生しました。再読み込みしても解決しない場合は、時間をおいてお試しください。
          {error.digest ? `（エラーID: ${error.digest}）` : null}
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{ marginTop: "1.5rem", padding: "0.5rem 1rem", borderRadius: "0.375rem", background: "#047857", color: "#fff", border: 0 }}
        >
          再試行
        </button>
      </body>
    </html>
  );
}
