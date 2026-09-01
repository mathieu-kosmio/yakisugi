export default function MapLoading() {
  return (
    <section className="radar-page" aria-busy="true" aria-live="polite">
      <div className="radar-layout radar-loading-layout">
        <aside className="radar-sidebar radar-loading-sidebar">
          <p className="eyebrow">Chargement de la carte</p>
          <div className="loading-line loading-line-title" />
          <div className="loading-line" />
          <div className="loading-line loading-line-short" />
          <div className="loading-summary-grid">
            <span />
            <span />
            <span />
            <span />
          </div>
        </aside>
        <div className="radar-map-wrap radar-loading-map">
          <p>Préparation des données cartographiques…</p>
        </div>
      </div>
    </section>
  );
}
