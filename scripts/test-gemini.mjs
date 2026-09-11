import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

const key = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

try {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Dis OKAPI" }] }],
    }),
  });
  const text = await r.text();
  console.log("status", r.status);
  console.log(text.slice(0, 300));
} catch (e) {
  console.log("ERR", e?.cause || e?.message || e);
}
