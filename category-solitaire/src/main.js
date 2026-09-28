// 앱 시작점: 주소(# 뒤)에 따라 화면을 고른다
//   #/            학생 입장 (수업 코드 + 학번)
//   #/join/코드    학생 입장 (수업 코드 미리 채움 — 교사가 공유하는 주소)
//   #/teacher...  교사 화면 (로그인 → 수업 / 게임 세트)
import './style.css';
import { api } from './api.js';
import { startGame } from './board.js';
import { showStudentEntry } from './student.js';
import { showTeacher } from './teacher.js';

const app = document.getElementById('app');
let currentGame = null; // 진행 중인 게임 (다른 화면으로 가면 타이머 정리)

const ctx = {
  app,
  route,
  applyTheme(theme) {
    document.documentElement.dataset.theme = theme || 'blue';
  },
  goStudent() { location.hash = '#/'; },
  goTeacher() { location.hash = '#/teacher'; },
  // 게임 시작 (끝나거나 그만두면 handlers.onEnd / onQuit)
  runGame(set, settings, handlers) {
    stopGame();
    window.scrollTo(0, 0);
    ctx.applyTheme(settings.theme);
    currentGame = startGame(app, set, settings, {
      onEnd: (r) => { currentGame = null; handlers.onEnd(r); },
      onQuit: () => { currentGame = null; handlers.onQuit(); },
    });
  },
};

function stopGame() {
  currentGame?.stop();
  currentGame = null;
}

function route() {
  stopGame();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'teacher') return showTeacher(ctx, parts.slice(1));
  if (parts[0] === 'join') return showStudentEntry(ctx, parts[1] || '');
  return showStudentEntry(ctx);
}

// 가입 인증·비밀번호 재설정 메일의 링크로 돌아왔을 때 교사 화면으로 보낸다
api.onAuthChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    history.replaceState(null, '', location.pathname + '#/teacher/new-password');
    route();
  } else if (event === 'SIGNED_IN' && new URLSearchParams(location.search).has('code')) {
    history.replaceState(null, '', location.pathname + '#/teacher');
    route();
  }
});

window.addEventListener('hashchange', route);
route();
