/**
 * 3D Escape Room Board Game Engine - Absolute GitHub Compatibility Edition
 * Core Modules: ThreeJS Animated Sprite Engine, Canvas Tile Painter, Image Link Plane Builder, UI Interaction Fix
 */

let boardConfig = { size: 100, snakesCount: 6, laddersCount: 6, syncQuestions: true };
let globalQuestionBank = [];
let matrixMap = { snakes: {}, ladders: {}, cellPositions: {} };

const initialSampleQuestions = [
    { id: "s1", type: "spelling", question: "Spell the item used to unlock locked doors:", choices: [], answer: "KEY", media: "" },
    { id: "s2", type: "complete-sentence", question: "Complete the ancient escape room incantation:", choices: ["OPEN", "THE", "PORTAL", "NOW"], answer: "OPEN THE PORTAL NOW", media: "" },
    { id: "s3", type: "multiple-choice", question: "Which magical item reveals cloaked floor traps?", choices: ["Amulet of Vision", "Rusty Shield", "Iron Boots", "Empty Flask"], answer: "Amulet of Vision", media: "" }
];

// --- MODULE 1: NATIVE STREAMING AUDIO SYSTEM ---
class AudioSystem {
    constructor() {
        this.ctx = null;
        this.audioElement = null;
        this.isMuted = true;
    }

    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.audioElement = document.getElementById("native-bg-audio");
            this.isMuted = false;
            
            const toggleBtn = document.getElementById("audio-toggle-btn");
            if (toggleBtn) toggleBtn.innerText = "🎵 Music: ON";
            
            if (this.audioElement) {
                this.audioElement.play().catch(err => console.log("Audio waiting for user gesture context.", err));
            }
        } catch(e) { console.log("AudioContext integration restricted."); }
    }

    toggleMusic() {
        if (!this.ctx) { this.init(); return; }
        if (this.isMuted) {
            this.isMuted = false;
            const toggleBtn = document.getElementById("audio-toggle-btn");
            if (toggleBtn) toggleBtn.innerText = "🎵 Music: ON";
            if(this.audioElement) this.audioElement.play();
        } else {
            this.isMuted = true;
            const toggleBtn = document.getElementById("audio-toggle-btn");
            if (toggleBtn) toggleBtn.innerText = "🎵 Music: OFF";
            if(this.audioElement) this.audioElement.pause();
        }
    }

    setVolume(val) {
        if(this.audioElement) {
            this.audioElement.volume = parseFloat(val);
        }
    }

    playTone(freq, type, duration) {
        if (this.isMuted || !this.ctx) return;
        try {
            let osc = this.ctx.createOscillator();
            let gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
            osc.stop(this.ctx.currentTime + duration);
        } catch(e) {}
    }

    playDice() { this.playTone(280, 'triangle', 0.25); }
    playCorrect() { this.playTone(587.33, 'sine', 0.15); setTimeout(() => this.playTone(880, 'sine', 0.3), 120); }
    playWrong() { this.playTone(180, 'sawtooth', 0.4); }
    playLadder() { this.playTone(600, 'sine', 0.5); }
    playSnake() { this.playTone(120, 'sawtooth', 0.6); }
    playClick() { this.playTone(400, 'sine', 0.05); }
}
const audioSystem = new AudioSystem();


