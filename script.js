// ---------- DOM references ----------
const world = document.getElementById("world");
const playerEl = document.getElementById("player");
const startScreen = document.getElementById("startScreen");
const gameOverScreen = document.getElementById("gameOverScreen");
const gameOverInfo = document.getElementById("gameOverInfo");
const waveDisplay = document.getElementById("waveDisplay");
const timeDisplay = document.getElementById("timeDisplay");
const enemyDisplay = document.getElementById("enemyDisplay");
const modeDisplay = document.getElementById("modeDisplay");
const countdownOverlay = document.getElementById("countdownOverlay");
const countdownText = document.getElementById("countdownText");
const trainingPanel = document.getElementById("trainingPanel");
const btnGameModes = document.getElementById("btnGameModes");
const btnTraining = document.getElementById("btnTraining");
const modeButtons = document.getElementById("modeButtons");
const btnRestart = document.getElementById("btnRestart");

// ---------- Game state ----------
let keys = { w: false, a: false, s: false, d: false };
let player = {
    x: 315,
    y: 205,
    angle: 0,
    speed: 0,
    width: 70,
    height: 40,
};

let enemies = []; // {el,x,y,w,h,type,...}
let bullets = []; // {el,x,y,w,h,vx,vy}
let obstacles = []; // {el,x,y,w,h,dirX,dirY,speed,minX,maxX,minY,maxY}

let running = false;
let lastTime = 0;

let worldWidth = 700;
let worldHeight = 450;

// Player physics
const PLAYER_ACCEL = 0.2;
const PLAYER_FRICTION = 0.05;
const PLAYER_MAX_SPEED = 6;
const PLAYER_TURN_SPEED = 0.06;

// Modes & waves
let currentMode = null; // 'classic','chaos','endless','training'
let waveNumber = 0;
let waveTimeRemaining = 0;
let baseWaveDuration = 30;
let waveDurationGrowth = 5;
let endlessTime = 0;

// Training limits
const TRAINING_MAX_ENEMIES = 20;
const TRAINING_MAX_OBSTACLES = 10;

// Mode configs
const modeConfigs = {
    classic: {
        name: "Classic",
        enemyFormula: (wave) => 1 + Math.floor(wave * 1.2),
        baseWaveDuration: 30,
        waveDurationGrowth: 5,
        obstaclesAfterWave: 3,
        arenaGrow: true,
    },
    chaos: {
        name: "Chaos",
        enemyFormula: (wave) => 2 + wave * 2,
        baseWaveDuration: 20,
        waveDurationGrowth: 3,
        obstaclesAfterWave: 2,
        arenaGrow: true,
    },
    endless: {
        name: "Endless",
    },
    training: {
        name: "Training",
    },
};

// ---------- Controls ----------
window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (keys[k] !== undefined) keys[k] = true;
});
window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (keys[k] !== undefined) keys[k] = false;
});

// ---------- Utility ----------
function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

function rectsOverlap(a, b) {
    return !(
        a.x + a.w < b.x ||
        a.x > b.x + b.w ||
        a.y + a.h < b.y ||
        a.y > b.y + b.h
    );
}

// ---------- Spawn warnings ----------
function spawnWarning(x, y) {
    const warn = document.createElement("div");
    warn.classList.add("spawn-warning");
    warn.style.left = x + "px";
    warn.style.top = y + "px";
    world.appendChild(warn);
    setTimeout(() => warn.remove(), 1000);
}

// ---------- Positions ----------
function randomSafePosition(minDistFromPlayer = 200) {
    let x, y, dist;
    do {
        x = Math.random() * (worldWidth - 80);
        y = Math.random() * (worldHeight - 80);
        const dx = x - player.x;
        const dy = y - player.y;
        dist = Math.hypot(dx, dy);
    } while (dist < minDistFromPlayer);
    return { x, y };
}

// ---------- Enemy & obstacle spawning ----------
function spawnEnemy(type, withWarning = true) {
    const pos = randomSafePosition(220);
    if (withWarning) {
        spawnWarning(pos.x, pos.y);
    }

    setTimeout(() => {
        const el = document.createElement("div");
        el.classList.add("enemy", type);
        world.appendChild(el);

        const enemy = {
            el,
            x: pos.x,
            y: pos.y,
            w: 60,
            h: 35,
            type,
            angle: 0,
            speed: 0,
            baseSpeed:
                type === "fast"
                    ? 3
                    : type === "charger"
                        ? 2.6
                        : type === "shooter"
                            ? 1.8
                            : 1.7,
            chargeCooldown: 0,
            charging: false,
            shootCooldown: 0,
        };
        enemies.push(enemy);
    }, withWarning ? 1000 : 0);
}

