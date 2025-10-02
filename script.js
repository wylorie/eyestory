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
  const btnTheme = document.getElementById('btnTheme');
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

  // Theme toggle
  btnTheme.addEventListener('click', ()=>{
    const isLight = body.classList.toggle('theme--light');
    btnTheme.setAttribute('aria-pressed', String(isLight));
    btnTheme.textContent = isLight ? 'Light Mode' : 'Dark Mode';
  });

  // Words source and grid
  const WORD_BANK = [
    'alien','philosophical','gadget','science','astronomy','nebula','quantum','voyage','time','memory','cosmic','signal','horizon','myth','machine','dream','ocean','forest','ruins','android','empathy','gravity','satellite','orbit','comet','asteroid','lunar','martian','plasma','fractals','entropy','language','echo','whisper','labyrinth','symphony','artifact','chronicle','nocturnal','bioluminescent','equation','paradox','singularity','nanotech','portal','renaissance','utopia','dystopia','serendipity','constellation','aurora','cipher','archive','pilgrim','oracle','monolith','wyrm','phoenix','storm','mirage'
  ];
  let currentWords = [];
  let selectedWords = [];

  function shuffle(array){ for(let i=array.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [array[i],array[j]]=[array[j],array[i]];} return array; }
  function pickWords(count){ return shuffle([...WORD_BANK]).slice(0,count); }

  function renderGrid(){
    wordGrid.innerHTML = '';
    currentWords.forEach(w => {
      const tile = document.createElement('button');
      tile.className = 'word-tile';
      tile.type = 'button';
      tile.textContent = w;
      tile.setAttribute('role','listitem');
      tile.setAttribute('data-gazeable','true');
      tile.setAttribute('aria-selected','false');
      tile.addEventListener('click', ()=> selectWord(w, tile));
      wordGrid.appendChild(tile);
    });
  }

  function renderSelected(){
    selectedList.innerHTML = '';
    selectedWords.forEach(w => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = w;
      selectedList.appendChild(chip);
    });
    statusSelected.textContent = `${selectedWords.length}/3`;
    btnGenerate.disabled = selectedWords.length !== 3;
  }

  function refreshWords(){
    selectedWords = [];
    currentWords = pickWords(18);
    renderGrid();
    renderSelected();
    storySection.hidden = true;
  }

  function selectWord(word, tile){
    if(selectedWords.includes(word)) return;
    if(selectedWords.length >= 3) return;
    selectedWords.push(word);
    tile.setAttribute('aria-selected','true');
    renderSelected();
  }

  btnRefresh.addEventListener('click', refreshWords);
  refreshWords();

  // Gaze targeting via WebGazer
  let gazeActive = false;
  let currentTarget = null;
  let lastTarget = null;
  let lastHighlightTime = 0;
  const HIGHLIGHT_DWELL_MS = 250; // time to lock highlight after gaze

  async function startGaze(){
    try{
      statusTracking.textContent = 'Starting…';
      await webgazer.setRegression('ridge')
        .setGazeListener(gazeListener)
        .showVideoPreview(false)
        .showPredictionPoints(false)
        .begin();
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

  function gazeListener(data, timestamp){
    if(!data) return;
    const x = data.x; const y = data.y;
    const el = elementAtClient(x,y);
    if(el !== lastTarget){
      clearTargetVisual(lastTarget);
      lastTarget = el;
      lastHighlightTime = performance.now();
    }
    if(el && performance.now() - lastHighlightTime > HIGHLIGHT_DWELL_MS){
      if(currentTarget !== el){ clearTargetVisual(currentTarget); currentTarget = el; }
      setTargetVisual(currentTarget);
    }
  }

  btnStart.addEventListener('click', ()=>{
    if(!gazeActive){ startGaze(); }
  });

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

  btnGenerate.addEventListener('click', async ()=>{
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
  });

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


