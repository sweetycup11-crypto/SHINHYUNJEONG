"""중화 반응 양적 관계 슈팅 게임 (pH Neutralizer)

내려오는 산성 물질(nMV)을 정확히 같은 양(n'M'V')의 염기 탄환으로 맞춰
중화(pH 7.0)시키는 슈팅 게임.

실행: pip install pygame
     python neutralization_shooter.py
"""
import math
import random
import sys

import pygame

WIDTH, HEIGHT = 800, 700
FPS = 60

CANNON_Y = HEIGHT - 90
BULLET_SPEED = 9
ENEMY_RADIUS = 34
BULLET_RADIUS = 7

BG_COLOR = (18, 22, 34)
PANEL_COLOR = (28, 34, 50)
ACID_COLOR = (232, 214, 48)       # BTB 산성색 (노란색)
NEUTRAL_COLOR = (70, 210, 120)    # 중성색 (초록색)
WRONG_FLASH_COLOR = (220, 70, 70)
TEXT_COLOR = (235, 238, 245)
DIM_TEXT_COLOR = (150, 158, 176)
CANNON_COLOR = (200, 210, 230)

# 산 목록: (이름, 당량수 n)
ACIDS = [
    ("HCl", 1),
    ("H2SO4", 2),
    ("H3PO4", 3),
]

# 염기 버튼 4종: (이름, 당량수 n, 농도(0.1M 단위 정수), 부피 mL, 색상)
BASE_BUTTONS = [
    {"name": "NaOH", "n": 1, "m10": 1, "v": 10, "color": (90, 160, 240)},
    {"name": "KOH", "n": 1, "m10": 2, "v": 10, "color": (150, 120, 235)},
    {"name": "Ca(OH)2", "n": 2, "m10": 1, "v": 15, "color": (235, 150, 90)},
    {"name": "Ba(OH)2", "n": 2, "m10": 2, "v": 10, "color": (90, 220, 210)},
]
for _b in BASE_BUTTONS:
    _b["eq"] = _b["n"] * _b["m10"] * _b["v"]

BASE_EQ_SET = [b["eq"] for b in BASE_BUTTONS]

V_CHOICES = [5, 10, 15, 20, 25, 30, 40, 50]


def format_conc(m10):
    return f"{m10 / 10:.1f}M"


def gen_acid():
    """버튼 중 하나와 정확히 같은 당량(eq)을 갖도록 산 스펙을 생성한다."""
    target = random.choice(BASE_EQ_SET)
    candidates = []
    for name, n in ACIDS:
        for v in V_CHOICES:
            if target % (n * v) == 0:
                m10 = target // (n * v)
                if 1 <= m10 <= 9:
                    candidates.append((name, n, m10, v))
    if not candidates:
        # 폴백: 항상 존재하는 조합 보장
        base = random.choice(BASE_BUTTONS)
        return "HCl", 1, base["m10"], base["v"]
    return random.choice(candidates)


class Enemy:
    def __init__(self, name, n, m10, v, x, speed):
        self.name = name
        self.n = n
        self.m10 = m10
        self.v = v
        self.eq = n * m10 * v
        self.x = x
        self.y = -ENEMY_RADIUS
        self.speed = speed
        self.state = "falling"  # falling -> neutralizing -> dead
        self.anim_timer = 0

    @property
    def label(self):
        return f"{format_conc(self.m10)} {self.name} {self.v}mL"

    def update(self):
        if self.state == "falling":
            self.y += self.speed
        elif self.state == "neutralizing":
            self.anim_timer += 1
            if self.anim_timer > 18:
                self.state = "dead"

    def draw(self, surf, font, small_font):
        if self.state == "falling":
            color = ACID_COLOR
            radius = ENEMY_RADIUS
        else:
            t = min(self.anim_timer / 18, 1.0)
            color = tuple(int(ACID_COLOR[i] + (NEUTRAL_COLOR[i] - ACID_COLOR[i]) * t) for i in range(3))
            radius = int(ENEMY_RADIUS * (1.0 - 0.4 * t))
        pygame.draw.circle(surf, color, (int(self.x), int(self.y)), radius)
        pygame.draw.circle(surf, (0, 0, 0), (int(self.x), int(self.y)), radius, 2)
        label = small_font.render(self.label, True, TEXT_COLOR)
        surf.blit(label, (self.x - label.get_width() / 2, self.y - radius - 20))


class Bullet:
    def __init__(self, x, base):
        self.x = x
        self.y = CANNON_Y - 30
        self.base = base
        self.eq = base["eq"]
        self.hit_flash = 0

    def update(self):
        self.y -= BULLET_SPEED

    def draw(self, surf):
        pygame.draw.circle(surf, self.base["color"], (int(self.x), int(self.y)), BULLET_RADIUS)


