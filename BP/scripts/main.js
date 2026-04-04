import {
  system,
  world,
  EquipmentSlot,
  ItemStack,
  MinecraftItemTypes,
  EntityDamageCause,
} from "@minecraft/server";

const STATE_KEY = "adaptive_hunter:state";
const LEARNING_KEY = "adaptive_hunter:learning";
const HUNTER_TAG = "adaptive_hunter";

const defaultState = {
  active: false,
  level: 0,
  kills: 0,
  targetId: "",
  hunterId: "",
};

const defaultLearning = {
  meleeHits: 0,
  rangedHits: 0,
  fireHits: 0,
};

function getState() {
  const raw = world.getDynamicProperty(STATE_KEY);
  if (!raw || typeof raw !== "string") return { ...defaultState };
  try {
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return { ...defaultState };
  }
}

function saveState(state) {
  world.setDynamicProperty(STATE_KEY, JSON.stringify(state));
}

function getLearning() {
  const raw = world.getDynamicProperty(LEARNING_KEY);
  if (!raw || typeof raw !== "string") return { ...defaultLearning };
  try {
    return { ...defaultLearning, ...JSON.parse(raw) };
  } catch {
    return { ...defaultLearning };
  }
}

function saveLearning(learning) {
  world.setDynamicProperty(LEARNING_KEY, JSON.stringify(learning));
}

function broadcast(msg) {
  world.sendMessage(`§c[Adaptive Hunter]§r ${msg}`);
}

function findPlayerById(id) {
  if (!id) return undefined;
  for (const p of world.getPlayers()) {
    if (p.id === id) return p;
  }
  return undefined;
}

function findHunterById(id) {
  if (!id) return undefined;
  for (const dim of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    const entity = world.getDimension(dim).getEntities({ tags: [HUNTER_TAG] }).find((e) => e.id === id);
    if (entity) return entity;
  }
  return undefined;
}

function getLoadout(level, learning) {
  const antiRanged = learning.rangedHits > learning.meleeHits;
  const antiFire = learning.fireHits >= 5;

  if (level >= 8) {
    return {
      helmet: MinecraftItemTypes.NetheriteHelmet,
      chest: MinecraftItemTypes.NetheriteChestplate,
      legs: MinecraftItemTypes.NetheriteLeggings,
      boots: MinecraftItemTypes.NetheriteBoots,
      weapon: antiRanged ? MinecraftItemTypes.Crossbow : MinecraftItemTypes.NetheriteSword,
      effects: [
        "effect @s speed 8 2 true",
        "effect @s strength 8 2 true",
        "effect @s resistance 8 1 true",
      ],
      extra: antiFire ? "effect @s fire_resistance 8 0 true" : "",
    };
  }

  if (level >= 5) {
    return {
      helmet: MinecraftItemTypes.DiamondHelmet,
      chest: MinecraftItemTypes.DiamondChestplate,
      legs: MinecraftItemTypes.DiamondLeggings,
      boots: MinecraftItemTypes.DiamondBoots,
      weapon: antiRanged ? MinecraftItemTypes.Bow : MinecraftItemTypes.DiamondSword,
      effects: ["effect @s speed 8 1 true", "effect @s strength 8 1 true"],
      extra: antiFire ? "effect @s fire_resistance 8 0 true" : "",
    };
  }

  return {
    helmet: MinecraftItemTypes.IronHelmet,
    chest: MinecraftItemTypes.IronChestplate,
    legs: MinecraftItemTypes.IronLeggings,
    boots: MinecraftItemTypes.IronBoots,
    weapon: MinecraftItemTypes.IronSword,
    effects: ["effect @s speed 8 0 true"],
    extra: "",
  };
}

function equipHunter(hunter, level, learning) {
  const equippable = hunter.getComponent("equippable");
  if (!equippable) return;

  const loadout = getLoadout(level, learning);
  equippable.setEquipment(EquipmentSlot.Head, new ItemStack(loadout.helmet));
  equippable.setEquipment(EquipmentSlot.Chest, new ItemStack(loadout.chest));
  equippable.setEquipment(EquipmentSlot.Legs, new ItemStack(loadout.legs));
  equippable.setEquipment(EquipmentSlot.Feet, new ItemStack(loadout.boots));
  equippable.setEquipment(EquipmentSlot.Mainhand, new ItemStack(loadout.weapon));

  for (const effect of loadout.effects) {
    hunter.runCommand(effect);
  }
  if (loadout.extra) hunter.runCommand(loadout.extra);
}