function spawnObstacle(horizontal = true) {
    const el = document.createElement("div");
    el.classList.add("obstacle");
    const w = horizontal ? 160 : 30;
    const h = horizontal ? 30 : 160;

    const margin = 40;
    const x = Math.random() * (worldWidth - w - margin * 2) + margin;
    const y = Math.random() * (worldHeight - h - margin * 2) + margin;

    el.style.width = w + "px";
    el.style.height = h + "px";
    world.appendChild(el);

    const speed = 1.5;
    const obstacle = {
        el,
        x,
        y,
        w,
        h,
        dirX: horizontal ? (Math.random() < 0.5 ? -1 : 1) : 0,
        dirY: horizontal ? 0 : Math.random() < 0.5 ? -1 : 1,
        speed,
        minX: 10,
        maxX: worldWidth - w - 10,
        minY: 10,
        maxY: worldHeight - h - 10,
    };
    obstacles.push(obstacle);
}

// ---------- Bullets ----------
function spawnBullet(fromEnemy) {
    const el = document.createElement("div");
    el.classList.add("bullet");
    world.appendChild(el);

    const dx =
        player.x + player.width / 2 - (fromEnemy.x + fromEnemy.w / 2);
    const dy =
        player.y + player.height / 2 - (fromEnemy.y + fromEnemy.h / 2);
    const dist = Math.hypot(dx, dy) || 1;
    const speed = 4;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;

    const b = {
        el,
        x: fromEnemy.x + fromEnemy.w / 2 - 5,
        y: fromEnemy.y + fromEnemy.h / 2 - 5,
        w: 10,
        h: 10,
        vx,
        vy,
    };
    bullets.push(b);
}

// ---------- Wave setup (Classic & Chaos) ----------
function setupWave() {
    const config = modeConfigs[currentMode];
    waveNumber++;
    waveDisplay.textContent = waveNumber;

    enemies.forEach((e) => e.el.remove());
    enemies = [];
    bullets.forEach((b) => b.el.remove());
    bullets = [];

    // Arena growth with animation
    if (config.arenaGrow) {
        worldWidth = clamp(700 + (waveNumber - 1) * 40, 1000, 1800);
        worldHeight = clamp(450 + (waveNumber - 1) * 30, 450, 800);
    } else {
        worldWidth = 700;
        worldHeight = 450;
    }
    world.style.width = worldWidth + "px";
    world.style.height = worldHeight + "px";

    // Wave timing
    baseWaveDuration = config.baseWaveDuration;
    waveDurationGrowth = config.waveDurationGrowth;
    waveTimeRemaining =
        baseWaveDuration + (waveNumber - 1) * waveDurationGrowth;

    // Enemies per wave
    const totalEnemies = config.enemyFormula(waveNumber);
    for (let i = 0; i < totalEnemies; i++) {
        let type;
        const r = Math.random();
        if (waveNumber <= 2) {
            type = "fast";
        } else if (waveNumber <= 3) {
            type = r < 0.6 ? "fast" : "charger";
        } else if (waveNumber <= 4) {
            const arr = ["fast", "charger", "shooter"];
            type = arr[Math.floor(Math.random() * arr.length)];
        } else {
            const arr = ["fast", "charger", "shooter", "exploder"];
            type = arr[Math.floor(Math.random() * arr.length)];
        }
        spawnEnemy(type, true);
    }

    // Obstacles
    obstacles.forEach((o) => o.el.remove());
    obstacles = [];
    if (waveNumber >= config.obstaclesAfterWave) {
        const obstacleCount = Math.min(
            1 + Math.floor((waveNumber - config.obstaclesAfterWave) / 2),
            4
        );
        for (let i = 0; i < obstacleCount; i++) {
            spawnObstacle(Math.random() < 0.5);
        }
    }
}

// ---------- Endless setup ----------
function setupEndless() {
    endlessGrowTimer = 0;
    enemies.forEach((e) => e.el.remove());
    enemies = [];
    bullets.forEach((b) => b.el.remove());
    bullets = [];
    obstacles.forEach((o) => o.el.remove());
    obstacles = [];

    worldWidth = 700;
    worldHeight = 450;
    world.style.width = worldWidth + "px";
    world.style.height = worldHeight + "px";

    waveNumber = 0;
    endlessTime = 0;
    endlessGrowTimer = 0; // <-- IMPORTANT

    waveDisplay.textContent = "-";
}