class WrongFlash:
    def __init__(self, x, y):
        self.x, self.y = x, y
        self.timer = 0

    def update(self):
        self.timer += 1

    def draw(self, surf, font):
        if self.timer < 15:
            text = font.render("X", True, WRONG_FLASH_COLOR)
            surf.blit(text, (self.x - text.get_width() / 2, self.y - text.get_height() / 2))


BASE_SPAWN_INTERVAL = 175
BASE_MIN_SPEED = 0.55
BASE_MAX_SPEED = 0.9
BASE_MAX_ON_SCREEN = 2
STREAK_PER_LEVEL = 4
MAX_LEVEL = 8


def recompute_difficulty(state):
    """연속 정답(streak) 4회마다 난이도 1단계 상승. 오답/실점 시 streak가 0으로
    리셋되어 기초 난이도로 되돌아간다."""
    tier = min(MAX_LEVEL - 1, state["streak"] // STREAK_PER_LEVEL)
    state["level"] = tier + 1
    state["spawn_interval"] = max(70, BASE_SPAWN_INTERVAL - tier * 14)
    state["min_speed"] = BASE_MIN_SPEED + tier * 0.12
    state["max_speed"] = BASE_MAX_SPEED + tier * 0.18
    state["max_on_screen"] = min(5, BASE_MAX_ON_SCREEN + tier // 2)


def button_rects():
    margin = 14
    btn_w = (WIDTH - margin * (len(BASE_BUTTONS) + 1)) / len(BASE_BUTTONS)
    btn_h = 70
    y = HEIGHT - btn_h - 12
    rects = []
    for i in range(len(BASE_BUTTONS)):
        x = margin + i * (btn_w + margin)
        rects.append(pygame.Rect(x, y, btn_w, btn_h))
    return rects


def main():
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("중화 반응 양적 관계 슈팅 게임")
    clock = pygame.time.Clock()

    font_big = pygame.font.SysFont("malgungothic,arial", 44, bold=True)
    font_mid = pygame.font.SysFont("malgungothic,arial", 26, bold=True)
    font_small = pygame.font.SysFont("malgungothic,arial", 22)
    font_tiny = pygame.font.SysFont("malgungothic,arial", 20, bold=True)

    rects = button_rects()

    def reset_game():
        state = {
            "cannon_x": WIDTH / 2,
            "enemies": [],
            "bullets": [],
            "flashes": [],
            "score": 0,
            "lives": 5,
            "streak": 0,
            "level": 1,
            "spawn_timer": 0,
            "game_over": False,
            "started": False,
        }
        recompute_difficulty(state)
        return state

    state = reset_game()

    def fire(base_idx):
        if state["game_over"] or not state["started"]:
            return
        base = BASE_BUTTONS[base_idx]
        state["bullets"].append(Bullet(state["cannon_x"], base))

    running = True
    while running:
        dt = clock.tick(FPS)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.MOUSEMOTION:
                state["cannon_x"] = max(20, min(WIDTH - 20, event.pos[0]))
            elif event.type == pygame.MOUSEBUTTONDOWN:
                if not state["started"] or state["game_over"]:
                    state.clear()
                    state.update(reset_game())
                    state["started"] = True
                    continue
                for i, r in enumerate(rects):
                    if r.collidepoint(event.pos):
                        fire(i)
            elif event.type == pygame.KEYDOWN:
                if not state["started"] or state["game_over"]:
                    if event.key in (pygame.K_RETURN, pygame.K_SPACE):
                        state.clear()
                        state.update(reset_game())
                        state["started"] = True
                    continue
                if event.key == pygame.K_1:
                    fire(0)
                elif event.key == pygame.K_2:
                    fire(1)
                elif event.key == pygame.K_3:
                    fire(2)
                elif event.key == pygame.K_4:
                    fire(3)

        keys = pygame.key.get_pressed()
        if state["started"] and not state["game_over"]:
            if keys[pygame.K_LEFT] or keys[pygame.K_a]:
                state["cannon_x"] = max(20, state["cannon_x"] - 7)
            if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
                state["cannon_x"] = min(WIDTH - 20, state["cannon_x"] + 7)

        if state["started"] and not state["game_over"]:
            state["spawn_timer"] += 1
            if (state["spawn_timer"] >= state["spawn_interval"]
                    and len(state["enemies"]) < state["max_on_screen"]):
                state["spawn_timer"] = 0
                name, n, m10, v = gen_acid()
                x = random.randint(60, WIDTH - 60)
                speed = random.uniform(state["min_speed"], state["max_speed"])
                state["enemies"].append(Enemy(name, n, m10, v, x, speed))

            for b in state["bullets"]:
                b.update()
            state["bullets"] = [b for b in state["bullets"] if b.y > -20]

            for e in state["enemies"]:
                e.update()

            for b in state["bullets"][:]:
                for e in state["enemies"]:
                    if e.state != "falling":
                        continue
                    dist = math.hypot(b.x - e.x, b.y - e.y)
                    if dist <= ENEMY_RADIUS:
                        if b.eq == e.eq:
                            e.state = "neutralizing"
                            state["score"] += e.eq
                            state["streak"] += 1
                            recompute_difficulty(state)
                        else:
                            state["lives"] -= 1
                            state["streak"] = 0
                            recompute_difficulty(state)
                            state["flashes"].append(WrongFlash(e.x, e.y - ENEMY_RADIUS - 40))
                        if b in state["bullets"]:
                            state["bullets"].remove(b)
                        break

            passed = [e for e in state["enemies"] if e.state == "falling" and e.y - ENEMY_RADIUS > HEIGHT]
            if passed:
                state["lives"] -= len(passed)
                state["streak"] = 0
                recompute_difficulty(state)
            state["enemies"] = [e for e in state["enemies"]
                                 if not (e.state == "falling" and e.y - ENEMY_RADIUS > HEIGHT)
                                 and e.state != "dead"]

            for f in state["flashes"]:
                f.update()
            state["flashes"] = [f for f in state["flashes"] if f.timer < 15]

            if state["lives"] <= 0:
                state["lives"] = 0
                state["game_over"] = True

        # ---------- 그리기 ----------
        screen.fill(BG_COLOR)

        pygame.draw.line(screen, (60, 68, 90), (0, 30), (WIDTH, 30), 1)
        for e in state["enemies"]:
            e.draw(screen, font_mid, font_tiny)
        for b in state["bullets"]:
            b.draw(screen)
        for f in state["flashes"]:
            f.draw(screen, font_mid)

        pygame.draw.polygon(
            screen, CANNON_COLOR,
            [(state["cannon_x"] - 18, CANNON_Y + 20),
             (state["cannon_x"] + 18, CANNON_Y + 20),
             (state["cannon_x"], CANNON_Y - 20)],
        )

        for i, r in enumerate(rects):
            base = BASE_BUTTONS[i]
            pygame.draw.rect(screen, PANEL_COLOR, r, border_radius=8)
            pygame.draw.rect(screen, base["color"], r, 3, border_radius=8)
            key_label = font_small.render(f"[{i + 1}]", True, DIM_TEXT_COLOR)
            name_label = font_small.render(base["name"], True, TEXT_COLOR)
            conc_label = font_tiny.render(f"{format_conc(base['m10'])}  {base['v']}mL", True, DIM_TEXT_COLOR)
            screen.blit(key_label, (r.x + 8, r.y + 6))
            screen.blit(name_label, (r.x + r.w / 2 - name_label.get_width() / 2, r.y + 8))
            screen.blit(conc_label, (r.x + r.w / 2 - conc_label.get_width() / 2, r.y + 36))

        score_label = font_mid.render(f"Score: {state['score']}", True, TEXT_COLOR)
        screen.blit(score_label, (16, 4))
        combo_label = font_mid.render(f"Combo: {state['streak']}  Lv.{state['level']}", True, NEUTRAL_COLOR)
        screen.blit(combo_label, (WIDTH / 2 - combo_label.get_width() / 2, 4))
        lives_label = font_mid.render(f"Life: {'♥ ' * max(state['lives'], 0)}".rstrip(), True, (230, 90, 110))
        screen.blit(lives_label, (WIDTH - lives_label.get_width() - 16, 4))

        if not state["started"]:
            overlay_text(screen, font_big, font_small,
                          "중화 반응 양적 관계 슈팅 게임",
                          ["산성 물질(nMV)을 정확히 같은 당량의 염기 탄환으로 맞춰 중화시키세요.",
                           "마우스/화살표: 대포 이동   1~4 또는 버튼 클릭: 염기 탄환 발사",
                           "연속 정답 4회마다 레벨 상승, 오답/실점 시 난이도 초기화",
                           "",
                           "시작하려면 클릭하거나 Enter를 누르세요"])
        elif state["game_over"]:
            overlay_text(screen, font_big, font_small,
                         "GAME OVER",
                         [f"최종 점수: {state['score']}   도달 레벨: {state['level']}",
                          "",
                          "다시 시작하려면 클릭하거나 Enter를 누르세요"])

        pygame.display.flip()

    pygame.quit()
    sys.exit()


def overlay_text(screen, font_big, font_small, title, lines):
    overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
    overlay.fill((10, 12, 20, 190))
    screen.blit(overlay, (0, 0))

    title_surf = font_big.render(title, True, TEXT_COLOR)
    screen.blit(title_surf, (WIDTH / 2 - title_surf.get_width() / 2, HEIGHT / 2 - 140))

    for i, line in enumerate(lines):
        surf = font_small.render(line, True, DIM_TEXT_COLOR)
        screen.blit(surf, (WIDTH / 2 - surf.get_width() / 2, HEIGHT / 2 - 60 + i * 30))


if __name__ == "__main__":
    main()
