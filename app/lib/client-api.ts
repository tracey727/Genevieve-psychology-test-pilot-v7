export function demoKey(defaultKey: string) {
  if (typeof window === "undefined") return defaultKey;
  return new URLSearchParams(window.location.search).get("demo") || defaultKey;
}

export async function hubFetch(path: string, init: RequestInit = {}, defaultDemo = "director") {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (typeof window !== "undefined") {
    const explicitDemo = new URLSearchParams(window.location.search).get("demo");
    if (explicitDemo || ["terminal.local", "localhost", "127.0.0.1"].includes(window.location.hostname)) {
      headers.set("x-genevieve-demo-user", explicitDemo || demoKey(defaultDemo));
    }
  }
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The secure connection could not be completed.");
  return data;
}

export function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
