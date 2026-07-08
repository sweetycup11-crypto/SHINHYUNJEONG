"""몰과 화학반응식의 양적 관계 복습 미니게임 (2022 개정 교육과정 고등학교 화학 1단원)

상단에 제시된 균형 화학반응식과 문제를 보고, 정답에 해당하는 값이 적힌 채
떨어지는 블록을 조준해 처치하는 슈팅 게임.

실행: pip install pygame
     python mole_stoichiometry_shooter.py
"""
import random
import sys

import pygame

WIDTH, HEIGHT = 900, 720
FPS = 60

CANNON_Y = HEIGHT - 90
BULLET_SPEED = 10
BLOCK_W, BLOCK_H = 150, 58
BLOCK_FALL_SPEED_RANGE = (0.5, 0.8)
WAVE_PAUSE_FRAMES = 40

BG_COLOR = (16, 20, 30)
PANEL_COLOR = (24, 30, 44)
BLOCK_COLOR = (90, 130, 200)
NEUTRAL_GREEN = (70, 210, 120)
WRONG_FLASH_COLOR = (220, 70, 70)
TEXT_COLOR = (235, 238, 245)
DIM_TEXT_COLOR = (150, 158, 176)
CANNON_COLOR = (200, 210, 230)

SUB_DIGITS = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")
MULTIPLIERS = [0.5, 1, 1.5, 2, 2.5, 3, 4]

# 반응식: (화학식, 계수, 몰질량 g/mol)의 목록으로 반응물/생성물을 표현한다.
REACTIONS = [
    {
        "name": "물 생성 반응",
        "reactants": [("H2", 2, 2), ("O2", 1, 32)],
        "products": [("H2O", 2, 18)],
    },
    {
        "name": "암모니아 합성 반응",
        "reactants": [("N2", 1, 28), ("H2", 3, 2)],
        "products": [("NH3", 2, 17)],
    },
    {
        "name": "탄소의 연소 반응",
        "reactants": [("C", 1, 12), ("O2", 1, 32)],
        "products": [("CO2", 1, 44)],
    },
    {
        "name": "메테인의 연소 반응",
        "reactants": [("CH4", 1, 16), ("O2", 2, 32)],
        "products": [("CO2", 1, 44), ("H2O", 2, 18)],
    },
    {
        "name": "마그네슘의 연소 반응",
        "reactants": [("Mg", 2, 24), ("O2", 1, 32)],
        "products": [("MgO", 2, 40)],
    },
    {
        "name": "일산화질소 생성 반응",
        "reactants": [("N2", 1, 28), ("O2", 1, 32)],
        "products": [("NO", 2, 30)],
    },
]

TYPE_LABELS = {
    "ratio": "몰비 계산",
    "mass": "몰-질량 변환",
    "limiting": "한계반응물 판단",
}


def format_species(formula):
    return formula.translate(SUB_DIGITS)


def format_equation(reaction):
    def side(species):
        terms = []
        for formula, coeff, _ in species:
            prefix = "" if coeff == 1 else str(coeff)
            terms.append(f"{prefix}{format_species(formula)}")
        return " + ".join(terms)

    return f"{side(reaction['reactants'])} → {side(reaction['products'])}"


def fmt_num(value):
    return f"{value:g}"


def build_candidates(correct, pool, need=3):
    """정답과 겹치지 않는 오답 후보를 pool에서 뽑고, 부족하면 정답 근처 값으로 채운다."""
    seen = {round(correct, 2)}
    result = []
    for value in pool:
        if value is None:
            continue
        value = round(value, 2)
        if value <= 0 or value in seen:
            continue
        seen.add(value)
        result.append(value)
    random.shuffle(result)
    result = result[:need]
    step = 1
    while len(result) < need:
        candidate = round(correct + 0.5 * step, 2)
        if candidate > 0 and candidate not in seen:
            seen.add(candidate)
            result.append(candidate)
        step += 1
    return result