// ---------- Training setup ----------
function setupTraining() {
    enemies.forEach((e) => e.el.remove());
    enemies = [];
    bullets.forEach((b) => b.el.remove());
    bullets = [];
    obstacles.forEach((o) => o.el.remove());
    obstacles = [];

    worldWidth = 700;
    worldHeight = 450;
    world.style.width = worldWidth + "px";
    world.style.height = worldHeight + "px";

    waveNumber = 0;
    waveDisplay.textContent = "-";
    timeDisplay.textContent = "-";
}

// ---------- Player reset ----------
function resetPlayerPosition() {
    player.x = worldWidth / 2 - player.width / 2;
    player.y = worldHeight / 2 - player.height / 2;
    player.speed = 0;
    player.angle = 0;
    playerEl.style.transform = `translate(${player.x}px, ${player.y}px) rotate(${player.angle}rad)`;
}

// ---------- Mode start ----------
function startMode(mode) {
    currentMode = mode;
    modeDisplay.textContent = modeConfigs[mode].name;
    startScreen.style.display = "none";
    gameOverScreen.style.display = "none";
    trainingPanel.style.display = mode === "training" ? "block" : "none";

    resetPlayerPosition();

    enemies.forEach((e) => e.el.remove());
    enemies = [];
    bullets.forEach((b) => b.el.remove());
    bullets = [];
    obstacles.forEach((o) => o.el.remove());
    obstacles = [];

    if (mode === "classic" || mode === "chaos") {
        waveNumber = 0;
        setupWave();
    } else if (mode === "endless") {
        setupEndless();
    } else if (mode === "training") {
        setupTraining();
    }

    countdownAndStart();
}

// ---------- Countdown ----------
function countdownAndStart() {
    countdownOverlay.style.display = "flex";

    if (currentMode === "training") {
        countdownOverlay.style.display = "none";
        running = true;
        lastTime = performance.now();
        requestAnimationFrame(loop);
        return;
    }

    let count = 3;
    function step() {
        if (count > 0) {
            countdownText.textContent = count;
            count--;
            setTimeout(step, 700);
        } else {
            countdownText.textContent = "GO!";
            setTimeout(() => {
                countdownOverlay.style.display = "none";
                running = true;
                lastTime = performance.now();
                requestAnimationFrame(loop);
            }, 500);
        }
    }
    step();
}

// ---------- Game over & restart ----------
function gameOver() {
    if (currentMode === "training") return;

    running = false;
    if (currentMode === "endless") {
        gameOverInfo.textContent = `You survived for ${endlessTime.toFixed(
            1
        )} seconds.`;
    } else {
        gameOverInfo.textContent = `You reached wave ${waveNumber}.`;
    }
    gameOverScreen.style.display = "flex";
}

function restartGame() {
    gameOverScreen.style.display = "none";

    startScreen.style.display = "flex";
    modeButtons.style.display = "none";
    modeDisplay.textContent = "-";
    waveDisplay.textContent = "-";
    timeDisplay.textContent = "-";
    enemyDisplay.textContent = "0";
    trainingPanel.style.display = "none";

    enemies.forEach((e) => e.el.remove());
    enemies = [];
    bullets.forEach((b) => b.el.remove());
    bullets = [];
    obstacles.forEach((o) => o.el.remove());
    obstacles = [];

    resetPlayerPosition();
    running = false;
}

// ---------- Player update ----------
function updatePlayer(dt) {
    if (keys.w) player.speed += PLAYER_ACCEL;
    if (keys.s) player.speed -= PLAYER_ACCEL;

    player.speed = clamp(player.speed, -PLAYER_MAX_SPEED, PLAYER_MAX_SPEED);

    if (!keys.w && !keys.s) {
        player.speed *= 1 - PLAYER_FRICTION;
    }

    if (keys.a) player.angle -= PLAYER_TURN_SPEED;
    if (keys.d) player.angle += PLAYER_TURN_SPEED;

    player.x += Math.cos(player.angle) * player.speed;
    player.y += Math.sin(player.angle) * player.speed;

    player.x = clamp(player.x, 0, worldWidth - player.width);
    player.y = clamp(player.y, 0, worldHeight - player.height);

    playerEl.style.transform = `translate(${player.x}px, ${player.y}px) rotate(${player.angle}rad)`;
}

