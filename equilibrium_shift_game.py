"""화학평형과 르샤틀리에 원리 시뮬레이터 게임 (2022 개정 교육과정 고등학교 화학 3단원)

평형 반응식에 농도/온도/압력/촉매 자극을 가했을 때 평형이 어느 방향으로
이동하는지 예측하는 복습 게임.

실행: pip install pygame
     python equilibrium_shift_game.py
"""
import random
import sys

import pygame

WIDTH, HEIGHT = 960, 680
FPS = 60

BG_COLOR = (16, 20, 30)
PANEL_COLOR = (24, 30, 44)
BUTTON_COLOR = (36, 44, 62)
CHIP_COLOR = (30, 38, 54)
NEUTRAL_GREEN = (70, 210, 120)
WRONG_RED = (220, 70, 70)
REACTANT_COLOR = (90, 140, 220)
PRODUCT_COLOR = (255, 150, 70)
TEXT_COLOR = (235, 238, 245)
DIM_TEXT_COLOR = (150, 158, 176)

SUB_DIGITS = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")
FEEDBACK_FRAMES = 45          # 예측 버튼 정답/오답 색 표시 유지 시간
ANIM_STEP_FRAMES = 12         # 원이 1개 바뀌는 데 걸리는 프레임
PAUSE_AFTER_ANIM_FRAMES = 40  # 이동 애니메이션 종료 후 다음 문제 전 대기
QUESTIONS_PER_GAME = 10
POINTS_PER_QUESTION = 10
MAX_SCORE = QUESTIONS_PER_GAME * POINTS_PER_QUESTION
TIME_LIMIT_FRAMES = 7 * FPS  # 문제당 제한시간 7초

BASE_N = 6   # 반응물/생성물 원 기본 개수
DELTA_N = 2  # 평형 이동 시 늘거나 줄어드는 원 개수

# 반응식: 반응물/생성물 (화학식, 계수), 정반응의 발열/흡열 여부,
# delta_n = 생성물 기체 몰수 - 반응물 기체 몰수 (압력 자극 판정에 사용)
REACTIONS = [
    {
        "name": "암모니아 생성 반응",
        "reactants": [("N2", 1), ("H2", 3)],
        "products": [("NH3", 2)],
        "enthalpy": "exo",
        "delta_n": -2,
    },
    {
        "name": "삼산화황 생성 반응",
        "reactants": [("SO2", 2), ("O2", 1)],
        "products": [("SO3", 2)],
        "enthalpy": "exo",
        "delta_n": -1,
    },
    {
        "name": "사산화이질소의 분해 반응",
        "reactants": [("N2O4", 1)],
        "products": [("NO2", 2)],
        "enthalpy": "endo",
        "delta_n": 1,
    },
    {
        "name": "아이오딘화 수소 생성 반응",
        "reactants": [("H2", 1), ("I2", 1)],
        "products": [("HI", 2)],
        "enthalpy": "exo",
        "delta_n": 0,
    },
]

STIMULI = [
    {"key": "conc_up", "category": "농도", "label": "농도 증가 (반응물 추가)"},
    {"key": "conc_down", "category": "농도", "label": "농도 감소 (반응물 제거)"},
    {"key": "temp_up", "category": "온도", "label": "온도 증가"},
    {"key": "temp_down", "category": "온도", "label": "온도 감소"},
    {"key": "press_up", "category": "압력", "label": "압력 증가"},
    {"key": "press_down", "category": "압력", "label": "압력 감소"},
    {"key": "catalyst", "category": "촉매", "label": "촉매 추가"},
]
CATEGORIES = ["농도", "온도", "압력", "촉매"]

CHOICES = [
    {"key": "forward", "label": "정반응 이동"},
    {"key": "backward", "label": "역반응 이동"},
    {"key": "none", "label": "변화 없음"},
]


def format_species(formula):
    return formula.translate(SUB_DIGITS)


def format_equation(reaction):
    def side(species):
        terms = []
        for formula, coeff in species:
            prefix = "" if coeff == 1 else str(coeff)
            terms.append(f"{prefix}{format_species(formula)}")
        return " + ".join(terms)

    return f"{side(reaction['reactants'])}  ⇄  {side(reaction['products'])}"


