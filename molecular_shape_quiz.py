"""분자 모양(VSEPR) 퀴즈 게임 (2022 개정 교육과정 고등학교 화학 2단원: 화학결합과 분자의 세계)

분자식을 보고 VSEPR 모형에 따른 분자 모양을 4지선다로 맞히는 복습 퀴즈.

실행: pip install pygame
     python molecular_shape_quiz.py
"""
import random
import sys

import pygame

WIDTH, HEIGHT = 900, 640
FPS = 60

BG_COLOR = (16, 20, 30)
PANEL_COLOR = (24, 30, 44)
BUTTON_COLOR = (36, 44, 62)
NEUTRAL_GREEN = (70, 210, 120)
WRONG_RED = (220, 70, 70)
TEXT_COLOR = (235, 238, 245)
DIM_TEXT_COLOR = (150, 158, 176)

SUB_DIGITS = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")
FEEDBACK_FRAMES = 60  # 1초 (60fps 기준)
TIME_LIMIT_FRAMES = 5 * FPS  # 문제당 제한시간 5초
QUESTIONS_PER_GAME = 10

SHAPES = ["직선형", "평면삼각형", "정사면체형", "삼각뿔형", "굽은형"]

# 분자식 -> VSEPR 모양 매핑 (모양 유형별로 6개씩, 총 30개)
MOLECULE_SHAPES = {
    "BeCl2": "직선형", "BeF2": "직선형", "BeH2": "직선형",
    "CO2": "직선형", "CS2": "직선형", "HgCl2": "직선형",

    "BF3": "평면삼각형", "BCl3": "평면삼각형", "BBr3": "평면삼각형",
    "BI3": "평면삼각형", "SO3": "평면삼각형", "AlCl3": "평면삼각형",

    "CH4": "정사면체형", "CCl4": "정사면체형", "CF4": "정사면체형",
    "CBr4": "정사면체형", "SiH4": "정사면체형", "SiCl4": "정사면체형",

    "NH3": "삼각뿔형", "PH3": "삼각뿔형", "AsH3": "삼각뿔형",
    "NF3": "삼각뿔형", "PF3": "삼각뿔형", "NCl3": "삼각뿔형",

    "H2O": "굽은형", "H2S": "굽은형", "H2Se": "굽은형",
    "OF2": "굽은형", "SO2": "굽은형", "Cl2O": "굽은형",
}
MOLECULE_LIST = list(MOLECULE_SHAPES.keys())


def format_formula(formula):
    return formula.translate(SUB_DIGITS)


def build_question(formula):
    correct = MOLECULE_SHAPES[formula]
    distractors = [s for s in SHAPES if s != correct]
    random.shuffle(distractors)
    choices = [correct] + distractors[:3]
    random.shuffle(choices)
    return {"formula": formula, "correct": correct, "choices": choices}


class BaseButton:
    """정답 선택 버튼과 시작/재도전 버튼에서 재사용하는 클릭형 UI 버튼."""

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


def make_choice_buttons(choices):
    margin = 40
    gap = 20
    btn_w = (WIDTH - margin * 2 - gap * 3) / 4
    btn_h = 90
    y = HEIGHT - btn_h - 60
    return [BaseButton((margin + i * (btn_w + gap), y, btn_w, btn_h), choice) for i, choice in enumerate(choices)]


