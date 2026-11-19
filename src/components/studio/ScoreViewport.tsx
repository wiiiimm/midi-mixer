export function ScoreViewport() {
  return (
    <div id="scorewrap">
      <h2 id="engravedTitle" hidden />
      <div id="scoreViewport" tabIndex={0} role="region" aria-label="Scrollable MIDI score" hidden>
        <div id="engravedScore" />
      </div>
      <svg id="score" hidden aria-label="Score. Click a position to start there." />
    </div>
  );
}

export default ScoreViewport;