def generate_ratio_question(reaction):
    reactants = [(f, c, m, "reactant") for f, c, m in reaction["reactants"]]
    products = [(f, c, m, "product") for f, c, m in reaction["products"]]
    given = random.choice(reactants)
    target = random.choice([s for s in reactants + products if s[0] != given[0]])

    x = random.choice(MULTIPLIERS)
    given_mol = round(given[1] * x, 2)
    target_mol = round(target[1] * x, 2)
    verb = "생성되는" if target[3] == "product" else "필요한"

    pool = [
        given_mol,
        given_mol * 2,
        target_mol * 2,
        target_mol / 2,
        given_mol * given[1] / target[1],
        target_mol + given[1],
        max(target_mol - given[1], 0),
    ]
    distractors = build_candidates(target_mol, pool, need=3)

    blocks = [{"label": f"{fmt_num(target_mol)} mol", "correct": True}]
    blocks += [{"label": f"{fmt_num(v)} mol", "correct": False} for v in distractors]

    return {
        "type": "ratio",
        "reaction_name": reaction["name"],
        "equation": format_equation(reaction),
        "question_lines": [
            f"{format_species(given[0])} {fmt_num(given_mol)} mol이 완전히 반응할 때,",
            f"{verb} {format_species(target[0])}은(는) 몇 mol일까요?",
        ],
        "explanation": (
            f"해설: 계수비 {given[1]}:{target[1]} 이용 -> "
            f"{fmt_num(given_mol)} mol x ({target[1]}/{given[1]}) = {fmt_num(target_mol)} mol"
        ),
        "blocks": blocks,
    }


def generate_mass_question(reaction):
    species = reaction["reactants"] + reaction["products"]
    formula, coeff, molar_mass = random.choice(species)

    x = random.choice(MULTIPLIERS)
    mol = round(coeff * x, 2)
    mass = round(mol * molar_mass, 1)

    pool = [
        mass * molar_mass,
        mass / (molar_mass * 2) if molar_mass else None,
        mol * 2,
        mol / 2,
        mol + 1,
        max(mol - 1, 0.5),
        mass,
    ]
    distractors = build_candidates(mol, pool, need=3)

    blocks = [{"label": f"{fmt_num(mol)} mol", "correct": True}]
    blocks += [{"label": f"{fmt_num(v)} mol", "correct": False} for v in distractors]

    return {
        "type": "mass",
        "reaction_name": reaction["name"],
        "equation": format_equation(reaction),
        "question_lines": [
            f"{format_species(formula)} {fmt_num(mass)} g은 몇 mol일까요?",
            f"(힌트: {format_species(formula)} 1 mol = {molar_mass} g)",
        ],
        "explanation": (
            f"해설: 몰수 = 질량 ÷ 몰질량 = {fmt_num(mass)} g ÷ {molar_mass} g/mol = {fmt_num(mol)} mol"
        ),
        "blocks": blocks,
    }


def generate_limiting_question(reaction):
    (fa, ca, _), (fb, cb, _) = reaction["reactants"]
    xa, xb = random.sample(MULTIPLIERS, 2)
    mol_a = round(ca * xa, 2)
    mol_b = round(cb * xb, 2)
    ratio_a = mol_a / ca
    ratio_b = mol_b / cb
    correct_formula = fa if ratio_a < ratio_b else fb

    blocks = [
        {"label": format_species(fa), "correct": correct_formula == fa},
        {"label": format_species(fb), "correct": correct_formula == fb},
        {"label": "정답없음", "correct": False},
    ]

    return {
        "type": "limiting",
        "reaction_name": reaction["name"],
        "equation": format_equation(reaction),
        "question_lines": [
            f"{format_species(fa)} {fmt_num(mol_a)} mol과 {format_species(fb)} {fmt_num(mol_b)} mol을 반응시킬 때,",
            "한계반응물은 무엇일까요?",
        ],
        "explanation": (
            f"해설: {format_species(fa)}는 {fmt_num(mol_a)}÷{ca}={fmt_num(round(ratio_a, 2))}, "
            f"{format_species(fb)}는 {fmt_num(mol_b)}÷{cb}={fmt_num(round(ratio_b, 2))} "
            "-> 값이 더 작은 쪽이 한계반응물"
        ),
        "blocks": blocks,
    }


