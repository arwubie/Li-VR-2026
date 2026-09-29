/*
   A small Wordle game built with the line-font text meshes.

   Point a VR controller at the keyboard and press its trigger. A physical
   keyboard also works: ENTER submits, BACKSPACE erases, and ESC restarts.
*/

import { ControllerBeam } from '../render/core/controllerInput.js';
import { updateAvatars } from '../render/core/avatars.js';

const WORDS = [
   'APPLE', 'BEACH', 'BRAIN', 'BRICK', 'CHAIR', 'CLIMB', 'CLOUD', 'DREAM',
   'EARTH', 'FLAME', 'FRAME', 'GRAPE', 'HEART', 'LIGHT', 'LINES', 'MOUSE',
   'PLANT', 'POINT', 'SMILE', 'SPACE', 'STONE', 'TABLE', 'TIGER', 'WATER',
];

const ROWS = 6;
const COLS = 5;
const TILE_RADIUS = .078;
const TILE_GAP = .023;
const TILE_STEP = 2 * TILE_RADIUS + TILE_GAP;
const LETTER_SCALE = 5.2;

const COLORS = {
   board:   [ .055, .065, .080 ],
   empty:   [ .105, .120, .145 ],
   active:  [ .165, .185, .215 ],
   absent:  [ .235, .255, .285 ],
   present: [ .72,  .55,  .10  ],
   correct: [ .18,  .55,  .31  ],
   text:    [ .96,  .96,  .93  ],
   accent:  [ .45,  .78,  1.0  ],
};

const createGameState = (answerIndex = 0) => ({
   version: 0,
   answerIndex,
   answer: WORDS[answerIndex],
   currentRow: 0,
   currentGuess: '',
   guesses: [],
   scores: [],
   gameOver: false,
   status: 'TYPE FIVE LETTERS',
   statusTone: 'text',
   lastPlayer: null,
});

// This global object is synchronized through the same mechanism as interact.js.
if (!window.wordleState || !Array.isArray(window.wordleState.guesses))
   window.wordleState = createGameState();

let cleanup;

// Score duplicate letters in two passes, just like Wordle does.
export const scoreGuess = (guess, answer) => {
   let result = Array(COLS).fill('absent');
   let remaining = {};

   for (let col = 0; col < COLS; col++) {
      if (guess[col] === answer[col])
         result[col] = 'correct';
      else
         remaining[answer[col]] = (remaining[answer[col]] || 0) + 1;
   }

   for (let col = 0; col < COLS; col++) {
      let letter = guess[col];
      if (result[col] !== 'correct' && remaining[letter] > 0) {
         result[col] = 'present';
         remaining[letter]--;
      }
   }
   return result;
};

