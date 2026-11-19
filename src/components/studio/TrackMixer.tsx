export function TrackMixer() {
  return (
    <section className="strip" data-mobile-home="mix">
      <h2>Track mixer</h2>
      <div className="mix-tools">
        <label>
          <input id="all" type="checkbox" /> All tracks
        </label>
        <button id="reset" type="button">
          Reset mix
        </button>
        <button id="group" type="button" disabled>
          Mute selected
        </button>
        <button id="solosel" type="button" disabled>
          Solo selected
        </button>
      </div>
      <table>
        <tbody id="rows" />
      </table>
    </section>
  );
}

export default TrackMixer;