def generate_question():
    reaction = random.choice(REACTIONS)
    qtype = random.choice(("ratio", "mass", "limiting"))
    if qtype == "ratio":
        return generate_ratio_question(reaction)
    if qtype == "mass":
        return generate_mass_question(reaction)
    return generate_limiting_question(reaction)


class Block:
    def __init__(self, label, correct, x, y, speed):
        self.label = label
        self.correct = correct
        self.x = x
        self.y = y
        self.speed = speed
        self.state = "falling"  # falling -> hit -> dead
        self.anim_timer = 0

    def rect(self):
        return pygame.Rect(self.x - BLOCK_W / 2, self.y - BLOCK_H / 2, BLOCK_W, BLOCK_H)

    def update(self):
        if self.state == "falling":
            self.y += self.speed
        elif self.state == "hit":
            self.anim_timer += 1
            if self.anim_timer > 16:
                self.state = "dead"

    def draw(self, surf, font):
        if self.state == "falling":
            color = BLOCK_COLOR
        else:
            t = min(self.anim_timer / 16, 1.0)
            target_color = NEUTRAL_GREEN if self.correct else WRONG_FLASH_COLOR
            color = tuple(int(BLOCK_COLOR[i] + (target_color[i] - BLOCK_COLOR[i]) * t) for i in range(3))
        rect = self.rect()
        pygame.draw.rect(surf, color, rect, border_radius=10)
        pygame.draw.rect(surf, (0, 0, 0), rect, 2, border_radius=10)
        label = font.render(self.label, True, TEXT_COLOR)
        surf.blit(label, (self.x - label.get_width() / 2, self.y - label.get_height() / 2))


class Bullet:
    def __init__(self, x):
        self.x = x
        self.y = CANNON_Y - 24

    def update(self):
        self.y -= BULLET_SPEED

    def draw(self, surf):
        pygame.draw.circle(surf, (250, 220, 120), (int(self.x), int(self.y)), 6)


class BaseButton:
    """시작/재도전 화면 등에서 재사용하는 클릭형 UI 버튼."""

    def __init__(self, rect, label):
        self.rect = pygame.Rect(rect)
        self.label = label

    def draw(self, surf, font):
        pygame.draw.rect(surf, (255, 170, 60), self.rect, border_radius=999)
        label = font.render(self.label, True, (26, 16, 6))
        surf.blit(label, (self.rect.centerx - label.get_width() / 2, self.rect.centery - label.get_height() / 2))

    def is_clicked(self, pos):
        return self.rect.collidepoint(pos)


def spawn_wave(question):
    n = len(question["blocks"])
    margin = 90
    usable = WIDTH - margin * 2
    blocks = []
    for i, candidate in enumerate(question["blocks"]):
        x = margin + usable * (i + 0.5) / n + random.randint(-12, 12)
        y = -BLOCK_H - i * 60
        speed = random.uniform(*BLOCK_FALL_SPEED_RANGE)
        blocks.append(Block(candidate["label"], candidate["correct"], x, y, speed))
    random.shuffle(blocks)
    return blocks


