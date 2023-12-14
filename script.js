document.addEventListener('DOMContentLoaded', (event) => {
 
  const wordInput = document.getElementById('word-input');
 
  const generateBtn = document.getElementById('generate-btn');
 
  const poemContainer = document.getElementById('poem-container');

  function validateInput(input) {
      const words = input.split(/\s+/);
      return words.length <= 10 && words.length > 0;
  }

  function decryptCaesarCipher(encryptedWord, shift) {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');
      return encryptedWord
        .split('')
        .map(char => {
          const index = alphabet.indexOf(char);
          if (index === -1) {
            return char;
          }
          const newIndex = (index < alphabet.length / 2)
            ? (index - shift + alphabet.length / 2) % (alphabet.length / 2)
            : (alphabet.length / 2 + index - shift) % (alphabet.length / 2) + alphabet.length / 2;
          return alphabet[newIndex];
        })
        .join('');
  }

  function handleDecryptionAttempt(encryptedSpan, shift) {
      const encryptedWord = encryptedSpan.textContent.trim();
      const originalWord = decryptCaesarCipher(encryptedWord, shift);
      const userGuess = prompt('What is the decrypted word?').trim();

      if (userGuess.toLowerCase() === originalWord.toLowerCase()) {
          encryptedSpan.textContent = originalWord + ' ';
          encryptedSpan.classList.remove('encrypted');
          alert('Correct!');
      } else {
          alert('Not quite, try again.');
      }
  }

  generateBtn.addEventListener('click', async () => {
    let userInput = wordInput.value.trim();
    if (!validateInput(userInput)) {
        alert('Please enter up to 10 words.');
        return;
    }
    
    // Prepend "Generate a poem about:" to the user input
    userInput = `Generate a poem about: ${userInput}`;

      try {
        const response = await fetch('https://cypherpoem.ew.r.appspot.com/generate-poem', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({ input: userInput }),
          });
          const data = await response.json();
          if (data.poem && data.encryptedWordIndices) { // Check if encryptedWordIndices is present
            displayPoem(data.poem, data.encryptedWordIndices);
           } else {
            alert('Failed to generate poem.');
           }
      } catch (error) {
          console.error('Error:', error);
          alert('An error occurred while generating the poem.');
      }
  });

  function displayPoem(poem, encryptedWordIndices) {
    poemContainer.innerHTML = ''; // Clear the previous poem
    const words = poem.match(/[\w'’]+|[.,!?;"]/g) || []; // Match words and punctuation

    words.forEach((word, index) => {
        // Check if the word starts with a capital letter and is not the first word
        if (index !== 0 && word.match(/^[A-Z]/)) {
            poemContainer.appendChild(document.createElement('br'));
        }

        const span = document.createElement('span');
        span.textContent = word + ' ';
        if (encryptedWordIndices.includes(index)) {
            span.classList.add('encrypted');
            span.onclick = function() {
                handleDecryptionAttempt(span, 3);
            };
        }
        poemContainer.appendChild(span);
    });
}


  
  
});

document.addEventListener('DOMContentLoaded', function () {
  var acc = document.getElementsByClassName('accordion-header');
  for (var i = 0; i < acc.length; i++) {
    acc[i].addEventListener('click', function() {
      this.classList.toggle('active');
      var content = this.nextElementSibling;
      if (content.style.display === 'block') {
        content.style.display = 'none';
      } else {
        content.style.display = 'block';
      }
    });
  }
});

