import { createSignal, createResource, For, Show } from 'solid-js';
import { fetchGames, fetchGame, deleteGame } from '../lib/api';

function GameList(props) {
  const [games, { refetch }] = createResource(fetchGames);
  const [deleteConfirm, setDeleteConfirm] = createSignal(null);

  const handleDelete = async (filename) => {
    if (deleteConfirm() === filename) {
      try {
        await deleteGame(filename);
        setDeleteConfirm(null);
        refetch();
      } catch (err) {
        console.error('Failed to delete game:', err);
      }
    } else {
      setDeleteConfirm(filename);
    }
  };

  const handlePlay = async (filename) => {
    try {
      const game = await fetchGame(filename);
      props.onPlayGame(game);
    } catch (err) {
      console.error('Failed to load game:', err);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div class="game-list">
      <Show when={!games.loading && (!games() || games().length === 0)}>
        <div class="welcome">
          <h2>Welcome to Narabe!</h2>
          <p>Learn Japanese by arranging shuffled words into correct sentences.</p>
          <p>Create your first game to get started.</p>
        </div>
      </Show>

      <Show when={games.loading}>
        <div class="loading">Loading games...</div>
      </Show>

      <Show when={games() && games().length > 0}>
        <div class="games-grid">
          <For each={games()}>
            {(game) => (
              <div class="game-card" onClick={() => handlePlay(game.filename)}>
                <h3>{game.name}</h3>
                <div class="game-meta">
                  <span>{game.sentenceCount} sentences</span>
                  <span>{formatDate(game.createdAt)}</span>
                </div>
                <button
                  class={`delete-btn ${deleteConfirm() === game.filename ? 'confirm' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(game.filename);
                  }}
                >
                  {deleteConfirm() === game.filename ? 'Confirm?' : 'Delete'}
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <button class="create-btn" onClick={props.onCreateNew}>
        + Create New Game
      </button>
    </div>
  );
}

export default GameList;