// --- MODULE 2: THREE.JS ENVIRONMENTAL GENERATOR ---
class ThreeEngine {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.tokens = {};
        this.textures = {};
    }

    init() {
        const container = document.getElementById("canvas-3d-container");
        if (!container) return;
        container.innerHTML = ""; 
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0c16);
        this.scene.fog = new THREE.FogExp2(0x0a0c16, 0.015);

        this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1000);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        container.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(10, 40, 10);
        this.scene.add(directionalLight);

        const texLoader = new THREE.TextureLoader();
        this.textures.cyclone = texLoader.load('./cyclone.gif');
        this.textures.fire = texLoader.load('./fire.gif');

        this.buildBoardGeometry();
        this.generateAssetTokens();
        
        this.camera.position.set(0, 38, 30);
        this.camera.lookAt(0, -2, -2);

        window.addEventListener('resize', () => this.onWindowResize());
        this.animate();
    }

    createTileTexture(number, isEven) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        const colors = ['#2b5c8f', '#d9534f', '#f0ad4e', '#5cb85c', '#5bc0de'];
        const selectColor = colors[number % colors.length];

        ctx.fillStyle = selectColor;
        ctx.fillRect(0, 0, 128, 128);

        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 6;
        ctx.strokeRect(4, 4, 120, 120);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 44px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
        ctx.shadowBlur = 4;
        ctx.fillText(number, 64, 64);

        return new THREE.CanvasTexture(canvas);
    }

    buildBoardGeometry() {
        const totalCells = boardConfig.size;
        const columns = 10;
        const rows = Math.ceil(totalCells / columns);
        const cellSize = 4.4; 
        
        const originX = -((columns * cellSize) / 2) + (cellSize / 2);
        const originZ = ((rows * cellSize) / 2) - (cellSize / 2);

        matrixMap.cellPositions = {};

        for (let i = 1; i <= totalCells; i++) {
            let currentGridRow = Math.floor((i - 1) / columns);
            let currentGridCol = (i - 1) % columns;
            
            if (currentGridRow % 2 !== 0) {
                currentGridCol = (columns - 1) - currentGridCol;
            }

            const posX = originX + (currentGridCol * cellSize);
            const posZ = originZ - (currentGridRow * cellSize);

            matrixMap.cellPositions[i] = new THREE.Vector3(posX, 0, posZ);

            const tileGeometry = new THREE.BoxGeometry(4.1, 0.5, 4.1);
            const isEven = (currentGridRow + currentGridCol) % 2 === 0;
            
            const tileMaterial = new THREE.MeshStandardMaterial({
                map: this.createTileTexture(i, isEven),
                roughness: 0.3,
                metalness: 0.2
            });

            const tileMesh = new THREE.Mesh(tileGeometry, tileMaterial);
            tileMesh.position.set(posX, 0, posZ);
            this.scene.add(tileMesh);
        }

        // --- HIGH-COMPATIBILITY RELATIVE ROUTING ASSETS ---
        const texLoader = new THREE.TextureLoader();

        const ladderTexture = texLoader.load('./{BBE095B2-BA0B-42A0-AB30-DBDCA43A69C5}.png', () => {
            ladderTexture.needsUpdate = true;
            if(this.renderer) this.renderer.render(this.scene, this.camera);
        });

        const snakeTexture = texLoader.load('./{EC4FEE0A-6A94-4B3E-ABC7-BFA1DDB24BD5}.jpg', () => {
            snakeTexture.needsUpdate = true;
            if(this.renderer) this.renderer.render(this.scene, this.camera);
        });

        ladderTexture.wrapS = THREE.RepeatWrapping;
        ladderTexture.wrapT = THREE.RepeatWrapping;
        snakeTexture.wrapS = THREE.RepeatWrapping;
        snakeTexture.wrapT = THREE.RepeatWrapping;

        Object.keys(matrixMap.ladders).forEach(start => {
            this.drawImageLinkPlane(matrixMap.cellPositions[start], matrixMap.cellPositions[matrixMap.ladders[start]], ladderTexture, 1.8, 0.35, 0xffd700);
        });
        Object.keys(matrixMap.snakes).forEach(start => {
            this.drawImageLinkPlane(matrixMap.cellPositions[start], matrixMap.cellPositions[matrixMap.snakes[start]], snakeTexture, 2.2, 0.45, 0xff3333);
        });
    }

    drawImageLinkPlane(startPos, endPos, texture, planeWidth, verticalOffset, fallbackColor) {
        if (!startPos || !endPos) return;

        const distance = startPos.distanceTo(endPos);
        const planeGeo = new THREE.PlaneGeometry(planeWidth, distance);
        
        const planeMat = new THREE.MeshStandardMaterial({
            map: texture,
            color: 0xffffff,
            transparent: true,
            alphaTest: 0.05,
            side: THREE.DoubleSide
        });

        try {
            const clonedTex = texture.clone();
            clonedTex.repeat.set(1, Math.max(1, Math.floor(distance / 4)));
            clonedTex.needsUpdate = true;
            planeMat.map = clonedTex;
        } catch(e) {
            planeMat.color.setHex(fallbackColor);
        }

        const mesh = new THREE.Mesh(planeGeo, planeMat);
        const midPoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
        mesh.position.copy(midPoint);
        mesh.position.y += verticalOffset;

        const dx = endPos.x - startPos.x;
        const dz = endPos.z - startPos.z;
        const angleY = Math.atan2(dx, dz);

        mesh.rotation.set(-Math.PI / 2, 0, angleY + Math.PI);
        this.scene.add(mesh);
    }

    generateAssetTokens() {
        const matA = new THREE.SpriteMaterial({ map: this.textures.cyclone, transparent: true });
        this.tokens.t1 = new THREE.Sprite(matA);
        this.tokens.t1.scale.set(3.2, 3.2, 1.0);
        this.scene.add(this.tokens.t1);

        const matB = new THREE.SpriteMaterial({ map: this.textures.fire, transparent: true });
        this.tokens.t2 = new THREE.Sprite(matB);
        this.tokens.t2.scale.set(3.2, 3.2, 1.0);
        this.scene.add(this.tokens.t2);

        this.snapTokensToGridImmediate();
    }

    snapTokensToGridImmediate() {
        const p1 = gameEngine.teams.t1.position;
        const p2 = gameEngine.teams.t2.position;
        
        if(matrixMap.cellPositions[p1]) {
            this.tokens.t1.position.copy(matrixMap.cellPositions[p1]).add(new THREE.Vector3(-1.0, 1.6, 0));
        }
        if(matrixMap.cellPositions[p2]) {
            this.tokens.t2.position.copy(matrixMap.cellPositions[p2]).add(new THREE.Vector3(1.0, 1.6, 0));
        }
    }

    animateTokenMovement(teamId, targetCellId, completeCallback) {
        const targetPos = matrixMap.cellPositions[targetCellId].clone();
        if (teamId === 't1') targetPos.add(new THREE.Vector3(-1.0, 1.6, 0));
        else targetPos.add(new THREE.Vector3(1.0, 1.6, 0));

        const spriteMesh = this.tokens[teamId];
        let duration = 800; 
        let startTime = performance.now();
        let startPos = spriteMesh.position.clone();

        function step(now) {
            let progress = (now - startTime) / duration;
            if (progress > 1) progress = 1;

            spriteMesh.position.lerpVectors(startPos, targetPos, progress);
            spriteMesh.position.y += Math.sin(progress * Math.PI) * 2.5; 

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                spriteMesh.position.copy(targetPos);
                if(completeCallback) completeCallback();
            }
        }
        requestAnimationFrame(step);
    }

    onWindowResize() {
        const container = document.getElementById("canvas-3d-container");
        if(!container || !this.renderer) return;
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
}
const threeEngine = new ThreeEngine();


