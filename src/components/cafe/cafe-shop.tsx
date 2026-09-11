"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import {
  WHATSAPP_NUMBER,
  cafeCategories,
  cafeProducts,
  type CafeProduct,
} from "@/data/cafe-products";

type CartLine = { product: CafeProduct; qty: number };

export function CafeShop() {
  const [filter, setFilter] = useState<string>("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [mode, setMode] = useState<"livraison" | "retrait">("livraison");
  const [provider, setProvider] = useState("M-Pesa");

  const products = useMemo(
    () =>
      filter === "all"
        ? cafeProducts
        : cafeProducts.filter((p) => p.category === filter),
    [filter],
  );

  const totalUsd = cart.reduce((s, l) => s + l.product.priceUsd * l.qty, 0);
  const totalCdf = cart.reduce((s, l) => s + l.product.priceCdf * l.qty, 0);
  const count = cart.reduce((s, l) => s + l.qty, 0);

  function addToCart(product: CafeProduct) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [...prev, { product, qty: 1 }];
    });
    setCartOpen(true);
  }

  function updateQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) =>
          l.product.id === id ? { ...l, qty: Math.max(0, l.qty + delta) } : l,
        )
        .filter((l) => l.qty > 0),
    );
  }

  function sendWhatsApp(e: FormEvent) {
    e.preventDefault();
    if (!cart.length) return;

    const itemsList = cart
      .map(
        (l) =>
          `- ${l.qty}x ${l.product.name} (${(l.product.priceUsd * l.qty).toFixed(2)}$)`,
      )
      .join("\n");

    const message = `☕ *NOUVELLE COMMANDE — CAFÉ GOMBE*

*Articles :*
${itemsList}

*Total :* ${totalUsd.toFixed(2)}$ / ${totalCdf.toLocaleString("fr-CD")} FC
*Mode :* ${mode === "livraison" ? "Livraison Gombe" : "Retrait sur place"}
*Paiement :* ${provider}
*Téléphone :* ${phone}
*Adresse :* ${mode === "livraison" ? `Gombe, ${address}` : "Retrait boutique"}

Merci de confirmer la commande !`;

    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
      "_blank",
    );
  }

  return (
    <div className="cafe-shop min-h-screen text-[#2a1a12]">
      <header className="sticky top-0 z-30 border-b border-[#2a1a12]/10 bg-[#fff8f1]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-[family-name:var(--font-syne)] text-xl font-bold tracking-tight">
              Café Gombe
            </p>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#2a1a12]/45">
              Kinshasa · coffee to go
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-full border border-[#2a1a12]/10 bg-white/70 px-3 py-1.5 text-xs font-medium"
            >
              ← Okapi
            </Link>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="rounded-full bg-[#6b3a28] px-4 py-2 text-sm font-semibold text-white"
            >
              Panier · {count}
            </button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#2a1a12]/8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(232,137,42,0.28),transparent_50%),linear-gradient(160deg,#3b2418_0%,#6b3a28_45%,#2a1a12_100%)]" />
        <div className="relative mx-auto max-w-5xl px-4 py-14 text-white sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
            Preview Okapi · Boutique
          </p>
          <h1 className="mt-3 max-w-xl font-[family-name:var(--font-syne)] text-4xl font-bold leading-tight sm:text-5xl">
            Ton café préféré à Gombe
          </h1>
          <p className="mt-3 max-w-lg text-base text-white/75">
            Catalogue, panier, Mobile Money et commande WhatsApp — mobile-first.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {cafeCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setFilter(cat.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                filter === cat.id
                  ? "bg-[#6b3a28] text-white"
                  : "border border-[#2a1a12]/10 bg-white/70 text-[#2a1a12]/70"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <article
              key={product.id}
              className="flex flex-col rounded-[24px] border border-[#2a1a12]/8 bg-white/80 p-4"
            >
              <div className="mb-3 flex h-28 items-end rounded-2xl bg-[linear-gradient(145deg,#c48a4a,#6b3a28)] p-3 text-white">
                <span className="font-[family-name:var(--font-syne)] text-lg font-bold">
                  {product.name.split(" ")[0]}
                </span>
              </div>
              {product.badge ? (
                <span className="mb-2 w-fit rounded-full bg-[#e8892a]/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#c86b14]">
                  {product.badge}
                </span>
              ) : null}
              <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold">
                {product.name}
              </h2>
              <p className="mt-1 flex-1 text-sm text-[#2a1a12]/55">
                {product.description}
              </p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-base font-bold">${product.priceUsd.toFixed(2)}</p>
                  <p className="text-xs text-[#2a1a12]/45">
                    {product.priceCdf.toLocaleString("fr-CD")} FC
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => addToCart(product)}
                  className="rounded-2xl bg-[#e8892a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c86b14]"
                >
                  Ajouter
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>

      {count > 0 ? (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-5 left-1/2 z-40 flex w-[min(92%,420px)] -translate-x-1/2 items-center justify-between rounded-2xl bg-[#6b3a28] px-5 py-4 text-white"
        >
          <span className="text-sm font-semibold">{count} article{count > 1 ? "s" : ""}</span>
          <span className="text-sm font-bold">
            ${totalUsd.toFixed(2)} · Voir panier
          </span>
        </button>
      ) : null}

      {cartOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#2a1a12]/40">
          <button
            type="button"
            aria-label="Fermer"
            className="absolute inset-0"
            onClick={() => setCartOpen(false)}
          />
          <aside className="relative flex h-full w-full max-w-md flex-col bg-[#fff8f1]">
            <div className="flex items-center justify-between border-b border-[#2a1a12]/10 px-5 py-4">
              <h2 className="font-[family-name:var(--font-syne)] text-xl font-bold">
                Panier
              </h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="text-sm font-medium text-[#2a1a12]/55"
              >
                Fermer
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {cart.length === 0 ? (
                <p className="text-sm text-[#2a1a12]/50">Ton panier est vide.</p>
              ) : (
                <ul className="space-y-3">
                  {cart.map((line) => (
                    <li
                      key={line.product.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-[#2a1a12]/8 bg-white/80 px-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold">{line.product.name}</p>
                        <p className="text-xs text-[#2a1a12]/45">
                          ${line.product.priceUsd.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQty(line.product.id, -1)}
                          className="h-8 w-8 rounded-full border border-[#2a1a12]/15"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">
                          {line.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(line.product.id, 1)}
                          className="h-8 w-8 rounded-full border border-[#2a1a12]/15"
                        >
                          +
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-[#2a1a12]/10 px-5 py-4">
              <div className="mb-3 flex justify-between text-sm">
                <span>Total</span>
                <span className="font-bold">
                  ${totalUsd.toFixed(2)} · {totalCdf.toLocaleString("fr-CD")} FC
                </span>
              </div>
              <button
                type="button"
                disabled={!cart.length}
                onClick={() => {
                  setCartOpen(false);
                  setCheckoutOpen(true);
                }}
                className="w-full rounded-2xl bg-[#25D366] py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                Commander
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {checkoutOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#2a1a12]/45 p-4 sm:items-center">
          <form
            onSubmit={sendWhatsApp}
            className="w-full max-w-md rounded-[28px] bg-[#fff8f1] p-5"
          >
            <h2 className="font-[family-name:var(--font-syne)] text-xl font-bold">
              Finaliser la commande
            </h2>
            <p className="mt-1 text-sm text-[#2a1a12]/55">
              Mobile Money + envoi WhatsApp
            </p>

            <div className="mt-4 space-y-3">
              <label className="block text-left text-sm">
                <span className="mb-1 block text-xs font-medium text-[#2a1a12]/50">
                  Téléphone
                </span>
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="081XXXXXXX"
                  className="w-full rounded-2xl border border-[#2a1a12]/10 bg-white px-4 py-2.5 outline-none"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                {(["livraison", "retrait"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-2xl px-3 py-2.5 text-sm font-medium ${
                      mode === m
                        ? "bg-[#6b3a28] text-white"
                        : "border border-[#2a1a12]/10 bg-white"
                    }`}
                  >
                    {m === "livraison" ? "Livraison Gombe" : "Retrait"}
                  </button>
                ))}
              </div>

              {mode === "livraison" ? (
                <label className="block text-left text-sm">
                  <span className="mb-1 block text-xs font-medium text-[#2a1a12]/50">
                    Adresse / bureau à Gombe
                  </span>
                  <input
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ex: Av. Tombalbaye, Imm. Y"
                    className="w-full rounded-2xl border border-[#2a1a12]/10 bg-white px-4 py-2.5 outline-none"
                  />
                </label>
              ) : null}

              <label className="block text-left text-sm">
                <span className="mb-1 block text-xs font-medium text-[#2a1a12]/50">
                  Mobile Money
                </span>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full rounded-2xl border border-[#2a1a12]/10 bg-white px-4 py-2.5 outline-none"
                >
                  <option value="M-Pesa">M-Pesa</option>
                  <option value="Orange Money">Orange Money</option>
                  <option value="Airtel Money">Airtel Money</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="flex-1 rounded-2xl border border-[#2a1a12]/10 py-3 text-sm font-medium"
              >
                Retour
              </button>
              <button
                type="submit"
                className="flex-[1.4] rounded-2xl bg-[#25D366] py-3 text-sm font-semibold text-white"
              >
                WhatsApp
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
