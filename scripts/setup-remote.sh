#!/bin/bash
# =============================================================
#  Mac 원격 제어 세팅 스크립트 (Tailscale + SSH + tmux)
#
#  모바일에서 Mac의 Claude Code를 원격으로 실행하기 위한
#  원타임 세팅 스크립트입니다.
#
#  사용법: Mac 터미널에서 실행
#    chmod +x scripts/setup-remote.sh
#    ./scripts/setup-remote.sh
# =============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

step=0
total_steps=5

print_step() {
  step=$((step + 1))
  echo ""
  echo -e "${BLUE}[$step/$total_steps]${NC} ${GREEN}$1${NC}"
  echo "-------------------------------------------"
}

print_warn() {
  echo -e "${YELLOW}  ⚠️  $1${NC}"
}

print_ok() {
  echo -e "${GREEN}  ✅ $1${NC}"
}

print_fail() {
  echo -e "${RED}  ❌ $1${NC}"
}

echo ""
echo "============================================================"
echo "  🖥️  Mac 원격 제어 세팅 (Tailscale + SSH + tmux)"
echo "  📱 모바일에서 Mac을 원격으로 제어할 수 있게 합니다"
echo "============================================================"
echo ""

# ----- Step 1: Homebrew 확인 -----
print_step "Homebrew 확인"

if command -v brew &> /dev/null; then
  print_ok "Homebrew 이미 설치됨: $(brew --version | head -1)"
else
  echo "  Homebrew 설치 중..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  print_ok "Homebrew 설치 완료"
fi

# ----- Step 2: Tailscale 설치 -----
print_step "Tailscale 설치"

if command -v tailscale &> /dev/null; then
  print_ok "Tailscale 이미 설치됨"
else
  echo "  Tailscale 설치 중..."
  brew install --cask tailscale
  print_ok "Tailscale 설치 완료"
fi

# Tailscale 실행 확인
if tailscale status &> /dev/null 2>&1; then
  TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "확인필요")
  print_ok "Tailscale 연결됨 - IP: $TAILSCALE_IP"
else
  print_warn "Tailscale 앱을 실행하고 로그인해주세요"
  echo "  1. Spotlight(Cmd+Space) → 'Tailscale' 검색 → 실행"
  echo "  2. 상단 메뉴바의 Tailscale 아이콘 클릭 → 로그인"
  echo ""
  read -p "  로그인 완료 후 Enter를 누르세요... "

  if tailscale status &> /dev/null 2>&1; then
    TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "확인필요")
    print_ok "Tailscale 연결됨 - IP: $TAILSCALE_IP"
  else
    print_warn "나중에 Tailscale 앱을 실행하고 로그인하세요"
    TAILSCALE_IP="(나중에 확인)"
  fi
fi

# ----- Step 3: SSH 활성화 -----
print_step "SSH(원격 로그인) 활성화"

if systemsetup -getremotelogin 2>/dev/null | grep -q "On"; then
  print_ok "SSH 이미 활성화됨"
else
  echo "  SSH 활성화를 위해 관리자 비밀번호가 필요합니다."
  sudo systemsetup -setremotelogin on
  if [ $? -eq 0 ]; then
    print_ok "SSH 활성화 완료"
  else
    print_fail "자동 활성화 실패. 수동으로 설정해주세요:"
    echo "  시스템 설정 → 일반 → 공유 → '원격 로그인' 켜기"
  fi
fi

# ----- Step 4: tmux 설치 -----
print_step "tmux 설치 (세션 유지용)"

if command -v tmux &> /dev/null; then
  print_ok "tmux 이미 설치됨: $(tmux -V)"
else
  echo "  tmux 설치 중..."
  brew install tmux
  print_ok "tmux 설치 완료"
fi

# ----- Step 5: 편의 스크립트 생성 -----
print_step "편의 명령어 설정"

# ~/.claude-remote 에 alias 모음 생성
ALIAS_FILE="$HOME/.claude-remote"
cat > "$ALIAS_FILE" << 'ALIASES'
# Claude 원격 제어 편의 명령어
# tmux 세션에서 Claude Code 실행
alias cc='tmux new-session -A -s claude "claude"'

# 스크래퍼 실행 (키워드 인자)
scrape() {
  local keyword="${1:-시세이도 리바이탈에센스 스킨 글로우 파운데이션}"
  cd ~/Basic 2>/dev/null || cd ~/projects/Basic 2>/dev/null || { echo "Basic 폴더를 찾을 수 없습니다"; return 1; }
  npm run scrape -- --keyword "$keyword"
}

# tmux 세션 목록
alias tls='tmux list-sessions 2>/dev/null || echo "활성 세션 없음"'

# tmux 세션 복귀
alias ta='tmux attach -t'
ALIASES

# .zshrc에 source 추가 (중복 방지)
SHELL_RC="$HOME/.zshrc"
if [ -f "$HOME/.bashrc" ] && [ ! -f "$HOME/.zshrc" ]; then
  SHELL_RC="$HOME/.bashrc"
fi

if ! grep -q "claude-remote" "$SHELL_RC" 2>/dev/null; then
  echo "" >> "$SHELL_RC"
  echo "# Claude 원격 제어 명령어" >> "$SHELL_RC"
  echo "source ~/.claude-remote" >> "$SHELL_RC"
  print_ok "편의 명령어 추가 완료 (~/.claude-remote)"
else
  print_ok "편의 명령어 이미 설정됨"
fi

# ----- 완료 -----
echo ""
echo ""
echo "============================================================"
echo -e "  ${GREEN}🎉 세팅 완료!${NC}"
echo "============================================================"
echo ""
echo "  📌 Mac 정보"
echo "  ├─ 사용자: $(whoami)"
echo "  ├─ Tailscale IP: ${TAILSCALE_IP:-확인필요}"
echo "  └─ SSH 포트: 22"
echo ""
echo "============================================================"
echo "  📱 폰에서 해야 할 것 (2가지)"
echo "============================================================"
echo ""
echo "  1️⃣  Tailscale 앱 설치 (App Store)"
echo "     → 같은 계정으로 로그인"
echo ""
echo "  2️⃣  Termius 앱 설치 (App Store, 무료)"
echo "     → 새 호스트 추가:"
echo "        Host: ${TAILSCALE_IP:-Tailscale에서 확인}"
echo "        User: $(whoami)"
echo "        Port: 22"
echo ""
echo "============================================================"
echo "  🚀 사용법"
echo "============================================================"
echo ""
echo "  폰에서 Termius로 Mac 접속 후:"
echo ""
echo "  # Claude Code 실행 (tmux 세션)"
echo "  cc"
echo ""
echo "  # 가격 스크래퍼 실행"
echo "  scrape \"아이폰 16 프로\""
echo ""
echo "  # 기존 세션 복귀 (연결 끊겼을 때)"
echo "  ta claude"
echo ""
echo "  # 세션 목록 확인"
echo "  tls"
echo ""
echo "============================================================"
echo ""
