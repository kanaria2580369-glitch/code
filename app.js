const JOBS = [
  { id: "fighter", label: "剣士", hp: 42, attack: 11, defense: 3 },
  { id: "mage", label: "魔法使い", hp: 30, attack: 14, defense: 1 },
  { id: "paladin", label: "聖騎士", hp: 48, attack: 9, defense: 4 },
];

const ENEMIES = [
  { name: "ゴブリン", hp: 18, attack: 7, defense: 1 },
  { name: "スケルトン", hp: 24, attack: 8, defense: 2 },
  { name: "オーク", hp: 30, attack: 10, defense: 3 },
  { name: "ドラゴンの幼体", hp: 40, attack: 12, defense: 4 },
];

const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const choicesEl = document.getElementById("choices");

const state = {
  stage: "name",
  playerName: "",
  player: null,
  enemyList: [],
  floor: 0,
  enemy: null,
  defended: false,
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function addLog(text) {
  const p = document.createElement("p");
  p.textContent = text;
  logEl.appendChild(p);
  logEl.scrollTop = logEl.scrollHeight;
}

function setChoices(buttons) {
  choicesEl.innerHTML = "";
  buttons.forEach((btn) => {
    const b = document.createElement("button");
    b.textContent = btn.label;
    if (btn.className) b.className = btn.className;
    b.onclick = btn.onClick;
    choicesEl.appendChild(b);
  });
}

function renderStatus() {
  const player = state.player;
  const enemy = state.enemy;

  statusEl.innerHTML = `
    <div class="status-grid">
      <div>
        <strong>あなた:</strong> ${player ? `${state.playerName} (${player.job})` : "-"}<br>
        HP: ${player ? `${player.hp}/${player.maxHp}` : "-"}<br>
        ポーション: ${player ? player.potions : "-"}
      </div>
      <div>
        <strong>敵:</strong> ${enemy ? enemy.name : "-"}<br>
        HP: ${enemy ? `${enemy.hp}/${enemy.maxHp}` : "-"}<br>
        階層: ${state.floor}/4
      </div>
    </div>
  `;
}

function takeDamage(target, incoming) {
  const dmg = Math.max(1, incoming - target.defense);
  target.hp = Math.max(0, target.hp - dmg);
  return dmg;
}

function heal(target, value) {
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + value);
  return target.hp - before;
}

function startBattle() {
  state.enemy = state.enemyList[state.floor - 1];
  addLog(`--- 第${state.floor}層: ${state.enemy.name} が現れた！ ---`);
  state.defended = false;
  renderStatus();
  playerTurnMenu();
}

function nextFloor() {
  state.floor += 1;
  if (state.floor > state.enemyList.length) {
    addLog("王冠を手に入れた！あなたの勝利だ！");
    setChoices([{ label: "もう一度遊ぶ", className: "secondary", onClick: init }]);
    state.stage = "clear";
    return;
  }
  startBattle();
}

function enemyAction() {
  const base = state.enemy.attack + randomInt(0, 4);
  const raw = state.defended ? Math.max(1, Math.floor(base / 2)) : base;
  const dmg = takeDamage(state.player, raw);
  addLog(`${state.enemy.name}の攻撃！ ${dmg}ダメージ受けた。`);
  state.defended = false;

  if (state.player.hp <= 0) {
    addLog("あなたは倒れてしまった… ゲームオーバー");
    setChoices([{ label: "リトライ", className: "danger", onClick: init }]);
    state.stage = "gameover";
    renderStatus();
    return;
  }

  renderStatus();
  playerTurnMenu();
}

function playerAttack() {
  const crit = Math.random() < 0.15 ? 2 : 1;
  const base = state.player.attack + randomInt(0, 5);
  const dmg = takeDamage(state.enemy, base * crit);
  addLog(`${crit === 2 ? "会心！ " : ""}${state.enemy.name}に${dmg}ダメージ。`);
  renderStatus();

  if (state.enemy.hp <= 0) {
    addLog(`${state.enemy.name}を倒した！`);
    const recovered = heal(state.player, 8);
    addLog(`休息でHPが${recovered}回復。`);
    renderStatus();
    setChoices([{ label: "次の階へ", className: "secondary", onClick: nextFloor }]);
    return;
  }

  enemyAction();
}

function playerPotion() {
  if (state.player.potions <= 0) {
    addLog("ポーションがない！");
    playerTurnMenu();
    return;
  }
  state.player.potions -= 1;
  const recovered = heal(state.player, randomInt(12, 20));
  addLog(`ポーションでHPが${recovered}回復した。`);
  renderStatus();
  enemyAction();
}

function playerDefend() {
  state.defended = true;
  addLog("防御態勢！ 次の被ダメージを軽減。 ");
  enemyAction();
}

function playerTurnMenu() {
  setChoices([
    { label: "⚔️ 攻撃", onClick: playerAttack },
    { label: "🧪 ポーション", className: "secondary", onClick: playerPotion },
    { label: "🛡️ 防御", className: "warn", onClick: playerDefend },
  ]);
}

function chooseJob() {
  addLog("職業を選んでください。");
  setChoices(
    JOBS.map((j) => ({
      label: j.label,
      onClick: () => {
        state.player = {
          job: j.label,
          hp: j.hp,
          maxHp: j.hp,
          attack: j.attack,
          defense: j.defense,
          potions: 2,
        };
        state.enemyList = shuffle(ENEMIES).map((e) => ({ ...e, maxHp: e.hp }));
        state.floor = 0;
        addLog(`${j.label}として迷宮へ入った。`);
        renderStatus();
        nextFloor();
      },
    }))
  );
}

function askName() {
  setChoices([
    {
      label: "名前を入力して開始",
      onClick: () => {
        const name = window.prompt("冒険者の名前を入力", "冒険者");
        state.playerName = (name || "冒険者").trim() || "冒険者";
        addLog(`ようこそ、${state.playerName}。`);
        renderStatus();
        chooseJob();
      },
    },
  ]);
}

function init() {
  logEl.innerHTML = "";
  state.stage = "name";
  state.playerName = "";
  state.player = null;
  state.enemy = null;
  state.enemyList = [];
  state.floor = 0;
  state.defended = false;

  addLog("=== 迷宮の王冠（スマホ版） ===");
  addLog("下のボタンをタップして進めよう。");
  renderStatus();
  askName();
}

init();