def determine_shift(reaction, stimulus_key):
    if stimulus_key == "conc_up":
        return "forward"
    if stimulus_key == "conc_down":
        return "backward"
    if stimulus_key == "temp_up":
        return "backward" if reaction["enthalpy"] == "exo" else "forward"
    if stimulus_key == "temp_down":
        return "forward" if reaction["enthalpy"] == "exo" else "backward"
    if stimulus_key == "press_up":
        dn = reaction["delta_n"]
        return "forward" if dn < 0 else "backward" if dn > 0 else "none"
    if stimulus_key == "press_down":
        dn = reaction["delta_n"]
        return "backward" if dn < 0 else "forward" if dn > 0 else "none"
    return "none"  # catalyst


def build_question():
    reaction = random.choice(REACTIONS)
    stimulus = random.choice(STIMULI)
    correct = determine_shift(reaction, stimulus["key"])
    return {"reaction": reaction, "stimulus": stimulus, "correct": correct}


class BaseButton:
    """예측 선택 버튼과 시작/재도전 버튼에서 재사용하는 클릭형 UI 버튼."""

    def __init__(self, rect, label):
        self.rect = pygame.Rect(rect)
        self.label = label
        self.state = "idle"  # idle -> correct / wrong

    def draw(self, surf, font):
        color = {"idle": BUTTON_COLOR, "correct": NEUTRAL_GREEN, "wrong": WRONG_RED}[self.state]
        pygame.draw.rect(surf, color, self.rect, border_radius=12)
        pygame.draw.rect(surf, (0, 0, 0), self.rect, 2, border_radius=12)
        label = font.render(self.label, True, TEXT_COLOR)
        surf.blit(label, (self.rect.centerx - label.get_width() / 2, self.rect.centery - label.get_height() / 2))

    def is_clicked(self, pos):
        return self.rect.collidepoint(pos)


def make_prediction_buttons():
    margin = 60
    gap = 24
    btn_w = (WIDTH - margin * 2 - gap * 2) / 3
    btn_h = 70
    y = HEIGHT - btn_h - 40
    return [BaseButton((margin + i * (btn_w + gap), y, btn_w, btn_h), c["label"]) for i, c in enumerate(CHOICES)]


def circle_positions(n, center_x, top_y, per_row=6, gap=34):
    positions = []
    for i in range(n):
        row = i // per_row
        col = i % per_row
        count_in_row = min(per_row, n - row * per_row)
        row_w = (count_in_row - 1) * gap
        x = center_x - row_w / 2 + col * gap
        y = top_y + row * gap
        positions.append((x, y))
    return positions


