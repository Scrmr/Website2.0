document.addEventListener('DOMContentLoaded', () => {
  const wordInput    = document.getElementById('word-input');
  const generateBtn  = document.getElementById('generate-btn');
  const poemContainer = document.getElementById('poem-container');
  const guessTracker = document.getElementById('guess-tracker');

  const SHIFT      = 3;
  const MAX_GUESSES = 10;
  let guessesLeft  = MAX_GUESSES;
  let gameActive   = false;

  // ── Cipher helpers ──────────────────────────────────────────────────────────

  function encryptCaesarCipher(word, shift) {
    return word.split('').map(char => {
      if (/[A-Z]/.test(char)) return String.fromCharCode((char.charCodeAt(0) - 65 + shift) % 26 + 65);
      if (/[a-z]/.test(char)) return String.fromCharCode((char.charCodeAt(0) - 97 + shift) % 26 + 97);
      return char;
    }).join('');
  }

  // ── Guess tracker ────────────────────────────────────────────────────────────

  function updateTracker() {
    if (!gameActive) { guessTracker.innerHTML = ''; return; }
    const pips = Array.from({ length: MAX_GUESSES }, (_, i) =>
      `<span class="pip ${i < guessesLeft ? 'pip-on' : 'pip-off'}"></span>`
    ).join('');
    guessTracker.innerHTML = `<span class="tracker-label">Guesses left:</span> ${pips}`;
    guessTracker.className = 'guess-tracker' + (guessesLeft <= 3 ? ' low' : '');
  }

  // ── Guess handling ───────────────────────────────────────────────────────────

  function handleGuess(span) {
    if (!gameActive || guessesLeft <= 0) return;

    const original = span.dataset.original;
    const encrypted = span.dataset.encrypted;
    const userGuess = prompt(`Decrypt this word:\n"${encrypted}"`);
    if (userGuess === null) return; // cancelled

    guessesLeft--;

    if (userGuess.trim().toLowerCase() === original.toLowerCase()) {
      span.textContent = original + ' ';
      span.classList.replace('encrypted', 'solved');
      span.onclick = null;

      // Check if all words solved
      if (document.querySelectorAll('.encrypted').length === 0) {
        guessTracker.innerHTML = '<span class="tracker-win">All words decrypted!</span>';
        gameActive = false;
        return;
      }
    } else {
      span.classList.add('wrong');
      setTimeout(() => span.classList.remove('wrong'), 500);
    }

    updateTracker();

    if (guessesLeft <= 0) {
      document.querySelectorAll('.encrypted').forEach(s => {
        s.textContent = s.dataset.original + ' ';
        s.classList.replace('encrypted', 'revealed');
        s.onclick = null;
      });
      guessTracker.innerHTML = '<span class="tracker-loss">Out of guesses — words revealed.</span>';
      gameActive = false;
    }
  }

  // ── Poem rendering ───────────────────────────────────────────────────────────

  function displayPoem(poem, encryptedWordIndices) {
    poemContainer.innerHTML = '';
    guessesLeft = MAX_GUESSES;
    gameActive  = true;
    updateTracker();

    // Split on real newlines so poem stanzas are preserved
    const lines = poem.split('\n');
    let globalIndex = 0;

    lines.forEach((line, lineIdx) => {
      // Skip blank lines but still add spacing
      if (line.trim() === '') {
        poemContainer.appendChild(document.createElement('br'));
        return;
      }

      const tokens = line.match(/[\w'']+|[.,!?;"]/g) || [];

      tokens.forEach(token => {
        const span = document.createElement('span');

        if (encryptedWordIndices.includes(globalIndex)) {
          const enc = encryptCaesarCipher(token, SHIFT);
          span.textContent     = enc + ' ';
          span.dataset.encrypted = enc;
          span.dataset.original  = token;
          span.classList.add('encrypted');
          span.onclick = () => handleGuess(span);
        } else {
          span.textContent = token + ' ';
        }

        poemContainer.appendChild(span);
        globalIndex++;
      });

      // Line break after each line except the last
      if (lineIdx < lines.length - 1) {
        poemContainer.appendChild(document.createElement('br'));
      }
    });
  }

  // ── Generate ─────────────────────────────────────────────────────────────────

  generateBtn.addEventListener('click', async () => {
    const userInput = wordInput.value.trim();
    if (!userInput) { alert('Please enter a theme.'); return; }
    if (userInput.split(/\s+/).length > 10) { alert('Please enter up to 10 words.'); return; }

    generateBtn.disabled    = true;
    generateBtn.textContent = 'Generating…';
    poemContainer.innerHTML = '';
    guessTracker.innerHTML  = '';

    try {
      const apiBase = (window.location.protocol === 'file:' || window.location.hostname === 'localhost')
        ? 'http://localhost:8080'
        : 'https://poemgenerator-492211.appspot.com';

      const response = await fetch(`${apiBase}/generate-poem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: `Generate a poem about: ${userInput}` }),
      });

      const data = await response.json();
      if (data.poem && data.encryptedWordIndices) {
        displayPoem(data.poem, data.encryptedWordIndices);
      } else {
        alert('Failed to generate poem.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while generating the poem.');
    } finally {
      generateBtn.disabled    = false;
      generateBtn.textContent = 'Generate Poem';
    }
  });
});