// ---------- Enemies update ----------
function updateEnemies(dt) {
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;

    enemies.forEach((enemy) => {
        const dx = px - (enemy.x + enemy.w / 2);
        const dy = py - (enemy.y + enemy.h / 2);
        const dist = Math.hypot(dx, dy) || 1;
        const dirX = dx / dist;
        const dirY = dy / dist;

        if (enemy.type === "fast") {
            enemy.speed = enemy.baseSpeed;
            enemy.x += dirX * enemy.speed;
            enemy.y += dirY * enemy.speed;
        } else if (enemy.type === "charger") {
            enemy.chargeCooldown -= dt;
            if (enemy.charging) {
                enemy.x += enemy.vx * dt * 60;
                enemy.y += enemy.vy * dt * 60;
                enemy.chargeTimer -= dt;
                if (enemy.chargeTimer <= 0) enemy.charging = false;
            } else {
                enemy.speed = enemy.baseSpeed * 0.8;
                enemy.x += dirX * enemy.speed;
                enemy.y += dirY * enemy.speed;
                if (enemy.chargeCooldown <= 0 && dist > 120) {
                    enemy.charging = true;
                    enemy.chargeTimer = 0.7;
                    enemy.chargeCooldown = 3 + Math.random() * 2;
                    const chargeSpeed = 6;
                    enemy.vx = dirX * chargeSpeed;
                    enemy.vy = dirY * chargeSpeed;
                }
            }
        } else if (enemy.type === "shooter") {
            const desiredDist = 200;
            if (dist > desiredDist + 30) {
                enemy.speed = enemy.baseSpeed;
                enemy.x += dirX * enemy.speed;
                enemy.y += dirY * enemy.speed;
            } else if (dist < desiredDist - 30) {
                enemy.speed = enemy.baseSpeed;
                enemy.x -= dirX * enemy.speed;
                enemy.y -= dirY * enemy.speed;
            }
            enemy.shootCooldown -= dt;
            if (enemy.shootCooldown <= 0) {
                spawnBullet(enemy);
                enemy.shootCooldown = 1.5 + Math.random();
            }
        } else if (enemy.type === "exploder") {
            const base = enemy.baseSpeed;
            const extra = dist < 130 ? 2.5 : 0.8;
            enemy.speed = base + extra;
            enemy.x += dirX * enemy.speed;
            enemy.y += dirY * enemy.speed;
        }

        enemy.x = clamp(enemy.x, 0, worldWidth - enemy.w);
        enemy.y = clamp(enemy.y, 0, worldHeight - enemy.h);

        enemy.el.style.transform = `translate(${enemy.x}px, ${enemy.y}px)`;
    });

    // Separate enemies
    const minDist = 70;
    for (let i = 0; i < enemies.length; i++) {
        for (let j = i + 1; j < enemies.length; j++) {
            const e1 = enemies[i];
            const e2 = enemies[j];
            const dx = e2.x + e2.w / 2 - (e1.x + e1.w / 2);
            const dy = e2.y + e2.h / 2 - (e1.y + e1.h / 2);
            const dist = Math.hypot(dx, dy) || 1;
            if (dist < minDist) {
                const overlap = (minDist - dist) * 0.5;
                const ox = (dx / dist) * overlap;
                const oy = (dy / dist) * overlap;
                e1.x -= ox;
                e1.y -= oy;
                e2.x += ox;
                e2.y += oy;
                e1.x = clamp(e1.x, 0, worldWidth - e1.w);
                e1.y = clamp(e1.y, 0, worldHeight - e1.h);
                e2.x = clamp(e2.x, 0, worldWidth - e2.w);
                e2.y = clamp(e2.y, 0, worldHeight - e2.h);
            }
        }
    }

    const pRect = { x: player.x, y: player.y, w: player.width, h: player.height };
    for (const enemy of enemies) {
        const eRect = { x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h };
        if (rectsOverlap(pRect, eRect)) {
            gameOver();
            return;
        }
    }
}

// ---------- Bullets update ----------
function updateBullets(dt) {
    const pRect = { x: player.x, y: player.y, w: player.width, h: player.height };
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;

        if (
            b.x < -20 ||
            b.x > worldWidth + 20 ||
            b.y < -20 ||
            b.y > worldHeight + 20
        ) {
            b.el.remove();
            bullets.splice(i, 1);
            continue;
        }
        b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;

        const bRect = { x: b.x, y: b.y, w: b.w, h: b.h };
        if (rectsOverlap(pRect, bRect)) {
            gameOver();
            return;
        }
    }
}