// --- MODULE 3: STATE MATRIX CONTROLLER & PIPELINES ---
class GameEngine {
    constructor() {
        this.teams = {
            t1: { id: 't1', title: 'Team A (Cyclone)', position: 1, state: 'QUESTION', activeQuestion: null, currentDice: 1, currentAccumulator: [] },
            t2: { id: 't2', title: 'Team B (Fire)', position: 1, state: 'QUESTION', activeQuestion: null, currentDice: 1, currentAccumulator: [] }
        };
    }

    startQuickGame() {
        globalQuestionBank = [...initialSampleQuestions];
        this.initiateGameFromSettings();
    }

    initiateGameFromSettings() {
        audioSystem.init();
        
        const szEl = document.getElementById("setting-board-size");
        const snEl = document.getElementById("setting-snakes");
        const ldEl = document.getElementById("setting-ladders");
        const syEl = document.getElementById("setting-sync-questions");

        boardConfig.size = szEl ? parseInt(szEl.value) : 100;
        boardConfig.snakesCount = snEl ? parseInt(snEl.value) : 6;
        boardConfig.laddersCount = ldEl ? parseInt(ldEl.value) : 6;
        boardConfig.syncQuestions = syEl ? syEl.checked : true;

        if(globalQuestionBank.length === 0) {
            globalQuestionBank = [...initialSampleQuestions];
        }

        this.buildSnakesAndLaddersMap();
        
        this.teams.t1.position = 1;
        this.teams.t2.position = 1;
        this.teams.t1.state = 'QUESTION';
        this.teams.t2.state = 'QUESTION';

        ui.hidePanel('intro-screen');
        ui.hidePanel('settings-panel');
        ui.showPanel('gameplay-hud');

        threeEngine.init();
        
        this.deployNextQuestion('t1');
        if (boardConfig.syncQuestions) {
            this.teams.t2.activeQuestion = this.teams.t1.activeQuestion;
            this.renderTeamHUD('t2');
        } else {
            this.deployNextQuestion('t2');
        }
    }

