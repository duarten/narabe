let playing = null;

export function stopSpeaking() {
  playing?.pause();
  playing = null;
}

// Plays text in place of whatever is playing, rejecting if it can't be played.
// The server's URL is played directly rather than fetched first, as browsers
// can refuse to play audio once a click is more than a moment ago.
export function speak(text) {
  stopSpeaking();
  playing = new Audio(`/api/tts?text=${encodeURIComponent(text)}`);
  return playing.play().catch((err) => {
    // What interrupting it looks like, as when the next word is tapped
    if (err.name !== 'AbortError') throw err;
  });
}
