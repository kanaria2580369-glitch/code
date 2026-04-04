import random
from dataclasses import dataclass


@dataclass
class Character:
    name: str
    hp: int
    max_hp: int
    attack: int
    defense: int
    potions: int = 2

    def is_alive(self) -> bool:
        return self.hp > 0

    def damage(self, amount: int) -> int:
        taken = max(1, amount - self.defense)
        self.hp = max(0, self.hp - taken)
        return taken

    def heal(self, amount: int) -> int:
        before = self.hp
        self.hp = min(self.max_hp, self.hp + amount)
        return self.hp - before


ENEMIES = [
    Character("ゴブリン", 18, 18, 7, 1),
    Character("スケルトン", 24, 24, 8, 2),
    Character("オーク", 30, 30, 10, 3),
    Character("ドラゴンの幼体", 40, 40, 12, 4),
]


def choose_job() -> Character:
    jobs = {
        "1": Character("剣士", 42, 42, 11, 3),
        "2": Character("魔法使い", 30, 30, 14, 1),
        "3": Character("聖騎士", 48, 48, 9, 4),
    }
    print("職業を選んでください:")
    print("1) 剣士  2) 魔法使い  3) 聖騎士")
    while True:
        choice = input("> ").strip()
        if choice in jobs:
            return jobs[choice]
        print("1〜3の番号で選んでください。")


def player_turn(player: Character, enemy: Character) -> bool:
    print("\n行動を選んでください: 1) 攻撃 2) ポーション 3) 防御")
    action = input("> ").strip()

    if action == "1":
        crit = 2 if random.random() < 0.15 else 1
        base = player.attack + random.randint(0, 5)
        dmg = enemy.damage(base * crit)
        if crit == 2:
            print(f"会心の一撃！ {enemy.name}に{dmg}ダメージ！")
        else:
            print(f"{enemy.name}に{dmg}ダメージ！")
        return False

    if action == "2":
        if player.potions <= 0:
            print("ポーションがない！")
            return False
        player.potions -= 1
        healed = player.heal(random.randint(12, 20))
        print(f"HPを{healed}回復した！（残りポーション: {player.potions}）")
        return False

    if action == "3":
        print("身を守る体勢を取った！ 次の被ダメージが軽減される。")
        return True

    print("行動に失敗した…隙ができた！")
    return False


def enemy_turn(player: Character, enemy: Character, defended: bool) -> None:
    base = enemy.attack + random.randint(0, 4)
    if defended:
        base = max(1, base // 2)
    dmg = player.damage(base)
    print(f"{enemy.name}の攻撃！ {player.name}は{dmg}ダメージ受けた。")


def battle(player: Character, enemy: Character) -> bool:
    print(f"\n--- {enemy.name} が現れた！ ---")
    while player.is_alive() and enemy.is_alive():
        print(f"\n{player.name} HP: {player.hp}/{player.max_hp} | {enemy.name} HP: {enemy.hp}/{enemy.max_hp}")
        defended = player_turn(player, enemy)
        if enemy.is_alive():
            enemy_turn(player, enemy, defended)
    if player.is_alive():
        print(f"{enemy.name}を倒した！")
        player.heal(8)
        return True
    print("あなたは倒れてしまった…")
    return False


def main() -> None:
    print("=== 迷宮の王冠 - テキストRPG ===")
    name = input("冒険者の名前を入力してください: ").strip() or "名無し"
    player = choose_job()
    player.name = f"{name}({player.name})"

    enemies = [Character(e.name, e.hp, e.max_hp, e.attack, e.defense) for e in ENEMIES]
    random.shuffle(enemies)

    for floor, enemy in enumerate(enemies, start=1):
        print(f"\n====== 第{floor}層 ======")
        if not battle(player, enemy):
            print("ゲームオーバー")
            return

    print("\n王冠を手に入れた！あなたの勝利だ！")


if __name__ == "__main__":
    main()