export const init = async model => {
   cleanup?.();

   const previousInput = {
      onPress: inputEvents.onPress,
      onDrag: inputEvents.onDrag,
      onRelease: inputEvents.onRelease,
   };

   let scene = model.add().move(0, 1.52, -1.45).scale(.90).dull();
   let avatarRoot = model.add();
   let tiles = [];
   let keys = [];
   let gameState = window.wordleState;
   let renderedState = '';
   let displayedPlayerCount = -1;

   // A dark backing panel keeps the thin line font readable in VR.
   scene.add('cube,rounded').move(0, -.015, -.035)
        .scale(.535, .725, .025).color(COLORS.board);

   clay.defineTextMesh('wordleTitle', 'WORDLE');
   let title = scene.add('wordleTitle').color(COLORS.accent);

   clay.defineTextMesh('wordleStatus', 'TYPE FIVE LETTERS');
   let status = scene.add('wordleStatus').color(COLORS.text);

   clay.defineTextMesh('wordleHelp', 'POINT AND PRESS A KEY');
   let help = scene.add('wordleHelp').color(.52, .58, .66);

   clay.defineTextMesh('wordlePlayers', '1 OF 2 PLAYERS');
   let playerStatus = scene.add('wordlePlayers').color(.52, .72, .88);

   const placeCenteredText = (node, text, y, scale, z = .03) => {
      // defineTextMesh advances .019 units per character; glyphs are .015 wide.
      let width = text.length ? .019 * (text.length - 1) + .015 : 0;
      node.identity().move(-width * scale / 2, y, z).scale(scale);
   };

   placeCenteredText(title, 'WORDLE', .655, 3.0);
   placeCenteredText(help, 'POINT AND PRESS A KEY', -.665, 1.0);
   placeCenteredText(playerStatus, '1 OF 2 PLAYERS', .705, .75);

   for (let row = 0; row < ROWS; row++) {
      tiles[row] = [];
      for (let col = 0; col < COLS; col++) {
         let x = (col - (COLS - 1) / 2) * TILE_STEP;
         let y = .455 - row * TILE_STEP;
         let tile = scene.add().move(x, y, 0);
         let background = tile.add('cube,rounded')
                              .scale(TILE_RADIUS, TILE_RADIUS, .018)
                              .color(COLORS.empty);
         let meshName = `wordleLetter${row}${col}`;
         clay.defineTextMesh(meshName, 'A');
         let letter = tile.add(meshName).color(COLORS.text).scale(0);
         tiles[row][col] = { background, letter, meshName };
      }
   }

   // In-world keyboard for headset/controller use.
   let keyboard = scene.add().move(0, -.94, 0);
   // Keep the backing panel behind the key faces and their line-font labels.
   keyboard.add('cube,rounded').move(0, 0, -.040)
           .scale(.515, .245, .015).color(COLORS.board);

   const addKey = (value, x, y, halfWidth = .040, textScale = 1.65) => {
      let key = keyboard.add().move(x, y, 0);
      let background = key.add('cube,rounded')
                          .scale(halfWidth, .038, .018).color(COLORS.empty);
      let meshName = `wordleKey${keys.length}`;
      clay.defineTextMesh(meshName, value);
      let label = key.add(meshName).color(COLORS.text);
      let width = .019 * (value.length - 1) + .015;
      label.move(-width * textScale / 2, .0125 * textScale, .024).scale(textScale);
      let target = key.add('square').move(0, 0, .030)
                      .scale(halfWidth, .038, 1).opacity(0);
      keys.push({ value, background, target });
   };

   const addKeyRow = (letters, y) => {
      let step = .095;
      for (let col = 0; col < letters.length; col++)
         addKey(letters[col], (col - (letters.length - 1) / 2) * step, y);
   };

   addKeyRow('QWERTYUIOP',  .150);
   addKeyRow('ASDFGHJKL',   .055);
   addKeyRow('ZXCVBNM',    -.040);
   addKey('ENTER', -.320, -.145, .135, .65);
   addKey('BACK',    .000, -.145, .135, .85);
   addKey('RESET',   .320, -.145, .135, .65);

   let beams = {
      left: new ControllerBeam(model, 'left'),
      right: new ControllerBeam(model, 'right'),
   };

   const showLetter = (row, col, value) => {
      let tile = tiles[row][col];
      if (!value) {
         tile.letter.identity().scale(0);
         return;
      }
      clay.defineTextMesh(tile.meshName, value);
      // A single line-font glyph starts at its upper-left corner.
      tile.letter.identity()
          .move(-.0075 * LETTER_SCALE, .0125 * LETTER_SCALE, .024)
          .scale(LETTER_SCALE);
   };

   const setStatus = (message, color = COLORS.text) => {
      clay.defineTextMesh('wordleStatus', message);
      status.color(color);
      placeCenteredText(status, message, -.585, 1.25);
   };

   const renderGameState = () => {
      for (let row = 0; row < ROWS; row++) {
         let word = gameState.guesses[row] ||
                    (row === gameState.currentRow ? gameState.currentGuess : '');
         for (let col = 0; col < COLS; col++) {
            showLetter(row, col, word[col]);
            let result = gameState.scores[row]?.[col];
            tiles[row][col].background.color(result ? COLORS[result]
               : row === gameState.currentRow && !gameState.gameOver
               ? COLORS.active : COLORS.empty);
         }
      }
      setStatus(gameState.status, COLORS[gameState.statusTone] || COLORS.text);
      renderedState = JSON.stringify(gameState);
   };

   const publishGameState = () => {
      gameState.version = (gameState.version || 0) + 1;
      gameState.lastPlayer = typeof clientID === 'undefined' ? null : clientID;
      window.wordleState = gameState;
      server.broadcastGlobal('wordleState');
      renderGameState();
   };

   const addLetter = letter => {
      if (gameState.gameOver || gameState.currentGuess.length === COLS)
         return;
      gameState.currentGuess += letter;
      gameState.status = gameState.currentGuess.length === COLS
                       ? 'SELECT ENTER TO SUBMIT'
                       : `GUESS ${gameState.currentRow + 1} OF ${ROWS}`;
      gameState.statusTone = 'text';
      publishGameState();
   };

   const eraseLetter = () => {
      if (gameState.gameOver)
         return;
      gameState.currentGuess = gameState.currentGuess.slice(0, -1);
      gameState.status = `GUESS ${gameState.currentRow + 1} OF ${ROWS}`;
      gameState.statusTone = 'text';
      publishGameState();
   };

   const resetGame = () => {
      let version = gameState.version || 0;
      gameState = createGameState((gameState.answerIndex + 1) % WORDS.length);
      gameState.version = version;
      publishGameState();
   };

   const submitGuess = () => {
      if (gameState.gameOver)
         return;
      if (gameState.currentGuess.length !== COLS) {
         gameState.status = 'NOT ENOUGH LETTERS';
         gameState.statusTone = 'present';
         publishGameState();
         return;
      }

      let guess = gameState.currentGuess;
      let score = scoreGuess(guess, gameState.answer);
      gameState.guesses.push(guess);
      gameState.scores.push(score);
      gameState.currentGuess = '';

      if (guess === gameState.answer) {
         gameState.gameOver = true;
         gameState.status = 'YOU GOT IT!  SELECT RESET';
         gameState.statusTone = 'correct';
         publishGameState();
         return;
      }

      gameState.currentRow++;
      if (gameState.currentRow === ROWS) {
         gameState.gameOver = true;
         gameState.status = `THE WORD WAS ${gameState.answer}  SELECT RESET`;
         gameState.statusTone = 'present';
      }
      else {
         gameState.status = `GUESS ${gameState.currentRow + 1} OF ${ROWS}`;
         gameState.statusTone = 'text';
      }
      publishGameState();
   };

   const activateKey = value => {
      if (value === 'RESET')
         resetGame();
      else if (value === 'ENTER')
         submitGuess();
      else if (value === 'BACK')
         eraseLetter();
      else
         addLetter(value);
   };

   const pointedKey = hand => {
      beams[hand].update();
      let bestKey = null;
      let bestDistance = Infinity;
      for (let key of keys) {
         let hit = beams[hand].hitRect(key.target.getGlobalMatrix());
         if (hit && hit[2] < bestDistance) {
            bestDistance = hit[2];
            bestKey = key;
         }
      }
      return bestKey;
   };

   const onPress = hand => {
      let key = pointedKey(hand);
      if (!key)
         return;
      activateKey(key.value);
      if (typeof vibrate === 'function')
         vibrate(hand, .25, 35);
   };

   const callbacks = {
      onPress,
      onDrag: previousInput.onDrag,
      onRelease: previousInput.onRelease,
   };
   Object.assign(inputEvents, callbacks);

   const onKeyDown = event => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey)
         return;
      let target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
                     target.isContentEditable))
         return;

      if (event.key === 'Escape' ||
          (gameState.gameOver && event.key.toUpperCase() === 'R')) {
         resetGame();
         event.preventDefault();
      }
      else if (gameState.gameOver) {
         return;
      }
      else if (event.key === 'Backspace') {
         eraseLetter();
         event.preventDefault();
      }
      else if (event.key === 'Enter') {
         submitGuess();
         event.preventDefault();
      }
      else if (/^[a-zA-Z]$/.test(event.key) &&
               gameState.currentGuess.length < COLS) {
         addLetter(event.key.toUpperCase());
      }
   };

   window.addEventListener('keydown', onKeyDown);
   cleanup = () => {
      window.removeEventListener('keydown', onKeyDown);
      for (let name in callbacks)
         if (inputEvents[name] === callbacks[name])
            inputEvents[name] = previousInput[name];
   };

   renderGameState();

   model.animate(() => {
      scene.identity().move(0, 1.52, -1.45).scale(.90);

      let synchronized = server.synchronize('wordleState');
      if (synchronized && Array.isArray(synchronized.guesses) &&
          (synchronized.version || 0) >= (gameState.version || 0)) {
         gameState = synchronized;
         window.wordleState = gameState;
      }
      if (JSON.stringify(gameState) !== renderedState)
         renderGameState();

      let playerCount = typeof clients === 'undefined' ? 1
                      : Math.max(1, Math.min(2, clients.length));
      if (playerCount !== displayedPlayerCount) {
         let message = `${playerCount} OF 2 PLAYERS`;
         clay.defineTextMesh('wordlePlayers', message);
         placeCenteredText(playerStatus, message, .705, .75);
         displayedPlayerCount = playerCount;
      }

      if (typeof clients !== 'undefined' && typeof clientID !== 'undefined')
         updateAvatars(avatarRoot);

      beams.left.update();
      beams.right.update();

      let hoverLeft = pointedKey('left');
      let hoverRight = pointedKey('right');
      for (let key of keys)
         key.background.color(key === hoverLeft || key === hoverRight
                              ? COLORS.accent : COLORS.empty);
   });
};

export const deinit = () => {
   cleanup?.();
   cleanup = null;
};