// ---------- Obstacles update ----------
function updateObstacles(dt) {
    const pRect = { x: player.x, y: player.y, w: player.width, h: player.height };

    obstacles.forEach((o) => {
        o.x += o.dirX * o.speed;
        o.y += o.dirY * o.speed;

        if (o.x < o.minX || o.x > o.maxX) o.dirX *= -1;
        if (o.y < o.minY || o.y > o.maxY) o.dirY *= -1;

        o.x = clamp(o.x, o.minX, o.maxX);
        o.y = clamp(o.y, o.minY, o.maxY);

        o.el.style.transform = `translate(${o.x}px, ${o.y}px)`;

        const oRect = { x: o.x, y: o.y, w: o.w, h: o.h };
        if (rectsOverlap(pRect, oRect)) {
            gameOver();
        }
    });
}
let endlessGrowTimer = 0;
// ---------- Main loop ----------
function loop(timestamp) {
    if (!running) return;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (currentMode === "classic" || currentMode === "chaos") {
        waveTimeRemaining -= dt;
        if (waveTimeRemaining <= 0) {
            setupWave();
        }
        timeDisplay.textContent = waveTimeRemaining.toFixed(1);
    } else if (currentMode === "endless") {
        endlessTime += dt;
        endlessGrowTimer += dt;

        // Grow arena every 5 seconds
        if (endlessGrowTimer >= 5) {

            if (worldWidth > 2000) {

            }
            else {
                endlessGrowTimer -= 5;

                worldWidth += 50;
                worldHeight += 50;

                world.style.width = worldWidth + "px";
                world.style.height = worldHeight + "px";

            }
        }


        timeDisplay.textContent = endlessTime.toFixed(1);

        // Spawn enemies over time
        if (Math.random() < dt * 0.5) {
            const types = ["fast", "charger", "shooter", "exploder"];
            spawnEnemy(types[Math.floor(Math.random() * types.length)], true);
        }


    } else if (currentMode === "training") {
        timeDisplay.textContent = "-";
    }

    enemyDisplay.textContent = enemies.length.toString();

    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateObstacles(dt);

    requestAnimationFrame(loop);
}

// ---------- Training commands ----------
function trainingSpawn(type) {
    if (currentMode !== "training") return;

    if (enemies.length >= TRAINING_MAX_ENEMIES) {
        alert("Enemy limit reached in training mode.");
        return;
    }
    spawnEnemy(type, false);
}

function trainingAddObstacle() {
    if (currentMode !== "training") return;

    if (obstacles.length >= TRAINING_MAX_OBSTACLES) {
        alert("Obstacle limit reached in training mode.");
        return;
    }
    spawnObstacle(Math.random() < 0.5);
}

function trainingClearAll() {
    if (currentMode !== "training") return;

    enemies.forEach((e) => e.el.remove());
    enemies = [];

    obstacles.forEach((o) => o.el.remove());
    obstacles = [];

    bullets.forEach((b) => b.el.remove());
    bullets = [];

    enemyDisplay.textContent = "0";
}

// ---------- UI: Mode selection ----------
btnGameModes.addEventListener("click", () => {
    modeButtons.style.display =
        modeButtons.style.display === "flex" ? "none" : "flex";
});

btnTraining.addEventListener("click", () => {
    startMode("training");
});

modeButtons
    .querySelectorAll("button[data-mode]")
    .forEach((btn) => {
        btn.addEventListener("click", () => {
            const mode = btn.getAttribute("data-mode");
            startMode(mode);
        });
    });
// ---------- Training panel button wiring ----------
const trainingButtons = document.querySelectorAll('#trainingPanel button[data-train]');
const btnTrainObstacle = document.getElementById('btnTrainObstacle');
const btnTrainClear = document.getElementById('btnTrainClear');

// Spawn specific enemy types
trainingButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-train'); // fast / charger / shooter / exploder
        trainingSpawn(type);
    });
});

// Add obstacle
btnTrainObstacle.addEventListener('click', () => {
    trainingAddObstacle();
});

// Clear all enemies/obstacles/bullets
btnTrainClear.addEventListener('click', () => {
    trainingClearAll();
});
btnRestart.addEventListener("click", restartGame);