def main():
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("몰과 화학반응식의 양적 관계 미니게임")
    clock = pygame.time.Clock()

    font_big = pygame.font.SysFont("malgungothic,arial", 40, bold=True)
    font_mid = pygame.font.SysFont("malgungothic,arial", 24, bold=True)
    font_small = pygame.font.SysFont("malgungothic,arial", 20)
    font_tag = pygame.font.SysFont("malgungothic,arial", 17)
    font_block = pygame.font.SysFont("malgungothic,arial", 18, bold=True)

    start_btn = BaseButton((WIDTH / 2 - 90, HEIGHT / 2 + 80, 180, 52), "시작하기")
    retry_btn = BaseButton((WIDTH / 2 - 90, HEIGHT / 2 + 80, 180, 52), "다시 도전하기")

    def reset_game():
        question = generate_question()
        return {
            "cannon_x": WIDTH / 2,
            "question": question,
            "blocks": spawn_wave(question),
            "bullets": [],
            "score": 0,
            "lives": 5,
            "correct_count": 0,
            "total_count": 1,
            "explanation": "",
            "explanation_timer": 0,
            "wave_pending": False,
            "wave_timer": 0,
            "started": False,
            "game_over": False,
        }

    state = reset_game()

    def find_target(blocks):
        return next((b for b in blocks if b.correct), None)

    def next_wave():
        question = generate_question()
        state["question"] = question
        state["blocks"] = spawn_wave(question)
        state["bullets"] = []
        state["total_count"] += 1
        state["wave_pending"] = False

    def show_explanation(text):
        state["explanation"] = text
        state["explanation_timer"] = 90

    def fire(x):
        state["bullets"].append(Bullet(x))

    running = True
    while running:
        clock.tick(FPS)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.MOUSEMOTION:
                state["cannon_x"] = max(20, min(WIDTH - 20, event.pos[0]))
            elif event.type == pygame.MOUSEBUTTONDOWN:
                if not state["started"] or state["game_over"]:
                    btn = retry_btn if state["game_over"] else start_btn
                    if btn.is_clicked(event.pos):
                        state.clear()
                        state.update(reset_game())
                        state["started"] = True
                    continue
                state["cannon_x"] = max(20, min(WIDTH - 20, event.pos[0]))
                fire(state["cannon_x"])
            elif event.type == pygame.KEYDOWN:
                if not state["started"] or state["game_over"]:
                    if event.key in (pygame.K_RETURN, pygame.K_SPACE):
                        state.clear()
                        state.update(reset_game())
                        state["started"] = True
                    continue
                if event.key == pygame.K_SPACE:
                    fire(state["cannon_x"])

        keys = pygame.key.get_pressed()
        if state["started"] and not state["game_over"]:
            if keys[pygame.K_LEFT] or keys[pygame.K_a]:
                state["cannon_x"] = max(20, state["cannon_x"] - 7)
            if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
                state["cannon_x"] = min(WIDTH - 20, state["cannon_x"] + 7)

        if state["started"] and not state["game_over"]:
            for block in state["blocks"]:
                block.update()
            for bullet in state["bullets"]:
                bullet.update()
            state["bullets"] = [b for b in state["bullets"] if b.y > -20]

            for bullet in state["bullets"][:]:
                for block in state["blocks"]:
                    if block.state != "falling":
                        continue
                    if block.rect().collidepoint(bullet.x, bullet.y):
                        block.state = "hit"
                        if block.correct:
                            state["score"] += 10
                            state["correct_count"] += 1
                        else:
                            state["lives"] -= 1
                            show_explanation(state["question"]["explanation"])
                        if bullet in state["bullets"]:
                            state["bullets"].remove(bullet)
                        break

            for block in state["blocks"]:
                if block.state == "falling" and block.y - BLOCK_H / 2 > HEIGHT:
                    if block.correct:
                        state["lives"] -= 1
                        show_explanation(state["question"]["explanation"])
                    block.state = "dead"

            state["blocks"] = [b for b in state["blocks"] if b.state != "dead"]

            if state["explanation_timer"] > 0:
                state["explanation_timer"] -= 1

            if not state["wave_pending"] and find_target(state["blocks"]) is None:
                state["wave_pending"] = True
                state["wave_timer"] = WAVE_PAUSE_FRAMES
            if state["wave_pending"]:
                state["wave_timer"] -= 1
                if state["wave_timer"] <= 0:
                    next_wave()

            if state["lives"] <= 0:
                state["lives"] = 0
                state["game_over"] = True

        # ---------- 그리기 ----------
        screen.fill(BG_COLOR)

        accuracy = (state["correct_count"] / state["total_count"] * 100) if state["total_count"] else 0
        score_label = font_mid.render(f"Score: {state['score']}", True, TEXT_COLOR)
        screen.blit(score_label, (16, 4))
        acc_label = font_mid.render(f"정답률: {state['correct_count']}/{state['total_count']} ({accuracy:.0f}%)", True, NEUTRAL_GREEN)
        screen.blit(acc_label, (WIDTH / 2 - acc_label.get_width() / 2, 4))
        lives_label = font_mid.render(f"Life: {'♥ ' * max(state['lives'], 0)}".rstrip(), True, (230, 90, 110))
        screen.blit(lives_label, (WIDTH - lives_label.get_width() - 16, 4))
        pygame.draw.line(screen, (60, 68, 90), (0, 34), (WIDTH, 34), 1)

        panel_rect = pygame.Rect(16, 44, WIDTH - 32, 118)
        pygame.draw.rect(screen, PANEL_COLOR, panel_rect, border_radius=10)
        q = state["question"]
        tag_label = font_tag.render(f"[{TYPE_LABELS[q['type']]}] {q['reaction_name']}", True, DIM_TEXT_COLOR)
        screen.blit(tag_label, (WIDTH / 2 - tag_label.get_width() / 2, 52))
        eq_label = font_big.render(q["equation"], True, TEXT_COLOR)
        screen.blit(eq_label, (WIDTH / 2 - eq_label.get_width() / 2, 76))
        for i, line in enumerate(q["question_lines"]):
            line_label = font_small.render(line, True, TEXT_COLOR)
            screen.blit(line_label, (WIDTH / 2 - line_label.get_width() / 2, 122 + i * 22))

        for block in state["blocks"]:
            block.draw(screen, font_block)
        for bullet in state["bullets"]:
            bullet.draw(screen)

        if state["started"] and not state["game_over"]:
            pygame.draw.polygon(
                screen, CANNON_COLOR,
                [(state["cannon_x"] - 18, CANNON_Y + 20),
                 (state["cannon_x"] + 18, CANNON_Y + 20),
                 (state["cannon_x"], CANNON_Y - 20)],
            )

        if state["explanation_timer"] > 0:
            banner = pygame.Rect(16, HEIGHT - 56, WIDTH - 32, 40)
            pygame.draw.rect(screen, (40, 16, 20), banner, border_radius=8)
            pygame.draw.rect(screen, WRONG_FLASH_COLOR, banner, 2, border_radius=8)
            explain_label = font_small.render(state["explanation"], True, TEXT_COLOR)
            screen.blit(explain_label, (WIDTH / 2 - explain_label.get_width() / 2, HEIGHT - 48))

        if not state["started"]:
            overlay_text(screen, font_big, font_small,
                         "몰과 화학반응식의 양적 관계",
                         ["균형 화학반응식과 문제를 보고, 정답이 적힌 블록을 클릭하거나",
                          "마우스/화살표로 조준한 뒤 클릭·스페이스바로 발사해 처치하세요.",
                          "오답을 맞히거나 정답 블록을 놓치면 생명이 줄어듭니다."])
            start_btn.draw(screen, font_small)
        elif state["game_over"]:
            overlay_text(screen, font_big, font_small,
                         "GAME OVER",
                         [f"최종 점수: {state['score']}",
                          f"정답률: {state['correct_count']}/{state['total_count']} ({accuracy:.0f}%)"])
            retry_btn.draw(screen, font_small)

        pygame.display.flip()

    pygame.quit()
    sys.exit()


def overlay_text(screen, font_big, font_small, title, lines):
    overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
    overlay.fill((10, 12, 20, 190))
    screen.blit(overlay, (0, 0))

    title_surf = font_big.render(title, True, TEXT_COLOR)
    screen.blit(title_surf, (WIDTH / 2 - title_surf.get_width() / 2, HEIGHT / 2 - 150))

    for i, line in enumerate(lines):
        surf = font_small.render(line, True, DIM_TEXT_COLOR)
        screen.blit(surf, (WIDTH / 2 - surf.get_width() / 2, HEIGHT / 2 - 70 + i * 28))


if __name__ == "__main__":
    main()