def main():
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("분자 모양 퀴즈")
    clock = pygame.time.Clock()

    font_big = pygame.font.SysFont("malgungothic,arial", 64, bold=True)
    font_mid = pygame.font.SysFont("malgungothic,arial", 26, bold=True)
    font_small = pygame.font.SysFont("malgungothic,arial", 20)
    font_btn = pygame.font.SysFont("malgungothic,arial", 22, bold=True)

    start_btn = BaseButton((WIDTH / 2 - 90, HEIGHT / 2 + 80, 180, 52), "시작하기")
    retry_btn = BaseButton((WIDTH / 2 - 90, HEIGHT / 2 + 80, 180, 52), "다시 도전하기")

    def reset_game():
        order = random.sample(MOLECULE_LIST, QUESTIONS_PER_GAME)
        question = build_question(order[0])
        return {
            "order": order,
            "index": 0,
            "question": question,
            "buttons": make_choice_buttons(question["choices"]),
            "score": 0,
            "feedback": None,  # None / "correct" / "wrong" / "timeout"
            "feedback_timer": 0,
            "time_left": TIME_LIMIT_FRAMES,
            "started": False,
            "game_over": False,
        }

    state = reset_game()

    def next_question():
        state["index"] += 1
        if state["index"] >= len(state["order"]):
            state["game_over"] = True
            return
        formula = state["order"][state["index"]]
        state["question"] = build_question(formula)
        state["buttons"] = make_choice_buttons(state["question"]["choices"])
        state["feedback"] = None
        state["time_left"] = TIME_LIMIT_FRAMES

    def choose(label):
        if state["feedback"] is not None:
            return
        correct = state["question"]["correct"]
        for btn in state["buttons"]:
            if btn.label == correct:
                btn.state = "correct"
        if label == correct:
            state["score"] += 1
            state["feedback"] = "correct"
        else:
            for btn in state["buttons"]:
                if btn.label == label:
                    btn.state = "wrong"
            state["feedback"] = "wrong"
        state["feedback_timer"] = FEEDBACK_FRAMES

    def timeout():
        if state["feedback"] is not None:
            return
        correct = state["question"]["correct"]
        for btn in state["buttons"]:
            if btn.label == correct:
                btn.state = "correct"
        state["feedback"] = "timeout"
        state["feedback_timer"] = FEEDBACK_FRAMES

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
                if state["feedback"] is None:
                    for btn in state["buttons"]:
                        if btn.is_clicked(event.pos):
                            choose(btn.label)
            elif event.type == pygame.KEYDOWN:
                if not state["started"] or state["game_over"]:
                    if event.key in (pygame.K_RETURN, pygame.K_SPACE):
                        state.clear()
                        state.update(reset_game())
                        state["started"] = True
                    continue
                if state["feedback"] is None and event.key in (pygame.K_1, pygame.K_2, pygame.K_3, pygame.K_4):
                    idx = (pygame.K_1, pygame.K_2, pygame.K_3, pygame.K_4).index(event.key)
                    if idx < len(state["buttons"]):
                        choose(state["buttons"][idx].label)

        if state["started"] and not state["game_over"]:
            if state["feedback"] is None:
                state["time_left"] -= 1
                if state["time_left"] <= 0:
                    timeout()
            else:
                state["feedback_timer"] -= 1
                if state["feedback_timer"] <= 0:
                    next_question()

        # ---------- 그리기 ----------
        screen.fill(BG_COLOR)

        score_label = font_mid.render(f"Score: {state['score']}", True, TEXT_COLOR)
        screen.blit(score_label, (16, 4))
        remain_label = font_mid.render(f"남은 문제: {len(state['order']) - state['index']}", True, DIM_TEXT_COLOR)
        screen.blit(remain_label, (WIDTH - remain_label.get_width() - 16, 4))
        pygame.draw.line(screen, (60, 68, 90), (0, 34), (WIDTH, 34), 1)

        if state["started"] and not state["game_over"]:
            panel_rect = pygame.Rect(WIDTH / 2 - 260, 100, 520, 220)
            pygame.draw.rect(screen, PANEL_COLOR, panel_rect, border_radius=14)
            tag_label = font_small.render("이 분자의 모양은?", True, DIM_TEXT_COLOR)
            screen.blit(tag_label, (WIDTH / 2 - tag_label.get_width() / 2, 130))
            formula_label = font_big.render(format_formula(state["question"]["formula"]), True, TEXT_COLOR)
            screen.blit(formula_label, (WIDTH / 2 - formula_label.get_width() / 2, 190))

            frac = max(state["time_left"], 0) / TIME_LIMIT_FRAMES
            bar_w, bar_h = 400, 8
            bar_x, bar_y = WIDTH / 2 - bar_w / 2, 350
            timer_color = NEUTRAL_GREEN if frac > 0.4 else (230, 180, 60) if frac > 0.2 else WRONG_RED
            pygame.draw.rect(screen, PANEL_COLOR, (bar_x, bar_y, bar_w, bar_h), border_radius=4)
            pygame.draw.rect(screen, timer_color, (bar_x, bar_y, bar_w * frac, bar_h), border_radius=4)
            seconds_left = (max(state["time_left"], 0) + FPS - 1) // FPS
            if state["feedback"] is None:
                time_label = font_small.render(f"{seconds_left}s", True, DIM_TEXT_COLOR)
                screen.blit(time_label, (WIDTH / 2 - time_label.get_width() / 2, bar_y + 14))

            for btn in state["buttons"]:
                btn.draw(screen, font_btn)

        if not state["started"]:
            overlay_text(screen, font_big, font_small,
                         "분자 모양 퀴즈",
                         ["분자식을 보고 VSEPR 모형에 따른 분자 모양을 골라보세요.",
                          "직선형 / 평면삼각형 / 정사면체형 / 삼각뿔형 / 굽은형",
                          f"30개 분자 중 {QUESTIONS_PER_GAME}개를 무작위로 출제합니다. 문제당 제한시간은 5초입니다.",
                          "버튼 클릭 또는 숫자키 1~4로 선택합니다."])
            start_btn.draw(screen, font_small)
        elif state["game_over"]:
            overlay_text(screen, font_big, font_small,
                         "결과",
                         [f"최종 점수: {state['score']} / {len(state['order'])}"])
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
