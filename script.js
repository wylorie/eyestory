// EyeStory main script
// High-level features: animated bg, theme toggle, word grid + refresh,
// gaze targeting (WebGazer), blink detection (MediaPipe FaceMesh),
// blink-to-select and blink-to-click, 30+ sentence story generation,
// text-to-speech playback.

(function(){
  // DOM refs
  const body = document.body;
  const wordGrid = document.getElementById('wordGrid');
  const selectedList = document.getElementById('selectedList');
  const statusTracking = document.getElementById('statusTracking');
  const statusBlink = document.getElementById('statusBlink');
  const statusSelected = document.getElementById('statusSelected');
  const overlay = document.getElementById('overlay');
  const storySection = document.getElementById('storySection');
  const storyTextEl = document.getElementById('storyText');

  const btnStart = document.getElementById('btnStart');
  const btnRefresh = document.getElementById('btnRefresh');
  const btnGenerate = document.getElementById('btnGenerate');
  const btnPlay = document.getElementById('btnPlay');
  const btnPause = document.getElementById('btnPause');
  const btnStop = document.getElementById('btnStop');

  // Animated background (simple moving particles)
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  function resizeCanvas(){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  function createParticles(){
    const count = Math.min(120, Math.floor((canvas.width*canvas.height)/30000));
    particles = Array.from({length: count}, () => ({
      x: Math.random()*canvas.width,
      y: Math.random()*canvas.height,
      vx: (Math.random()*0.6-0.3),
      vy: (Math.random()*0.6-0.3),
      r: Math.random()*1.8+0.4,
      alpha: Math.random()*0.6+0.2
    }));
  }
  createParticles();
  function tickBg(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#0d1430';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.globalCompositeOperation = 'lighter';
    for(const p of particles){
      p.x += p.vx; p.y += p.vy;
      if(p.x<0||p.x>canvas.width) p.vx*=-1;
      if(p.y<0||p.y>canvas.height) p.vy*=-1;
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle = `rgba(110,168,255,${p.alpha})`;
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(tickBg);
  }
  requestAnimationFrame(tickBg);

  // Theme: fixed to dark mode

  // Words source and grid
  const WORD_BANK = [
    'alien','philosophical','gadget','science','astronomy','nebula','quantum','voyage','time','memory','cosmic','signal','horizon','myth','machine','dream','ocean','forest','ruins','android','empathy','gravity','satellite','orbit','comet','asteroid','lunar','martian','plasma','fractals','entropy','language','echo','whisper','labyrinth','symphony','artifact','chronicle','nocturnal','bioluminescent','equation','paradox','singularity','nanotech','portal','renaissance','utopia','dystopia','serendipity','constellation','aurora','cipher','archive','pilgrim','oracle','monolith','wyrm','phoenix','storm','mirage'
  ];
  let currentWords = [];
  let selectedWords = [];

  // Lock mechanism state
  let lockedElement = null;
  let lockTimer = null;
  let lockStartTime = 0;
  const LOCK_DURATION_MS = 3000; // 3 seconds

  function shuffle(array){ for(let i=array.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [array[i],array[j]]=[array[j],array[i]];} return array; }
  function pickWords(count){ return shuffle([...WORD_BANK]).slice(0,count); }

  function renderGrid(){
    if (!wordGrid) {
      console.error('wordGrid element not found!');
      return;
    }
    wordGrid.innerHTML = '';
    console.log('Rendering', currentWords.length, 'words');
    
    currentWords.forEach(w => {
      const tile = document.createElement('button');
      tile.className = 'word-tile';
      tile.type = 'button';
      tile.textContent = w;
      tile.setAttribute('role','listitem');
      tile.setAttribute('data-gazeable','true');
      tile.setAttribute('aria-selected','false');
      tile.addEventListener('click', ()=> {
        console.log('Word clicked:', w);
        selectWord(w, tile);
      });
      wordGrid.appendChild(tile);
    });
    
    // Append inline refresh tile at the end of the grid
    const refreshTile = document.createElement('button');
    refreshTile.id = 'wordRefreshTile';
    refreshTile.className = 'word-tile';
    refreshTile.type = 'button';
    refreshTile.textContent = 'New Words';
    refreshTile.setAttribute('role','listitem');
    refreshTile.setAttribute('data-gazeable','true');
    refreshTile.addEventListener('click', refreshWords);
    wordGrid.appendChild(refreshTile);
  }

  // Delegate clicks to refresh tile to survive re-renders
  wordGrid.addEventListener('click', (ev)=>{
    const target = ev.target && (ev.target.closest ? ev.target.closest('#wordRefreshTile') : null);
    if(target){
      ev.preventDefault();
      refreshWords();
    }
  });

  function renderSelected(){
    selectedList.innerHTML = '';
    selectedWords.forEach(w => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = w;
      selectedList.appendChild(chip);
    });
    statusSelected.textContent = `${selectedWords.length}/3`;
    
    // Auto-generate story when 3 words are selected
    if(selectedWords.length === 3){
      console.log('Auto-generating story with words:', selectedWords);
      generateStory();
    }
  }

  function refreshWords(){
    // Clear any active locks and dwell when refreshing
    clearLock();
    clearDwell();
    selectedWords = [];
    currentWords = pickWords(18);
    console.log('Generated words:', currentWords); // Debug log
    renderGrid();
    renderSelected();
    storySection.hidden = true;
  }

  // Lock mechanism helper functions
  function clearLock(){
    if(lockedElement){
      lockedElement.removeAttribute('data-locked');
      lockedElement.removeAttribute('data-lock-progress');
      lockedElement = null;
    }
    if(lockTimer){
      clearTimeout(lockTimer);
      lockTimer = null;
    }
  }

  function startLock(element, word){
    // Clear any existing lock
    clearLock();
    
    // Set new lock
    lockedElement = element;
    lockStartTime = performance.now();
    element.setAttribute('data-locked', 'true');
    element.setAttribute('data-lock-progress', '100');
    
    // Start countdown animation
    const updateCountdown = () => {
      if(!lockedElement) return;
      
      const elapsed = performance.now() - lockStartTime;
      const remaining = Math.max(0, LOCK_DURATION_MS - elapsed);
      const progress = Math.round((remaining / LOCK_DURATION_MS) * 100);
      
      lockedElement.setAttribute('data-lock-progress', progress.toString());
      lockedElement.style.setProperty('--lock-progress', progress.toString());
      
      if(remaining > 0){
        requestAnimationFrame(updateCountdown);
      }
    };
    updateCountdown();
    
    // Set timer to unlock after 3 seconds
    lockTimer = setTimeout(() => {
      if(lockedElement){
        // Actually select the word after the lock period
        if(!selectedWords.includes(word) && selectedWords.length < 3){
          selectedWords.push(word);
          lockedElement.setAttribute('aria-selected','true');
          console.log('Selected words:', selectedWords.length, selectedWords);
          renderSelected();
        }
        clearLock();
      }
    }, LOCK_DURATION_MS);
  }

  function selectWord(word, tile){
    // If there's already a lock active, ignore new selections
    if(lockedElement) return;
    
    // If word is already selected, ignore
    if(selectedWords.includes(word)) return;
    
    // If we already have 3 words, ignore
    if(selectedWords.length >= 3) return;
    
    // Start the 3-second lock instead of immediate selection
    startLock(tile, word);
  }

  btnRefresh.addEventListener('click', refreshWords);
  
  // Ensure words are loaded on page load
  window.addEventListener('load', () => {
    if (currentWords.length === 0) {
      console.log('No words found, generating...');
      refreshWords();
    }
  });
  
  refreshWords();

  // Gaze targeting via WebGazer
  let gazeActive = false;
  let currentTarget = null;
  let lastTarget = null;
  let lastHighlightTime = 0;
  const HIGHLIGHT_DWELL_MS = 250; // time to lock highlight after gaze

  // Dwell delay mechanism
  let dwellTarget = null;
  let dwellStartTime = 0;
  let dwellTimer = null;
  const DWELL_DELAY_MS = 3000; // 3 seconds dwell delay
  const DWELL_DISTANCE_PX = 50; // 50px proximity threshold

  async function startGaze(){
    try{
      statusTracking.textContent = 'Starting…';
      await webgazer.setRegression('ridge')
        .setGazeListener(gazeListener)
        .showVideoPreview(false)
        .showPredictionPoints(true)
        .begin();
      
      // Constrain prediction points to word grid area only
      const rect = wordGrid.getBoundingClientRect();
      webgazer.setPredictionPointsFilter((x, y) => {
        // Only show red dot within the word grid bounds
        return x >= rect.left && x <= rect.right && 
               y >= rect.top && y <= rect.bottom;
      });
      
      // Also hide prediction points outside the grid
      webgazer.showPredictionPoints(true);
      webgazer.setPredictionPointsFilter((x, y) => {
        const gridRect = wordGrid.getBoundingClientRect();
        return x >= gridRect.left && x <= gridRect.right && 
               y >= gridRect.top && y <= gridRect.bottom;
      });
      
      gazeActive = true;
      statusTracking.textContent = 'Active';
    }catch(err){
      console.error(err);
      statusTracking.textContent = 'Error';
    }
  }

  function elementAtClient(x,y){
    // Prefer gazeable elements
    const el = document.elementFromPoint(x,y);
    if(!el) return null;
    return el.closest('[data-gazeable="true"], .word-tile');
  }

  function clearTargetVisual(el){ if(!el) return; el.removeAttribute('data-targeted'); }
  function setTargetVisual(el){ if(!el) return; el.setAttribute('data-targeted','true'); }

  // Dwell delay helper functions
  function clearDwell(){
    if(dwellTarget){
      dwellTarget.removeAttribute('data-dwelling');
      dwellTarget.removeAttribute('data-dwell-progress');
      dwellTarget.style.removeProperty('--dwell-progress');
    }
    if(dwellTimer){
      clearTimeout(dwellTimer);
      dwellTimer = null;
    }
    dwellTarget = null;
  }

  function startDwell(element){
    // Clear any existing dwell
    clearDwell();
    
    // Set new dwell target
    dwellTarget = element;
    dwellStartTime = performance.now();
    element.setAttribute('data-dwelling', 'true');
    element.setAttribute('data-dwell-progress', '0');
    element.style.setProperty('--dwell-progress', '0');
    
    // Start dwell progress animation
    const updateDwellProgress = () => {
      if(!dwellTarget) return;
      
      const elapsed = performance.now() - dwellStartTime;
      const progress = Math.min(100, Math.round((elapsed / DWELL_DELAY_MS) * 100));
      
      dwellTarget.setAttribute('data-dwell-progress', progress.toString());
      dwellTarget.style.setProperty('--dwell-progress', progress.toString());
      
      if(elapsed < DWELL_DELAY_MS){
        requestAnimationFrame(updateDwellProgress);
      }
    };
    updateDwellProgress();
    
    // Set timer to activate after dwell delay
    dwellTimer = setTimeout(() => {
      if(dwellTarget){
        // Activate the element (highlight it)
        if(currentTarget !== dwellTarget){ 
          clearTargetVisual(currentTarget); 
          currentTarget = dwellTarget; 
        }
        setTargetVisual(currentTarget);
        clearDwell();
      }
    }, DWELL_DELAY_MS);
  }

  function getDistanceToElement(x, y, element){
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
  }

  function findNearestGazeableElement(x, y){
    const gazeableElements = document.querySelectorAll('[data-gazeable="true"], .word-tile');
    let nearestElement = null;
    let nearestDistance = Infinity;
    
    gazeableElements.forEach(el => {
      const distance = getDistanceToElement(x, y, el);
      if(distance < nearestDistance && distance <= DWELL_DISTANCE_PX){
        nearestDistance = distance;
        nearestElement = el;
      }
    });
    
    return nearestElement;
  }

  function gazeListener(data, timestamp){
    if(!data) return;
    const x = data.x; const y = data.y;
    
    // Only process gaze if it's within word grid bounds
    const rect = wordGrid.getBoundingClientRect();
    if(x < rect.left || x > rect.right || y < rect.top || y > rect.bottom){
      // Clear any active dwell when outside the grid
      clearDwell();
      return;
    }
    
    // Find the nearest gazeable element within dwell distance
    const nearestElement = findNearestGazeableElement(x, y);
    
    if(nearestElement){
      // If we found a nearby element and it's not already being dwelled on
      if(dwellTarget !== nearestElement){
        // Clear any existing dwell
        clearDwell();
        // Start dwelling on the new element
        startDwell(nearestElement);
      }
    } else {
      // No nearby element, clear any active dwell
      clearDwell();
    }
  }

  btnStart.addEventListener('click', ()=>{
    if(!gazeActive){ startGaze(); }
  });

  // Auto-start WebGazer when page is ready and secure
  function tryAutoStartGaze(){
    const secure = window.isSecureContext === true;
    if(!secure){
      statusTracking.textContent = 'Use HTTPS to start';
      return;
    }
    if(typeof window.webgazer === 'undefined'){
      // Library not yet ready; retry shortly
      setTimeout(tryAutoStartGaze, 400);
      return;
    }
    if(!gazeActive){
      startGaze();
    }
  }
  window.addEventListener('load', tryAutoStartGaze);

  // Blink detection via MediaPipe FaceMesh
  // Compute simple eye aspect ratio using key landmark pairs
  let faceMesh; let camera; let blinkState = {closed:false,lastChange:0};
  const BLINK_THRESHOLD = 0.24; // tuned heuristic
  const BLINK_MIN_DURATION_MS = 60;
  const BLINK_DEBOUNCE_MS = 220;

  function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }
  function eyeOpenRatio(landmarks, ids){
    // ids: [topIdx, bottomIdx, leftIdx, rightIdx]
    const top = landmarks[ids[0]]; const bottom = landmarks[ids[1]];
    const left = landmarks[ids[2]]; const right = landmarks[ids[3]];
    const vert = dist(top,bottom);
    const horiz = dist(left,right)+1e-6;
    return vert / horiz;
  }

  function handleBlink(){
    // On blink, either select targeted word or press targeted button
    if(currentTarget){
      currentTarget.click();
    }
  }

  function onResults(results){
    const now = performance.now();
    if(results.multiFaceLandmarks && results.multiFaceLandmarks.length){
      const ls = results.multiFaceLandmarks[0];
      // Use MediaPipe indices: approximate eyelid and corners
      // Left eye (from camera view): 386 top, 374 bottom, 263 right, 362 left
      // Right eye: 159 top, 145 bottom, 33 left, 133 right
      const leftRatio = eyeOpenRatio(ls, [386,374,362,263]);
      const rightRatio = eyeOpenRatio(ls, [159,145,33,133]);
      const ratio = (leftRatio + rightRatio)/2;

      if(ratio < BLINK_THRESHOLD){
        if(!blinkState.closed){
          blinkState.closed = true; blinkState.lastChange = now;
        }
      } else {
        if(blinkState.closed){
          const duration = now - blinkState.lastChange;
          blinkState.closed = false; blinkState.lastChange = now;
          if(duration >= BLINK_MIN_DURATION_MS){
            // Debounce
            if(!onResults._lastBlink || now - onResults._lastBlink > BLINK_DEBOUNCE_MS){
              onResults._lastBlink = now;
              statusBlink.textContent = 'Blink';
              handleBlink();
              setTimeout(()=> statusBlink.textContent = 'Ready', 350);
            }
          }
        }
      }
    }
  }

  async function startBlinkDetection(){
    try{
      statusBlink.textContent = 'Starting…';
      faceMesh = new FaceMesh({locateFile: (file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      faceMesh.onResults(onResults);
      const videoEl = document.createElement('video');
      videoEl.style.display = 'none';
      document.body.appendChild(videoEl);
      camera = new Camera(videoEl, {
        onFrame: async () => { await faceMesh.send({image: videoEl}); },
        width: 640, height: 360
      });
      await camera.start();
      statusBlink.textContent = 'Ready';
      // Auto-start gaze tracking once the camera pipeline is ready
      if(!gazeActive){
        startGaze();
      }
    }catch(err){
      console.error(err);
      statusBlink.textContent = 'Error';
    }
  }

  // Start blink detection immediately (camera permission requested on first run)
  startBlinkDetection();

  // Generate a 30+ sentence story from 3 words
  function generateLongStory(keywords){
    const [a,b,c] = keywords;
    const sentences = [];
    const themes = [
      `Under a sky of patient stars, the tale of ${a}, ${b}, and ${c} begins.`,
      `Every small detail carried a question, and every answer shaped a new question in return.`,
      `People spoke quietly about patterns that repeated like tides, yet never quite the same.`,
      `A stray signal threaded the night like a silver needle through dark cloth.`,
      `There was music in the machinery, a pulse older than maps, younger than memory.`,
      `The first step forward felt ordinary, which is how most miracles begin.`,
      `When the wind shifted, it carried the taste of iron and the hint of rain.`,
      `The horizon, once flat and distant, now tilted like a question mark.`,
      `Someone whispered, but no mouth moved; the room simply decided to speak.`,
      `Light behaved like a thoughtful animal, cautious, curious, and unafraid.`,
      `Numbers arranged themselves into soft constellations that could be read like braille.`,
      `Maps trembled, boundaries softened, and the world made room for one more shape.`,
      `The ${a} they sought was not a thing, but a way of noticing.`,
      `Instruments blinked with quiet patience, like lighthouses turned inward.`,
      `Lessons arrived disguised as detours, yet no time was wasted.`,
      `A door opened in the usual place, which is what made it unusual.`,
      `Even silence had a pressure, a texture, a gravity of its own.`,
      `Threads of cause and effect braided themselves into something you could almost hold.`,
      `The city listened; the night agreed; the road welcomed the second step.`,
      `They carried ${b} like a lens, and the world became sharper and kinder.`,
      `It was not certainty they needed, but the courage to keep asking.`,
      `Time unspooled like ribbon, and distance folded into a careful pocket.`,
      `The ${c} waited like a polite guest, present, attentive, and inevitable.`,
      `A small kindness altered the orbit of a larger fate.`,
      `The storm said what storms always say: begin again, begin again.`,
      `What could not be translated could still be understood.`,
      `The engine of wonder turned, quietly refusing to rust.`,
      `They learned to read shadows as if they were footnotes in the dark.`,
      `Luck arrived wearing the clothes of preparation, and they invited it in.`,
      `They realized home was not a place, but the direction you face while moving.`,
      `Even endings are doors with handles on both sides.`,
      `So they kept walking, letting ${a}, ${b}, and ${c} hold the compass steady.`,
      `And if the sky had eyes, it would have watched them with a smile.`,
      `Somewhere a child fell asleep to the hum of a different tomorrow.`,
      `And the story, which had learned their names, promised to remember.`
    ];
    sentences.push(...themes);
    return sentences.join(' ');
  }

  async function generateStory(){
    if(selectedWords.length !== 3) return;
    overlay.hidden = false;
    try{
      const story = generateLongStory(selectedWords);
      storyTextEl.textContent = story;
      storySection.hidden = false;
      // Scroll into view
      storySection.scrollIntoView({behavior:'smooth'});
    } finally {
      overlay.hidden = true;
    }
  }

  // Text-to-Speech
  let utterance = null;
  function playStory(){
    const text = storyTextEl.textContent || '';
    if(!text) return;
    if(utterance){ window.speechSynthesis.cancel(); utterance = null; }
    utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  }
  function pauseStory(){ window.speechSynthesis.pause(); }
  function stopStory(){ window.speechSynthesis.cancel(); utterance=null; }
  btnPlay.addEventListener('click', playStory);
  btnPause.addEventListener('click', pauseStory);
  btnStop.addEventListener('click', stopStory);

  // Blink-press all buttons and tiles: handled via handleBlink() calling click() on targeted element
  // Ensure buttons have data-gazeable attribute in HTML (already set).

})();



