import { createSignal } from 'solid-js';
import GameList from './components/GameList';
import GameCreator from './components/GameCreator';
import GamePlayer from './components/GamePlayer';

function App() {
  const [view, setView] = createSignal('list');
  const [currentGame, setCurrentGame] = createSignal(null);

  const navigateToList = () => {
    setCurrentGame(null);
    setView('list');
  };

  const navigateToCreate = () => {
    setView('create');
  };

  const navigateToPlay = (game) => {
    setCurrentGame(game);
    setView('play');
  };

  return (
    <div class="app">
      <header class="header">
        <h1 onClick={navigateToList}>並べ NARABE</h1>
      </header>
      <main class="main">
        {view() === 'list' && (
          <GameList
            onCreateNew={navigateToCreate}
            onPlayGame={navigateToPlay}
          />
        )}
        {view() === 'create' && (
          <GameCreator onBack={navigateToList} onGameCreated={navigateToList} />
        )}
        {view() === 'play' && (
          <GamePlayer game={currentGame()} onBack={navigateToList} />
        )}
      </main>
    </div>
  );
}

export default App;