    buildSnakesAndLaddersMap() {
        matrixMap.snakes = {};
        matrixMap.ladders = {};
        const maxCells = boardConfig.size;
        const isVacant = (idx) => (!matrixMap.snakes[idx] && !matrixMap.ladders[idx] && idx !== 1 && idx !== maxCells);

        let genLadders = 0;
        while(genLadders < boardConfig.laddersCount) {
            let start = Math.floor(Math.random() * (maxCells - 15)) + 2;
            let end = start + Math.floor(Math.random() * 12) + 5;
            if(end < maxCells && isVacant(start) && isVacant(end)) {
                matrixMap.ladders[start] = end;
                genLadders++;
            }
        }

        let genSnakes = 0;
        while(genSnakes < boardConfig.snakesCount) {
            let start = Math.floor(Math.random() * (maxCells - 5)) + 10;
            let end = start - (Math.floor(Math.random() * 12) + 5);
            if(end > 1 && isVacant(start) && isVacant(end)) {
                matrixMap.snakes[start] = end;
                genSnakes++;
            }
        }
    }

    deployNextQuestion(teamId) {
        if(globalQuestionBank.length === 0) globalQuestionBank = [...initialSampleQuestions];
        const rIdx = Math.floor(Math.random() * globalQuestionBank.length);
        this.teams[teamId].activeQuestion = globalQuestionBank[rIdx];
        this.teams[teamId].state = 'QUESTION';
        this.teams[teamId].currentAccumulator = [];
        this.renderTeamHUD(teamId);
    }

    renderTeamHUD(teamId) {
        const team = this.teams[teamId];
        const container = document.getElementById(`${teamId}-interaction-box`);
        if(!container) return;
        
        const posHud = document.getElementById(`${teamId}-position-hud`);
        if(posHud) posHud.innerText = team.position;
        container.innerHTML = "";

        if (team.state === 'QUESTION') {
            const q = team.activeQuestion;
            if(!q) return;
            
            const textEl = document.createElement("div");
            textEl.className = "hud-question-text";
            textEl.innerText = q.question;
            container.appendChild(textEl);

            if (q.media) {
                const imgEl = document.createElement("img");
                imgEl.className = "hud-question-media";
                imgEl.src = q.media;
                container.appendChild(imgEl);
            }

            if (q.type === 'spelling') {
                const accum = document.createElement("div");
                accum.className = "spelling-accumulator";
                accum.innerText = team.currentAccumulator.join("");
                container.appendChild(accum);

                const pool = document.createElement("div");
                pool.className = "interactive-sequence-pool";
                let letters = q.answer.split("");
                while(letters.length < 8) { letters.push(String.fromCharCode(65 + Math.floor(Math.random()*26))); }
                letters.sort(() => Math.random() - 0.5);

                letters.forEach(l => {
                    const btn = document.createElement("button");
                    btn.className = "circle-btn";
                    btn.innerText = l;
                    btn.onclick = () => { audioSystem.playClick(); team.currentAccumulator.push(l); accum.innerText = team.currentAccumulator.join(""); };
                    pool.appendChild(btn);
                });
                container.appendChild(pool);
                this.addVerificationControls(container, teamId);

            } else if (q.type === 'complete-sentence') {
                const accum = document.createElement("div");
                accum.className = "spelling-accumulator";
                accum.innerText = team.currentAccumulator.join(" ");
                container.appendChild(accum);

                const pool = document.createElement("div");
                pool.className = "interactive-sequence-pool";
                let words = [...q.choices];
                if(words.length === 0) words = q.answer.split(" ");
                words.sort(() => Math.random() - 0.5);

                words.forEach(w => {
                    const btn = document.createElement("button");
                    btn.className = "word-pill-btn";
                    btn.innerText = w;
                    btn.onclick = () => { audioSystem.playClick(); team.currentAccumulator.push(w); accum.innerText = team.currentAccumulator.join(" "); };
                    pool.appendChild(btn);
                });
                container.appendChild(pool);
                this.addVerificationControls(container, teamId);

            } else if (q.type === 'multiple-choice') {
                const mcqWrap = document.createElement("div");
                mcqWrap.className = "mcq-container";

                let choices = [...q.choices];
                if(!choices.includes(q.answer)) choices.push(q.answer);
                if(!q.hasShuffledChoices) { choices.sort(() => Math.random() - 0.5); q.choices = choices; q.hasShuffledChoices = true; }

                choices.forEach(choice => {
                    const opt = document.createElement("div");
                    opt.className = "mcq-card-option";
                    if(team.currentAccumulator[0] === choice) opt.className += " selected";
                    
                    if(choice.startsWith("data:image")) {
                        const img = document.createElement("img"); img.src = choice; opt.appendChild(img);
                    } else {
                        const txt = document.createElement("span"); txt.innerText = choice; opt.appendChild(txt);
                    }
                    
                    opt.onclick = () => { audioSystem.playClick(); team.currentAccumulator = [choice]; this.renderTeamHUD(teamId); };
                    mcqWrap.appendChild(opt);
                });
                container.appendChild(mcqWrap);
                this.addVerificationControls(container, teamId);
            }

        } else if (team.state === 'DICE') {
            const diceWrap = document.createElement("div");
            diceWrap.className = "dice-container-hud";
            
            const diceCube = document.createElement("div");
            diceCube.id = `${teamId}-dice-cube`;
            diceCube.className = "visual-dice-cube";
            diceCube.innerText = team.currentDice;
            diceWrap.appendChild(diceCube);

            const rollBtn = document.createElement("button");
            rollBtn.className = "btn execution-btn";
            rollBtn.innerText = "Roll Cosmic Dice";
            rollBtn.onclick = () => this.triggerDiceRollSequence(teamId);
            diceWrap.appendChild(rollBtn);

            container.appendChild(diceWrap);

        } else if (team.state === 'PROCEED') {
            const wrap = document.createElement("div");
            wrap.className = "dice-container-hud";

            const info = document.createElement("p");
            info.innerText = `Dice Result: ${team.currentDice}. Execute travel parameters below.`;
            wrap.appendChild(info);

            const moveBtn = document.createElement("button");
            moveBtn.className = "btn success-btn block-btn";
            moveBtn.innerText = "Execute Move Order";
            moveBtn.onclick = () => this.executeTokenStepSequence(teamId);
            wrap.appendChild(moveBtn);

            container.appendChild(wrap);
        }
    }