function spawnHunterFor(player, reason = "出現") {
  const state = getState();
  const learning = getLearning();
  const level = Math.max(1, state.level || 1);

  const location = {
    x: player.location.x + (Math.random() > 0.5 ? 14 : -14),
    y: player.location.y + 1,
    z: player.location.z + (Math.random() > 0.5 ? 14 : -14),
  };

  const hunter = player.dimension.spawnEntity("minecraft:husk", location);
  hunter.nameTag = `§4Hunter Lv.${level}`;
  hunter.addTag(HUNTER_TAG);
  hunter.triggerEvent("minecraft:as_baby");
  hunter.runCommand("event entity @s minecraft:become_adult");

  equipHunter(hunter, level, learning);

  state.hunterId = hunter.id;
  state.targetId = player.id;
  saveState(state);

  broadcast(`${reason}: ${player.name} を狙う Hunter Lv.${level}`);
}

function startHunt(player) {
  const state = getState();
  state.active = true;
  state.level = Math.max(1, state.level || 1);
  state.targetId = player.id;
  saveState(state);

  broadcast(`討伐戦開始。ターゲットは ${player.name}。`);
  spawnHunterFor(player, "初回スポーン");
}

function stopHunt() {
  const state = getState();
  state.active = false;
  state.hunterId = "";
  saveState(state);

  for (const dim of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    const dimension = world.getDimension(dim);
    dimension.runCommand(`kill @e[tag=${HUNTER_TAG}]`);
  }

  broadcast("討伐戦を停止しました。");
}

world.afterEvents.entityHitEntity.subscribe((ev) => {
  const state = getState();
  if (!state.active) return;

  if (!ev.hitEntity?.hasTag(HUNTER_TAG)) return;
  if (!ev.damagingEntity || ev.damagingEntity.typeId !== "minecraft:player") return;

  const learning = getLearning();
  learning.meleeHits += 1;
  saveLearning(learning);
});

world.afterEvents.projectileHitEntity.subscribe((ev) => {
  const state = getState();
  if (!state.active) return;

  if (!ev.getEntityHit()?.entity?.hasTag(HUNTER_TAG)) return;
  const source = ev.source;
  if (!source || source.typeId !== "minecraft:player") return;

  const learning = getLearning();
  learning.rangedHits += 1;
  saveLearning(learning);
});

world.afterEvents.entityHurt.subscribe((ev) => {
  const state = getState();
  if (!state.active) return;
  if (!ev.hurtEntity?.hasTag(HUNTER_TAG)) return;

  if (ev.damageSource.cause === EntityDamageCause.fire || ev.damageSource.cause === EntityDamageCause.fireTick) {
    const learning = getLearning();
    learning.fireHits += 1;
    saveLearning(learning);
  }
});

world.afterEvents.entityDie.subscribe((ev) => {
  const dead = ev.deadEntity;
  if (!dead?.hasTag(HUNTER_TAG)) return;

  const state = getState();
  if (!state.active) return;

  state.kills += 1;
  state.level += 1;
  state.hunterId = "";
  saveState(state);

  const killerName = ev.damageSource?.damagingEntity?.name ?? "Unknown";
  broadcast(`Hunter が倒された (by ${killerName})。学習して再出現します...`);

  system.runTimeout(() => {
    const target = findPlayerById(state.targetId) ?? world.getAllPlayers()[0];
    if (!target) return;
    spawnHunterFor(target, "再スポーン");
  }, 80);
});

system.runInterval(() => {
  const state = getState();
  if (!state.active) return;

  const hunter = findHunterById(state.hunterId);
  const target = findPlayerById(state.targetId);
  if (!target) return;

  if (!hunter) {
    const entities = target.dimension.getEntities({ tags: [HUNTER_TAG], closest: 1, location: target.location, maxDistance: 128 });
    const aliveHunter = entities[0];
    if (!aliveHunter) {
      spawnHunterFor(target, "追跡再開");
      return;
    }
    state.hunterId = aliveHunter.id;
    saveState(state);
  }

  target.runCommand(`title @s actionbar §4Hunter Lv.${state.level} があなたを追跡中`);
}, 40);

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === "adaptive_hunter:start") {
    const source = ev.sourceEntity;
    if (!source || source.typeId !== "minecraft:player") {
      broadcast("プレイヤーが /function hunter/start を実行してください。");
      return;
    }
    startHunt(source);
    return;
  }

  if (ev.id === "adaptive_hunter:stop") {
    stopHunt();
    return;
  }

  if (ev.id === "adaptive_hunter:reset") {
    saveState({ ...defaultState });
    saveLearning({ ...defaultLearning });
    broadcast("学習データを初期化しました。");
  }
});
