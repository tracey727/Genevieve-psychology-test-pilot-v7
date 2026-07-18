import Link from "next/link";

export default function Home() {
  return (
    <main className="gateway-page">
      <header className="gateway-brand">
        <div className="brand-pair">
          <img src="/demo/assets/icon-512.png" alt="Approved GENEVIEVE App GA emblem" />
          <img src="/demo/assets/genevieve-tree-logo-approved-original.jpeg" alt="Approved GENEVIEVE tree-and-roots mark" />
        </div>
        <div><strong>GENEVIEVE App™</strong><span>GENEVIEVE HEALTH™</span><small>Safety from roots to every journey.</small></div>
      </header>
      <section className="gateway-hero">
        <span className="eyebrow">Mood &amp; Mind Centre · Connected psychology-practice safety</span>
        <h1>Irene and her staff, connected without crossing privacy boundaries.</h1>
        <p>Staff receive only their own operational work, messages, support controls and authorised alerts. Irene and her approved governance roles retain the whole-practice view.</p>
        <div className="safety-ribbon"><b>Controlled demonstration</b> Use fictional information only. No therapy notes, diagnoses, health records or identifiable client information.</div>
      </section>
      <section className="gateway-grid four">
        <Link className="gateway-card primary" href="/irene">
          <span>01</span><h2>Irene’s Connected Dashboard</h2>
          <p>Authorise staff, manage safety and workloads, approve operational learning, restore archived memory and control permanent deletion.</p>
          <b>Open director hub →</b>
        </Link>
        <Link className="gateway-card" href="/staff">
          <span>02</span><h2>Staff Phone App</h2>
          <p>Apple and Android-ready PWA with private tasks, messages, safety controls, personal memory and reviewed learning proposals.</p>
          <b>Open staff app →</b>
        </Link>
        <Link className="gateway-card reception" href="/reception">
          <span>03</span><h2>Reception Safety Base</h2>
          <p>Coded callbacks, scripts, escalation, private Irene contact, break protection and reception-only operational memory.</p>
          <b>Open reception base →</b>
        </Link>
        <Link className="gateway-card" href="/demo/index.html">
          <span>04</span><h2>Practice Safety Dashboard</h2>
          <p>Emergency cover, continuity, supervision, WHS, incidents, documents, forms and evidence controls.</p>
          <b>Open full dashboard →</b>
        </Link>
      </section>
      <footer className="gateway-footer">GENEVIEVE App™ © 2026 Tracey Ann Kennedy · Human-led operational safety · In an emergency call 000</footer>
    </main>
  );
}