    addVerificationControls(container, teamId) {
        const row = document.createElement("div");
        row.className = "button-group";
        row.style.marginTop = "15px";

        const clearBtn = document.createElement("button");
        clearBtn.className = "btn warning-btn";
        clearBtn.innerText = "Clear";
        clearBtn.onclick = () => { audioSystem.playClick(); this.teams[teamId].currentAccumulator = []; this.renderTeamHUD(teamId); };

        const checkBtn = document.createElement("button");
        checkBtn.className = "btn success-btn";
        checkBtn.innerText = "Submit Cast";
        checkBtn.onclick = () => this.verifySubmittedAnswer(teamId);

        row.appendChild(clearBtn);
        row.appendChild(checkBtn);
        container.appendChild(row);
    }

    verifySubmittedAnswer(teamId) {
        const team = this.teams[teamId];
        let compiledUserString = "";

        if (team.activeQuestion.type === 'spelling') compiledUserString = team.currentAccumulator.join("").trim().toUpperCase();
        else if (team.activeQuestion.type === 'complete-sentence') compiledUserString = team.currentAccumulator.join(" ").trim().toUpperCase();
        else compiledUserString = (team.currentAccumulator[0] || "").trim().toUpperCase();

        if (compiledUserString === team.activeQuestion.answer.trim().toUpperCase()) {
            audioSystem.playCorrect();
            team.state = 'DICE';
        } else {
            audioSystem.playWrong();
            alert(`⚠️ Incorrect spell cast. Turn context forfeited!`);
            this.advanceTurnPipeline(teamId);
        }
        this.renderTeamHUD(teamId);
    }

    triggerDiceRollSequence(teamId) {
        audioSystem.playDice();
        const cube = document.getElementById(`${teamId}-dice-cube`);
        if(cube) cube.classList.add("rolling-anim");
        
        let rollCounter = 0;
        let interval = setInterval(() => {
            if(cube) cube.innerText = Math.floor(Math.random() * 6) + 1;
            rollCounter++;
            if (rollCounter > 8) {
                clearInterval(interval);
                if(cube) {
                    cube.classList.remove("rolling-anim");
                    const finalRoll = Math.floor(Math.random() * 6) + 1;
                    this.teams[teamId].currentDice = finalRoll;
                    cube.innerText = finalRoll;
                }
                this.teams[teamId].state = 'PROCEED';
                this.renderTeamHUD(teamId);
            }
        }, 80);
    }

