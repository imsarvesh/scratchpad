import { HomeCreate } from "@/components/HomeCreate";

export default function Home() {
  return (
    <main className="home-shell paper-grain">
      <div className="edition-mark" aria-hidden="true">
        <span>Shared drawing, simply</span>
        <span>No. 01</span>
      </div>

      <section className="home-composition" aria-labelledby="home-title">
        <div className="brand-block">
          <p className="eyebrow">Make space for an idea</p>
          <h1 id="home-title">Scratchpad</h1>
          <p className="brand-copy">
            A quiet, shared canvas for sketches, notes, and everything not yet
            fully formed.
          </p>
        </div>
        <HomeCreate />
      </section>

      <p className="home-footnote">Nothing to save. Just share the room.</p>
    </main>
  );
}