def main():
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("화학평형 이동 시뮬레이터")
    clock = pygame.time.Clock()

    font_big = pygame.font.SysFont("malgungothic,arial", 34, bold=True)
    font_mid = pygame.font.SysFont("malgungothic,arial", 26, bold=True)
    font_small = pygame.font.SysFont("malgungothic,arial", 19)
    font_chip = pygame.font.SysFont("malgungothic,arial", 15, bold=True)
    font_btn = pygame.font.SysFont("malgungothic,arial", 20, bold=True)

    start_btn = BaseButton((WIDTH / 2 - 90, HEIGHT / 2 + 90, 180, 52), "시작하기")
    retry_btn = BaseButton((WIDTH / 2 - 90, HEIGHT / 2 + 90, 180, 52), "다시 도전하기")

    def reset_game():
        question = build_question()
        return {
            "index": 0,
            "question": question,
            "buttons": make_prediction_buttons(),
            "score": 0,
            "reactant_n": BASE_N,
            "product_n": BASE_N,
            "target_reactant_n": BASE_N,
            "target_product_n": BASE_N,
            "phase": "predicting",  # predicting -> revealing -> animating -> pausing
            "phase_timer": 0,
            "anim_timer": 0,
            "time_left": TIME_LIMIT_FRAMES,
            "started": False,
            "game_over": False,
        }

    state = reset_game()

    def next_question():
        state["index"] += 1
        if state["index"] >= QUESTIONS_PER_GAME:
            state["game_over"] = True
            return
        state["question"] = build_question()
        state["buttons"] = make_prediction_buttons()
        state["reactant_n"] = BASE_N
        state["product_n"] = BASE_N
        state["target_reactant_n"] = BASE_N
        state["target_product_n"] = BASE_N
        state["phase"] = "predicting"
        state["time_left"] = TIME_LIMIT_FRAMES

    def choose(key):
        if state["phase"] != "predicting":
            return
        correct = state["question"]["correct"]
        for btn, choice in zip(state["buttons"], CHOICES):
            if choice["key"] == correct:
                btn.state = "correct"
            elif choice["key"] == key and key != correct:
                btn.state = "wrong"
        if key == correct:
            state["score"] += POINTS_PER_QUESTION

        if correct == "forward":
            state["target_reactant_n"] = BASE_N - DELTA_N
            state["target_product_n"] = BASE_N + DELTA_N
        elif correct == "backward":
            state["target_reactant_n"] = BASE_N + DELTA_N
            state["target_product_n"] = BASE_N - DELTA_N
        else:
            state["target_reactant_n"] = BASE_N
            state["target_product_n"] = BASE_N

        state["phase"] = "revealing"
        state["phase_timer"] = FEEDBACK_FRAMES

    running = True
    while running:
        clock.tick(FPS)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.MOUSEBUTTONDOWN:
                if not state["started"] or state["game_over"]:
                    btn = retry_btn if state["game_over"] else start_btn
                    if btn.is_clicked(event.pos):
                        state.clear()
                        state.update(reset_game())
                        state["started"] = True
                    continue
                if state["phase"] == "predicting":
                    for btn, choice in zip(state["buttons"], CHOICES):
                        if btn.is_clicked(event.pos):
                            choose(choice["key"])
            elif event.type == pygame.KEYDOWN:
                if not state["started"] or state["game_over"]:
                    if event.key in (pygame.K_RETURN, pygame.K_SPACE):
                        state.clear()
                        state.update(reset_game())
                        state["started"] = True
                    continue
                if state["phase"] == "predicting" and event.key in (pygame.K_1, pygame.K_2, pygame.K_3):
                    idx = (pygame.K_1, pygame.K_2, pygame.K_3).index(event.key)
                    choose(CHOICES[idx]["key"])

        if state["started"] and not state["game_over"]:
            if state["phase"] == "predicting":
                state["time_left"] -= 1
                if state["time_left"] <= 0:
                    choose(None)
            elif state["phase"] == "revealing":
                state["phase_timer"] -= 1
                if state["phase_timer"] <= 0:
                    state["phase"] = "animating"
                    state["anim_timer"] = 0
            elif state["phase"] == "animating":
                state["anim_timer"] -= 1
                if state["anim_timer"] <= 0:
                    changed = False
                    if state["reactant_n"] != state["target_reactant_n"]:
                        state["reactant_n"] += 1 if state["target_reactant_n"] > state["reactant_n"] else -1
                        changed = True
                    if state["product_n"] != state["target_product_n"]:
                        state["product_n"] += 1 if state["target_product_n"] > state["product_n"] else -1
                        changed = True
                    state["anim_timer"] = ANIM_STEP_FRAMES
                    if not changed:
                        state["phase"] = "pausing"
                        state["phase_timer"] = PAUSE_AFTER_ANIM_FRAMES
            elif state["phase"] == "pausing":
                state["phase_timer"] -= 1
                if state["phase_timer"] <= 0:
                    next_question()

        # ---------- 그리기 ----------
        screen.fill(BG_COLOR)

        score_label = font_mid.render(f"Score: {state['score']}", True, TEXT_COLOR)
        screen.blit(score_label, (16, 4))
        pygame.draw.line(screen, (60, 68, 90), (0, 34), (WIDTH, 34), 1)

        if state["started"] and not state["game_over"]:
            q = state["question"]
            reaction = q["reaction"]
            stimulus = q["stimulus"]

            panel_rect = pygame.Rect(WIDTH / 2 - 420, 46, 840, 118)
            pygame.draw.rect(screen, PANEL_COLOR, panel_rect, border_radius=14)
            name_label = font_small.render(
                f"{reaction['name']} ({'발열' if reaction['enthalpy'] == 'exo' else '흡열'})", True, DIM_TEXT_COLOR)
            screen.blit(name_label, (WIDTH / 2 - name_label.get_width() / 2, 58))
            eq_label = font_big.render(format_equation(reaction), True, TEXT_COLOR)
            screen.blit(eq_label, (WIDTH / 2 - eq_label.get_width() / 2, 84))
            stim_label = font_mid.render(f"자극: {stimulus['label']}", True, (255, 200, 120))
            screen.blit(stim_label, (WIDTH / 2 - stim_label.get_width() / 2, 128))

            chip_w, chip_h, chip_gap = 130, 34, 14
            total_w = chip_w * 4 + chip_gap * 3
            chip_x0 = WIDTH / 2 - total_w / 2
            for i, cat in enumerate(CATEGORIES):
                cx = chip_x0 + i * (chip_w + chip_gap)
                active = cat == stimulus["category"]
                color = (255, 170, 60) if active else CHIP_COLOR
                pygame.draw.rect(screen, color, (cx, 176, chip_w, chip_h), border_radius=17)
                cat_label = font_chip.render(cat, True, (26, 16, 6) if active else DIM_TEXT_COLOR)
                screen.blit(cat_label, (cx + chip_w / 2 - cat_label.get_width() / 2,
                                         176 + chip_h / 2 - cat_label.get_height() / 2))

            if state["phase"] == "predicting":
                frac = max(state["time_left"], 0) / TIME_LIMIT_FRAMES
                bar_w, bar_h = 300, 7
                bar_x, bar_y = WIDTH / 2 - bar_w / 2, 222
                timer_color = NEUTRAL_GREEN if frac > 0.4 else (230, 180, 60) if frac > 0.2 else WRONG_RED
                pygame.draw.rect(screen, PANEL_COLOR, (bar_x, bar_y, bar_w, bar_h), border_radius=4)
                pygame.draw.rect(screen, timer_color, (bar_x, bar_y, bar_w * frac, bar_h), border_radius=4)
                seconds_left = (max(state["time_left"], 0) + FPS - 1) // FPS
                time_label = font_chip.render(f"{seconds_left}s", True, DIM_TEXT_COLOR)
                screen.blit(time_label, (WIDTH / 2 - time_label.get_width() / 2, bar_y + 11))

            reactant_label = font_small.render("반응물", True, DIM_TEXT_COLOR)
            screen.blit(reactant_label, (WIDTH * 0.27 - reactant_label.get_width() / 2, 250))
            product_label = font_small.render("생성물", True, DIM_TEXT_COLOR)
            screen.blit(product_label, (WIDTH * 0.73 - product_label.get_width() / 2, 250))

            for x, y in circle_positions(state["reactant_n"], WIDTH * 0.27, 300):
                pygame.draw.circle(screen, REACTANT_COLOR, (int(x), int(y)), 13)
            for x, y in circle_positions(state["product_n"], WIDTH * 0.73, 300):
                pygame.draw.circle(screen, PRODUCT_COLOR, (int(x), int(y)), 13)

            for btn in state["buttons"]:
                btn.draw(screen, font_btn)

        if not state["started"]:
            overlay_text(screen, font_big, font_small,
                         "화학평형 이동 시뮬레이터",
                         ["평형 반응식에 농도·온도·압력·촉매 자극을 가하면 평형이 어느 쪽으로",
                          "이동할지 예측해보세요. 정반응 이동 / 역반응 이동 / 변화 없음 중 선택합니다.",
                          f"{QUESTIONS_PER_GAME}문제, 문제당 {POINTS_PER_QUESTION}점(총 {MAX_SCORE}점 만점)이며,",
                          "문제당 제한시간은 7초입니다."])
            start_btn.draw(screen, font_small)
        elif state["game_over"]:
            overlay_text(screen, font_big, font_small,
                         "결과",
                         [f"최종 점수: {state['score']} / {MAX_SCORE}"])
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
        screen.blit(surf, (WIDTH / 2 - surf.get_width() / 2, HEIGHT / 2 - 40 + i * 26))


if __name__ == "__main__":
    main()