    executeTokenStepSequence(teamId) {
        const team = this.teams[teamId];
        let prospectiveTarget = team.position + team.currentDice;
        const maxCells = boardConfig.size;

        if (prospectiveTarget >= maxCells) {
            team.position = maxCells;
            threeEngine.animateTokenMovement(teamId, maxCells, () => { this.declareAbsoluteVictory(teamId); });
            return;
        }

        threeEngine.animateTokenMovement(teamId, prospectiveTarget, () => {
            team.position = prospectiveTarget;
            
            if (matrixMap.ladders[team.position]) {
                audioSystem.playLadder();
                let topCell = matrixMap.ladders[team.position];
                setTimeout(() => {
                    threeEngine.animateTokenMovement(teamId, topCell, () => { team.position = topCell; this.advanceTurnPipeline(teamId); });
                }, 400);
            } else if (matrixMap.snakes[team.position]) {
                audioSystem.playSnake();
                let bottomCell = matrixMap.snakes[team.position];
                setTimeout(() => {
                    threeEngine.animateTokenMovement(teamId, bottomCell, () => { team.position = bottomCell; this.advanceTurnPipeline(teamId); });
                }, 400);
            } else {
                this.advanceTurnPipeline(teamId);
            }
        });
    }

    advanceTurnPipeline(teamId) {
        if(boardConfig.syncQuestions) {
            if(teamId === 't1') {
                this.deployNextQuestion('t1');
                this.teams.t2.activeQuestion = this.teams.t1.activeQuestion;
                this.teams.t2.state = 'QUESTION';
                this.teams.t2.currentAccumulator = [];
                this.renderTeamHUD('t1');
                this.renderTeamHUD('t2');
            } else {
                this.renderTeamHUD('t2');
            }
        } else {
            this.deployNextQuestion(teamId);
        }
    }

    declareAbsoluteVictory(teamId) {
        const victoryText = document.getElementById("victory-declaration");
        if(victoryText) victoryText.innerText = `Congratulations! ${this.teams[teamId].title} cleared all riddles and escaped the puzzle room chambers!`;
        ui.showPanel('winner-modal');
    }
}
const gameEngine = new GameEngine();


// --- MODULE 4: QUESTION MANAGEMENT INTEROP (QMS) ---
class QmsSystem {
    constructor() { this.currentBase64Media = ""; }

    init() {
        this.setupMediaPasteListeners();
        ui.onQmsTypeChange();
        this.refreshQmsTable();
    }

    setupMediaPasteListeners() {
        const dropzone = document.getElementById("qms-media-dropzone");
        if(!dropzone) return;
        window.addEventListener('paste', (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) { this.convertFileToBase64(items[i].getAsFile()); }
            }
        });
        dropzone.addEventListener('click', () => {
            const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
            input.onchange = (e) => this.convertFileToBase64(e.target.files[0]);
            input.click();
        });
    }

    convertFileToBase64(file) {
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            this.currentBase64Media = event.target.result;
            const preview = document.getElementById("qms-preview-img");
            if(preview) { preview.src = event.target.result; preview.classList.remove("hidden"); }
        };
        reader.readAsDataURL(file);
    }

    addQuestionFromUI() {
        const type = document.getElementById("qms-type").value;
        const text = document.getElementById("qms-question-text").value.trim();
        if(!text) { alert("Please enter question prompt text."); return; }

        let choices = []; let answer = "";

        if (type === 'multiple-choice') {
            for(let i = 1; i <= 4; i++) {
                let val = document.getElementById(`qms-opt-${i}`).value.trim();
                if(val) choices.push(val);
            }
            answer = document.getElementById("qms-opt-ans").value.trim();
        } else if (type === 'complete-sentence') {
            answer = document.getElementById("qms-sentence-ans").value.trim();
            choices = answer.split(" ");
        } else if (type === 'spelling') {
            answer = document.getElementById("qms-spelling-ans").value.trim().toUpperCase();
        }

        globalQuestionBank.push({
            id: 'custom_' + Date.now(), type: type, question: text, choices: choices, answer: answer, media: this.currentBase64Media
        });

        document.getElementById("qms-question-text").value = "";
        this.currentBase64Media = "";
        const preview = document.getElementById("qms-preview-img");
        if(preview) preview.classList.add("hidden");
        this.refreshQmsTable();
    }

    deleteQuestion(id) { globalQuestionBank = globalQuestionBank.filter(q => q.id !== id); this.refreshQmsTable(); }

    refreshQmsTable() {
        const tbody = document.getElementById("qms-table-body"); if(!tbody) return;
        tbody.innerHTML = "";
        globalQuestionBank.forEach(q => {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td><strong>${q.type.toUpperCase()}</strong></td><td>${q.question.substring(0, 40)}...</td><td><button onclick="qms.deleteQuestion('${q.id}')" style="color:#ff3300; background:none; border:none; cursor:pointer;">❌ Remove</button></td>`;
            tbody.appendChild(tr);
        });
    }
}
const qms = new QmsSystem();


// --- MODULE 5: SYSTEM PERSISTENCE STORAGE LAYER ---
class StorageSystem {
    saveToLocalStorage() { localStorage.setItem("escape_room_q_bank", JSON.stringify(globalQuestionBank)); alert("Session backup saved successfully."); }
    exportJSON() {
        const packet = { version: "2026.3D.Asset", boardConfig: boardConfig, questions: globalQuestionBank };
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(JSON.stringify(packet, null, 2));
        const link = document.createElement('a'); link.setAttribute('href', dataUri); link.setAttribute('download', 'EscapeRoomMatrixDeck.json'); link.click();
    }
    importJSON(event) {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if(parsed.questions) { globalQuestionBank = parsed.questions; qms.refreshQmsTable(); alert("Questions loaded successfully."); }
            } catch (err) { alert("Invalid file type formatting."); }
        };
        reader.readAsText(file);
    }
}
const storage = new StorageSystem();


// --- MODULE 6: UI MANAGER CONFIG CONTROLLER ---
class UIManager {
    showPanel(id) { 
        const el = document.getElementById(id);
        if(el) { el.classList.remove("hidden"); el.classList.add("active"); }
    }
    hidePanel(id) { 
        const el = document.getElementById(id);
        if(el) { el.classList.remove("active"); el.classList.add("hidden"); }
    }
    onQmsTypeChange() {
        const type = document.getElementById("qms-type").value;
        const wrapper = document.getElementById("qms-options-wrapper"); if(!wrapper) return;
        wrapper.innerHTML = "";

        if (type === 'multiple-choice') {
            wrapper.innerHTML = `
                <div class="option-row"><input type="text" id="qms-opt-1" placeholder="Choice option A"></div>
                <div class="option-row"><input type="text" id="qms-opt-2" placeholder="Choice option B"></div>
                <div class="option-row"><input type="text" id="qms-opt-3" placeholder="Choice option C"></div>
                <div class="option-row"><input type="text" id="qms-opt-4" placeholder="Choice option D"></div>
                <label>Exact Target Answer Text:</label><input type="text" id="qms-opt-ans" placeholder="e.g. Amulet of Vision">`;
        } else if (type === 'complete-sentence') {
            wrapper.innerHTML = `<label>Full Targeted Solution Sentence:</label><input type="text" id="qms-sentence-ans" placeholder="e.g. OPEN THE PORTAL NOW">`;
        } else if (type === 'spelling') {
            wrapper.innerHTML = `<label>Target Spelling Word Token String:</label><input type="text" id="qms-spelling-ans" placeholder="e.g. KEY">`;
        }
    }
}
const ui = new UIManager();


// --- CRITICAL CLICK REGISTRATION ---
window.addEventListener("DOMContentLoaded", () => {
    qms.init();
    
    const quickStartBtn = document.getElementById("quick-start-btn");
    if (quickStartBtn) {
        quickStartBtn.onclick = () => gameEngine.startQuickGame();
    }

    const openConfigBtn = document.getElementById("open-config-btn");
    if (openConfigBtn) {
        openConfigBtn.onclick = () => {
            ui.hidePanel('intro-screen');
            ui.showPanel('settings-panel');
        };
    }

    const launchGameBtn = document.getElementById("launch-game-btn");
    if (launchGameBtn) {
        launchGameBtn.onclick = () => gameEngine.initiateGameFromSettings();
    }

    const fallback = localStorage.getItem("escape_room_q_bank");
    if(fallback) { try { globalQuestionBank = JSON.parse(fallback); qms.refreshQmsTable(); } catch(e){} }
});
