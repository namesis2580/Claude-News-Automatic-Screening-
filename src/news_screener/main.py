import os
import json
import smtplib
import feedparser
import anthropic
import traceback
import re
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path

# ============================================================
# [0] 유틸리티
# ============================================================

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)
HISTORY_FILE = DATA_DIR / "report_history.json"

def forensic_clean(text: str, var_name: str) -> str:
    if text is None:
        return ""
    text = str(text)
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\xa0", "").replace("\u200b", "")
    try:
        text = text.encode("ascii", "ignore").decode("ascii")
    except Exception:
        pass
    text = text.strip()
    if "PASSWORD" in var_name.upper() or "KEY" in var_name.upper():
        print(f"  [OK] {var_name}: (hidden) [len={len(text)}]")
    else:
        print(f"  [OK] {var_name}: '{text[:40]}...' [len={len(text)}]")
    return text

def clean_rss_text(text: str) -> str:
    if text is None:
        return ""
    text = str(text)
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def clean_report_body(text: str) -> str:
    if text is None:
        return ""
    text = str(text)
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\xa0", " ")
    return text.strip()

def load_history() -> dict:
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"daily": [], "weekly": [], "monthly": [], "quarterly": [], "semi_annual": [], "annual": []}

def save_history(history: dict):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

# ============================================================
# [1] 환경변수
# ============================================================

ANTHROPIC_API_KEY = forensic_clean(os.environ.get("ANTHROPIC_API_KEY", ""), "ANTHROPIC_API_KEY")
EMAIL_USER = forensic_clean(os.environ.get("EMAIL_USER", ""), "EMAIL_USER")
EMAIL_PASSWORD = forensic_clean(os.environ.get("EMAIL_PASSWORD", ""), "EMAIL_PASSWORD")
EMAIL_RECEIVER = forensic_clean(os.environ.get("EMAIL_RECEIVER", ""), "EMAIL_RECEIVER")
SMTP_SERVER = "smtp.naver.com"

# ------------------------------------------------------------
# Model configuration — optimal price-to-performance selection
#
# Tier-1 (bulk filtering): Haiku 3.5 — cheapest, fast, ideal
#   for simple scoring tasks (~$0.80/$4 per MTok)
# Tier-2 (deep analysis): Sonnet 4 — best price/performance
#   for complex multi-chapter report generation (~$3/$15 per MTok)
# Summary: Haiku 3.5 — cheapest, sufficient for brief summaries
#
# Override via environment variables if needed.
# ------------------------------------------------------------
TIER1_MODEL = os.environ.get("TIER1_MODEL", "claude-haiku-4-5-20241022")
TIER2_MODEL = os.environ.get("TIER2_MODEL", "claude-sonnet-4-20250514")
SUMMARY_MODEL = os.environ.get("SUMMARY_MODEL", "claude-haiku-4-5-20241022")

# ============================================================
# [2] RSS 수집
# ============================================================

RSS_URLS = {
    "Yahoo Finance": "https://finance.yahoo.com/news/rssindex",
    "Investing.com": "https://www.investing.com/rss/news.rss",
    "Google News (Biz)": "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en",
    "Google News (Tech)": "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en",
    "Google News (KR Biz)": "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko",
    "Google News (KR Tech)": "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=ko&gl=KR&ceid=KR:ko",
    "Hacker News": "https://news.ycombinator.com/rss",
    "TechCrunch": "https://techcrunch.com/feed/",
    "Project Syndicate": "https://www.project-syndicate.org/rss",
    "OilPrice": "https://oilprice.com/rss/main",
    "CoinDesk": "https://www.coindesk.com/arc/outboundfeeds/rss/",
}

def fetch_news() -> list[dict]:
    print("\n[PHASE 1] RSS 수집 시작...")
    all_news = []
    for source, url in RSS_URLS.items():
        try:
            feed = feedparser.parse(url)
            count = 0
            for entry in feed.entries[:15]:
                title = clean_rss_text(getattr(entry, "title", ""))
                link = clean_rss_text(getattr(entry, "link", ""))
                pub_date = clean_rss_text(getattr(entry, "published", ""))
                content = ""
                if hasattr(entry, "content"):
                    content = entry.content[0].value
                elif hasattr(entry, "summary_detail"):
                    content = entry.summary_detail.value
                elif hasattr(entry, "summary"):
                    content = entry.summary
                content = clean_rss_text(content)[:3000]

                if title:
                    all_news.append({
                        "source": source,
                        "title": title,
                        "content": content,
                        "date": pub_date,
                        "link": link,
                    })
                    count += 1
            print(f"  [{source}] {count}건 수집")
        except Exception as e:
            print(f"  [{source}] 수집 실패: {e}")
    print(f"  총 {len(all_news)}건 수집 완료")
    return all_news

# ============================================================
# [3] Tier-1: Haiku 필터링 (상위 5% 선별)
# ============================================================

def tier1_filter(news_list: list[dict], client: anthropic.Anthropic) -> list[dict]:
    """
    Haiku 3.5로 각 뉴스의 투자 중요도를 0-100 스코어링.
    배치 처리로 API 호출 최소화.
    상위 5%만 반환.
    """
    print(f"\n[PHASE 2] Tier-1 필터링 ({TIER1_MODEL}) — {len(news_list)}건 스코어링...")

    if not news_list:
        return []

    # 배치 단위로 뉴스를 묶어서 한 번에 스코어링 (20건씩)
    BATCH_SIZE = 20
    scored_news = []

    for batch_start in range(0, len(news_list), BATCH_SIZE):
        batch = news_list[batch_start:batch_start + BATCH_SIZE]
        batch_text = ""
        for i, item in enumerate(batch):
            batch_text += f"[{i}] {item['source']} | {item['title']} | {item['content'][:500]}\n"

        scoring_prompt = f"""당신은 글로벌 투자 전략가입니다. 아래 뉴스 각각에 대해 투자 의사결정 중요도를 0-100으로 평가하세요.

평가 기준:
- 시장 전체에 미치는 영향력 (거시경제, 금리, 지정학)
- 특정 섹터/자산군에 대한 직접적 영향
- 정보의 신규성 (이미 알려진 내용 vs 새로운 시그널)
- 실행 가능성 (구체적 투자 행동으로 연결 가능 여부)

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력:
{{"scores": [{{"id": 0, "score": 85, "reason": "한줄이유"}}, ...]}}

뉴스 목록:
{batch_text}"""

        try:
            response = client.messages.create(
                model=TIER1_MODEL,
                max_tokens=2000,
                messages=[{"role": "user", "content": scoring_prompt}],
            )
            response_text = response.content[0].text.strip()

            # JSON 파싱 (코드블록 제거)
            json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                for item in result.get("scores", []):
                    idx = item["id"]
                    if 0 <= idx < len(batch):
                        batch[idx]["score"] = item.get("score", 0)
                        batch[idx]["filter_reason"] = item.get("reason", "")
                        scored_news.append(batch[idx])
            else:
                print(f"    배치 {batch_start} JSON 파싱 실패, 전체 포함 처리")
                for item in batch:
                    item["score"] = 50
                    scored_news.append(item)

        except Exception as e:
            print(f"    배치 {batch_start} Haiku 호출 실패: {e}")
            for item in batch:
                item["score"] = 50
                scored_news.append(item)

    # 스코어 기준 정렬 후 상위 5% 선별 (최소 3건)
    scored_news.sort(key=lambda x: x.get("score", 0), reverse=True)
    top_count = max(3, int(len(scored_news) * 0.05))
    top_news = scored_news[:top_count]

    print(f"  스코어링 완료. 상위 {top_count}건 선별:")
    for item in top_news:
        print(f"    [{item.get('score', '?')}점] {item['source']} — {item['title'][:60]}")

    return top_news

# ============================================================
# [4] Tier-2: Sonnet 정밀 분석 (리포트 생성)
# ============================================================

REPORT_PROMPTS = {
    "daily": """
# STRATEGIC COUNCIL: 일간 브리핑

**역할:** 당신은 'Chief Architect'입니다.
**목표:** 오늘의 핵심 시장 시그널을 정밀 분석한 HTML 이메일 리포트를 생성합니다.
**언어:** 한국어

**디자인 지시 (HTML & Inline CSS):**
* 모던하고 깔끔한 디자인 사용
* **Dr. Doom (리스크):** <span style='color: #D32F2F; font-weight:bold;'>빨간색</span>
* **The Visionary (성장):** <span style='color: #1976D2; font-weight:bold;'>파란색</span>
* **The Hawk (매크로):** <span style='color: #388E3C; font-weight:bold;'>초록색</span>
* **The Fox (역발상):** <span style='color: #FBC02D; font-weight:bold; background-color: #333; padding: 2px;'>노란색</span>
* `<h3>` 챕터 제목, `<ul><li>` 리스트, `<b>` 강조, Markdown 금지

## 리포트 구조

<h3>CHAPTER 1. Architect's Daily Verdict</h3>
<div style="border:1px solid #ccc; padding:15px; background:#f9f9f9; border-radius:5px;">
  <p><b>오늘의 전략 벡터:</b> (가장 중요한 단일 트렌드)</p>
  <p><b>시장 스탠스:</b> [공격적 매수 / 신중 매수 / 중립 / 매도 / 숏]</p>
  <p><b>확신도:</b> [0-100%]</p>
  <p><b>핵심 요약:</b> (3문장 이내)</p>
</div>

<h3>CHAPTER 2. Council Debate</h3>
<p><i>4인 위원회의 짧고 격렬한 토론을 시뮬레이션하세요.</i></p>

<h3>CHAPTER 3. 근거 삼각측량</h3>
<ul>
  <li><b>[매크로/에너지]:</b> ...</li>
  <li><b>[테크/VC]:</b> ...</li>
  <li><b>[시장/자금흐름]:</b> ...</li>
  <li><b>[지정학/갈등]:</b> ...</li>
</ul>

<h3>CHAPTER 4. 오늘의 액션 플랜</h3>
<table border="1" cellpadding="10" cellspacing="0" style="border-collapse:collapse; width:100%;">
  <tr style="background:#eee;"><th>구분</th><th>행동</th></tr>
  <tr><td><b>방어</b></td><td>(손실 방지 전략)</td></tr>
  <tr><td><b>공격</b></td><td>(수익 기회)</td></tr>
  <tr><td><b>킬 스위치</b></td><td>(즉시 청산 조건)</td></tr>
</table>

<h3>CHAPTER 5. 포트폴리오 시사점</h3>
<p>오늘의 뉴스가 기존 포트폴리오에 미치는 영향과 리밸런싱 필요 여부를 판단하세요.</p>
<ul>
  <li><b>주식 비중 조정:</b> ...</li>
  <li><b>채권/현금 비중:</b> ...</li>
  <li><b>섹터 로테이션:</b> ...</li>
  <li><b>헤지 필요 여부:</b> ...</li>
</ul>
""",

    "weekly": """
# STRATEGIC COUNCIL: 주간 전략 리포트

**역할:** Chief Architect
**목표:** 이번 주 시장 동향을 종합하고, 다음 주 전략을 수립하는 HTML 이메일 리포트
**언어:** 한국어

**디자인:** 일간 리포트와 동일한 색상 체계 적용

## 리포트 구조

<h3>CHAPTER 1. 주간 전략 판정</h3>
<div style="border:1px solid #ccc; padding:15px; background:#f9f9f9; border-radius:5px;">
  <p><b>금주 핵심 테마:</b> (3개 이내)</p>
  <p><b>시장 스탠스 변화:</b> [지난주 대비 변화 방향]</p>
  <p><b>확신도:</b> [0-100%]</p>
  <p><b>다음 주 전망:</b> (핵심 시나리오)</p>
</div>

<h3>CHAPTER 2. 주간 Council Debate</h3>
<p>이번 주 가장 논쟁적이었던 이슈에 대한 4인 토론</p>

<h3>CHAPTER 3. 주간 시장 스코어카드</h3>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%;">
  <tr style="background:#eee;"><th>자산군</th><th>주간 동향</th><th>시그널</th><th>다음 주 전망</th></tr>
  <tr><td>미국 주식</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>한국 주식</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>채권</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>원자재/에너지</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>크립토</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>환율(USD/KRW)</td><td>...</td><td>...</td><td>...</td></tr>
</table>

<h3>CHAPTER 4. 주간 포트폴리오 리밸런싱 권고</h3>
<table border="1" cellpadding="10" cellspacing="0" style="border-collapse:collapse; width:100%;">
  <tr style="background:#eee;"><th>자산군</th><th>현재 권장 비중</th><th>조정 방향</th><th>근거</th></tr>
  <tr><td>성장주</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>가치주</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>채권</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>현금</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>대안투자</td><td>...</td><td>...</td><td>...</td></tr>
</table>

<h3>CHAPTER 5. 다음 주 핵심 이벤트 캘린더</h3>
<ul>
  <li><b>월:</b> ...</li>
  <li><b>화:</b> ...</li>
  <li><b>수:</b> ...</li>
  <li><b>목:</b> ...</li>
  <li><b>금:</b> ...</li>
</ul>
""",

    "monthly": """
# STRATEGIC COUNCIL: 월간 전략 리포트

**역할:** Chief Architect
**목표:** 이번 달 시장을 종합 평가하고, 다음 달 전략 및 포트폴리오 최적화 방안을 제시하는 HTML 이메일 리포트
**언어:** 한국어

## 리포트 구조

<h3>CHAPTER 1. 월간 전략 판정</h3>
<div style="border:1px solid #ccc; padding:15px; background:#f9f9f9; border-radius:5px;">
  <p><b>이달의 매크로 내러티브:</b> ...</p>
  <p><b>시장 레짐:</b> [Risk-On / Risk-Off / Transition]</p>
  <p><b>월간 성과 평가:</b> ...</p>
  <p><b>다음 달 핵심 시나리오:</b> ...</p>
</div>

<h3>CHAPTER 2. 월간 심층 토론</h3>
<p>이달 가장 중요한 구조적 변화에 대한 4인 위원회 심층 분석</p>

<h3>CHAPTER 3. 월간 자산군 성과 분석</h3>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%;">
  <tr style="background:#eee;"><th>자산군</th><th>월간 수익률</th><th>핵심 드라이버</th><th>다음 달 전망</th></tr>
</table>

<h3>CHAPTER 4. 최적 포트폴리오 구성안</h3>
<p><b>목표:</b> 리스크 대비 수익률 최적화 (Sharpe Ratio 극대화)</p>
<table border="1" cellpadding="10" cellspacing="0" style="border-collapse:collapse; width:100%;">
  <tr style="background:#eee;"><th>자산군</th><th>권장 비중(%)</th><th>전월 대비 변화</th><th>근거</th></tr>
  <tr><td>미국 대형 성장주</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>미국 대형 가치주</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>한국 주식</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>선진국 주식(ex-US)</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>이머징 주식</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>미국 국채(장기)</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>회사채/하이일드</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>원자재/금</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>크립토</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>현금</td><td>...</td><td>...</td><td>...</td></tr>
</table>

<h3>CHAPTER 5. 리밸런싱 실행 계획</h3>
<ul>
  <li><b>즉시 실행:</b> ...</li>
  <li><b>조건부 실행:</b> (특정 가격/이벤트 도달 시)</li>
  <li><b>관망:</b> ...</li>
</ul>

<h3>CHAPTER 6. 리포트 해석 가이드</h3>
<div style="border:1px solid #1976D2; padding:15px; background:#E3F2FD; border-radius:5px;">
  <p><b>이 리포트를 읽는 법:</b></p>
  <ul>
    <li>시장 레짐이 'Risk-On'이면 주식 비중 확대, 'Risk-Off'면 채권/현금 확대</li>
    <li>확신도 70% 이상일 때만 적극적 포지션 변경 권장</li>
    <li>킬 스위치 조건 충족 시 모든 리스크 자산 비중 50% 축소</li>
    <li>리밸런싱은 월 1회 정기 + 킬 스위치 발동 시 비정기 실행</li>
  </ul>
</div>
""",

    "quarterly": """
# STRATEGIC COUNCIL: 분기 전략 리포트

**역할:** Chief Architect
**목표:** 분기 단위 거시경제 사이클 분석, 섹터 로테이션 전략, 포트폴리오 대규모 리밸런싱 권고
**언어:** 한국어

## 리포트 구조

<h3>CHAPTER 1. 분기 거시경제 판정</h3>
<div style="border:1px solid #ccc; padding:15px; background:#f9f9f9; border-radius:5px;">
  <p><b>경기 사이클 위치:</b> [초기 확장 / 중기 확장 / 후기 확장 / 수축]</p>
  <p><b>금리 사이클:</b> [인상기 / 동결기 / 인하기]</p>
  <p><b>유동성 환경:</b> [긴축 / 중립 / 완화]</p>
  <p><b>분기 핵심 테마 3가지:</b> ...</p>
</div>

<h3>CHAPTER 2. 분기 전략 대토론</h3>
<p>향후 3개월 시장 방향성에 대한 4인 위원회 심층 토론</p>

<h3>CHAPTER 3. 섹터 로테이션 매트릭스</h3>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%;">
  <tr style="background:#eee;"><th>섹터</th><th>현재 사이클 적합도</th><th>비중 권고</th><th>핵심 종목/ETF</th></tr>
  <tr><td>테크/AI</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>헬스케어</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>금융</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>에너지</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>소비재</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>산업재</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>유틸리티</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>부동산(REITs)</td><td>...</td><td>...</td><td>...</td></tr>
</table>

<h3>CHAPTER 4. 분기 최적 포트폴리오</h3>
<p>전분기 대비 대규모 조정 사항 포함</p>

<h3>CHAPTER 5. 분기 리스크 매트릭스</h3>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%;">
  <tr style="background:#eee;"><th>리스크</th><th>발생 확률</th><th>영향도</th><th>헤지 전략</th></tr>
</table>

<h3>CHAPTER 6. 투자 교육: 리밸런싱 최적 전략</h3>
<div style="border:1px solid #388E3C; padding:15px; background:#E8F5E9; border-radius:5px;">
  <p><b>리밸런싱 원칙:</b></p>
  <ul>
    <li><b>시간 기반:</b> 분기 1회 정기 리밸런싱 (거래비용 최소화)</li>
    <li><b>밴드 기반:</b> 목표 비중 대비 +/-5%p 이탈 시 비정기 리밸런싱</li>
    <li><b>세금 효율:</b> 손실 자산 먼저 매도 (Tax-Loss Harvesting)</li>
    <li><b>실행 순서:</b> 현금 유입분 -> 저비중 자산 매수 -> 고비중 자산 매도</li>
  </ul>
</div>
""",

    "semi_annual": """
# STRATEGIC COUNCIL: 반기 전략 리포트

**역할:** Chief Architect
**목표:** 반기 단위 포트폴리오 성과 평가, 전략 자산배분(SAA) 검토, 장기 테마 업데이트
**언어:** 한국어

## 리포트 구조

<h3>CHAPTER 1. 반기 성과 평가</h3>
<div style="border:1px solid #ccc; padding:15px; background:#f9f9f9; border-radius:5px;">
  <p><b>반기 포트폴리오 추정 수익률:</b> ...</p>
  <p><b>벤치마크 대비:</b> [초과 / 미달 / 부합]</p>
  <p><b>최대 기여 자산:</b> ...</p>
  <p><b>최대 손실 자산:</b> ...</p>
  <p><b>전략 유효성 평가:</b> ...</p>
</div>

<h3>CHAPTER 2. 글로벌 매크로 반기 리뷰</h3>
<p>주요국 경제 성장률, 인플레이션, 금리 정책 종합 분석</p>

<h3>CHAPTER 3. 향후 6개월 시나리오 분석</h3>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%;">
  <tr style="background:#eee;"><th>시나리오</th><th>확률</th><th>설명</th><th>포트폴리오 대응</th></tr>
  <tr><td>낙관</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>기본</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>비관</td><td>...</td><td>...</td><td>...</td></tr>
  <tr><td>블랙스완</td><td>...</td><td>...</td><td>...</td></tr>
</table>

<h3>CHAPTER 4. 전략 자산배분(SAA) 재검토</h3>
<p>장기 목표 비중 조정 여부 판단</p>

<h3>CHAPTER 5. 투자 교육: 포트폴리오 구축 원칙</h3>
<div style="border:1px solid #1976D2; padding:15px; background:#E3F2FD; border-radius:5px;">
  <ul>
    <li><b>코어-새틀라이트:</b> 핵심 자산(70-80%) + 전술적 자산(20-30%)</li>
    <li><b>상관관계:</b> 자산 간 상관계수 0.5 이하 유지 목표</li>
    <li><b>리스크 버짓:</b> 전체 포트폴리오 변동성 목표 설정</li>
    <li><b>유동성 계층:</b> 즉시 현금화 가능 자산 최소 20% 유지</li>
  </ul>
</div>
""",

    "annual": """
# STRATEGIC COUNCIL: 연간 전략 리포트

**역할:** Chief Architect
**목표:** 연간 종합 성과 평가, 장기 투자 철학 점검, 차년도 전략 자산배분 수립
**언어:** 한국어

## 리포트 구조

<h3>CHAPTER 1. 연간 종합 판정</h3>
<div style="border:1px solid #ccc; padding:15px; background:#f9f9f9; border-radius:5px;">
  <p><b>올해의 시장 한 줄 요약:</b> ...</p>
  <p><b>연간 포트폴리오 추정 수익률:</b> ...</p>
  <p><b>전략 적중률:</b> ...</p>
  <p><b>최대 교훈:</b> ...</p>
</div>

<h3>CHAPTER 2. 연간 자산군 성과 총정리</h3>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%;">
  <tr style="background:#eee;"><th>자산군</th><th>연간 수익률</th><th>변동성</th><th>Sharpe</th><th>비고</th></tr>
</table>

<h3>CHAPTER 3. 차년도 매크로 전망</h3>
<p>4인 위원회의 차년도 시장 전망 심층 토론</p>

<h3>CHAPTER 4. 차년도 전략 자산배분(SAA)</h3>
<table border="1" cellpadding="10" cellspacing="0" style="border-collapse:collapse; width:100%;">
  <tr style="background:#eee;"><th>자산군</th><th>금년 비중</th><th>차년 목표 비중</th><th>변화</th><th>근거</th></tr>
</table>

<h3>CHAPTER 5. 차년도 리밸런싱 캘린더</h3>
<ul>
  <li><b>1월:</b> 연초 전략 배분 실행</li>
  <li><b>4월:</b> Q1 리뷰 + 분기 리밸런싱</li>
  <li><b>7월:</b> 반기 리뷰 + SAA 재검토</li>
  <li><b>10월:</b> Q3 리뷰 + 연말 세금 전략</li>
  <li><b>12월:</b> Tax-Loss Harvesting + 차년도 준비</li>
</ul>

<h3>CHAPTER 6. 연간 투자 교육 총정리</h3>
<div style="border:1px solid #D32F2F; padding:15px; background:#FFEBEE; border-radius:5px;">
  <p><b>올해 배운 핵심 교훈:</b></p>
  <ul>
    <li><b>행동 편향:</b> 올해 가장 많이 범한 인지 편향과 교정 방법</li>
    <li><b>리스크 관리:</b> 킬 스위치 발동 사례와 효과 평가</li>
    <li><b>복리의 힘:</b> 장기 투자 관점에서의 올해 포지셔닝 평가</li>
  </ul>
</div>
""",
}

def tier2_analyze(top_news: list[dict], report_type: str, client: anthropic.Anthropic, accumulated_context: str = "") -> str:
    """
    Sonnet 4로 선별된 뉴스를 정밀 분석하여 리포트 생성.
    """
    print(f"\n[PHASE 3] Tier-2 분석 ({TIER2_MODEL}) — {report_type} 리포트 생성...")

    news_text = ""
    for item in top_news:
        news_text += f"[{item['source']}] (Score: {item.get('score', 'N/A')}) {item['title']}\n"
        news_text += f"  Content: {item['content'][:1500]}\n"
        news_text += f"  Date: {item['date']} | Link: {item['link']}\n\n"

    base_prompt = REPORT_PROMPTS.get(report_type, REPORT_PROMPTS["daily"])

    context_section = ""
    if accumulated_context:
        context_section = f"""
**[누적 컨텍스트 — 이전 리포트 요약]**
{accumulated_context}
"""

    full_prompt = f"""{base_prompt}

{context_section}

---
**[Tier-1 필터링 통과 핵심 뉴스 데이터]**
{news_text}
"""

    try:
        response = client.messages.create(
            model=TIER2_MODEL,
            max_tokens=8000,
            messages=[{"role": "user", "content": full_prompt}],
        )
        return clean_report_body(response.content[0].text)
    except Exception as e:
        return f"<h3>분석 오류</h3><p>{e}</p><pre>{traceback.format_exc()}</pre>"

# ============================================================
# [5] 이메일 발송
# ============================================================

def send_email(report_body: str, report_type: str):
    print(f"\n[PHASE 4] 이메일 발송 ({report_type})...")

    type_labels = {
        "daily": "일간 브리핑",
        "weekly": "주간 전략",
        "monthly": "월간 전략",
        "quarterly": "분기 전략",
        "semi_annual": "반기 전략",
        "annual": "연간 전략",
    }
    label = type_labels.get(report_type, report_type)
    safe_date = datetime.now().strftime("%Y-%m-%d")
    subject = f"[Strategic Council] {label} | {safe_date}"

    tier_info = f"Tier-1: {TIER1_MODEL} (Filtering) / Tier-2: {TIER2_MODEL} (Analysis)"

    email_content = f"""From: {EMAIL_USER}
To: {EMAIL_RECEIVER}
Subject: {subject}
MIME-Version: 1.0
Content-Type: text/html; charset="utf-8"
Content-Transfer-Encoding: 8bit

<html>
<head>
    <style>
        body {{ font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.7; color: #333; max-width: 860px; margin: 0 auto; padding: 20px; }}
        h3 {{ border-bottom: 2px solid #333; padding-bottom: 5px; margin-top: 30px; }}
        li {{ margin-bottom: 8px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f2f2f2; }}
    </style>
</head>
<body>
<div style="background:#1a1a2e; color:#fff; padding:20px; border-radius:8px; margin-bottom:20px; text-align:center;">
  <h1 style="margin:0;">Strategic Council</h1>
  <p style="margin:5px 0 0 0; font-size:14px; color:#aaa;">{label} | {safe_date} | 2-Tier AI Pipeline</p>
</div>
{report_body}
<br><br>
<hr>
<p style="font-size:11px; color:#999; text-align:center;">
  Generated by Strategic Council AI Pipeline<br>
  {tier_info}<br>
</p>
</body>
</html>
"""

    if not EMAIL_PASSWORD.isascii():
        print("  [FATAL] 비밀번호에 비-ASCII 문자 포함")
        return

    try:
        server = smtplib.SMTP(SMTP_SERVER, 587, local_hostname="localhost")
        server.starttls()
        server.login(EMAIL_USER, EMAIL_PASSWORD)
        server.sendmail(EMAIL_USER, EMAIL_RECEIVER, email_content.encode("utf-8"))
        server.quit()
        print("  [OK] 이메일 발송 완료")
    except Exception:
        print("  [FATAL] 이메일 발송 실패:")
        traceback.print_exc()

# ============================================================
# [6] 스케줄 판정 엔진
# ============================================================

def determine_report_types(now: datetime = None) -> list[str]:
    """
    현재 시각 기준으로 생성해야 할 리포트 유형 목록을 반환.

    스케줄 설계:
    - 일간: 매일
    - 주간: 매주 토요일
    - 월간: 매월 1일
    - 분기: 1/4/7/10월 1일
    - 반기: 1/7월 1일
    - 연간: 1월 1일

    GitHub Actions에서는 cron으로 UTC 07:00, UTC 22:00에 트리거.
    """
    if now is None:
        now = datetime.utcnow()

    reports = ["daily"]  # 일간은 항상 생성

    # 주간: 토요일 (weekday 5)
    if now.weekday() == 5:
        reports.append("weekly")

    # 월간: 매월 1일
    if now.day == 1:
        reports.append("monthly")

    # 분기: 1/4/7/10월 1일
    if now.month in (1, 4, 7, 10) and now.day == 1:
        reports.append("quarterly")

    # 반기: 1/7월 1일
    if now.month in (1, 7) and now.day == 1:
        reports.append("semi_annual")

    # 연간: 1월 1일
    if now.month == 1 and now.day == 1:
        reports.append("annual")

    return reports

# ============================================================
# [7] 누적 컨텍스트 관리
# ============================================================

def get_accumulated_context(report_type: str, history: dict) -> str:
    """
    상위 주기 리포트 생성 시, 하위 주기 리포트 요약을 컨텍스트로 제공.
    """
    context_map = {
        "weekly": ("daily", 7),
        "monthly": ("weekly", 4),
        "quarterly": ("monthly", 3),
        "semi_annual": ("quarterly", 2),
        "annual": ("semi_annual", 2),
    }

    if report_type not in context_map:
        return ""

    source_type, count = context_map[report_type]
    entries = history.get(source_type, [])[-count:]

    if not entries:
        return ""

    context = f"[최근 {len(entries)}건의 {source_type} 리포트 요약]\n"
    for entry in entries:
        context += f"- {entry.get('date', 'N/A')}: {entry.get('summary', 'N/A')}\n"

    return context

def save_report_summary(report_type: str, report_body: str, history: dict, client: anthropic.Anthropic):
    """리포트 본문을 3문장으로 요약하여 히스토리에 저장."""
    try:
        response = client.messages.create(
            model=SUMMARY_MODEL,
            max_tokens=300,
            messages=[{
                "role": "user",
                "content": f"다음 투자 리포트를 핵심 3문장으로 요약하세요. 한국어로:\n\n{report_body[:3000]}",
            }],
        )
        summary = response.content[0].text.strip()
    except Exception:
        summary = "요약 생성 실패"

    entry = {
        "date": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "summary": summary,
    }

    if report_type not in history:
        history[report_type] = []
    history[report_type].append(entry)

    # 히스토리 크기 제한 (각 유형별 최대 보관)
    limits = {"daily": 30, "weekly": 12, "monthly": 12, "quarterly": 8, "semi_annual": 4, "annual": 3}
    max_entries = limits.get(report_type, 10)
    history[report_type] = history[report_type][-max_entries:]

# ============================================================
# [8] 메인 파이프라인
# ============================================================

def main():
    print("=" * 60)
    print("  STRATEGIC COUNCIL — 2-Tier AI Pipeline")
    print(f"  Execution Time: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"  Tier-1 Model: {TIER1_MODEL}")
    print(f"  Tier-2 Model: {TIER2_MODEL}")
    print(f"  Summary Model: {SUMMARY_MODEL}")
    print("=" * 60)

    # 환경변수 검증
    if not ANTHROPIC_API_KEY:
        print("[FATAL] ANTHROPIC_API_KEY 미설정")
        return
    if not all([EMAIL_USER, EMAIL_PASSWORD, EMAIL_RECEIVER]):
        print("[FATAL] 이메일 환경변수 미설정")
        return

    # Anthropic 클라이언트 초기화
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    # 리포트 유형 판정
    report_types = determine_report_types()
    print(f"\n[SCHEDULE] 생성 대상 리포트: {report_types}")

    # 히스토리 로드
    history = load_history()

    # Phase 1: RSS 수집
    news_list = fetch_news()
    if not news_list:
        print("[FATAL] 뉴스 수집 실패")
        return

    # Phase 2: Tier-1 Haiku 필터링
    top_news = tier1_filter(news_list, client)
    if not top_news:
        print("[FATAL] 필터링 결과 없음")
        return

    # Phase 3 & 4: 각 리포트 유형별 Tier-2 분석 + 발송
    for report_type in report_types:
        try:
            accumulated_context = get_accumulated_context(report_type, history)
            report_body = tier2_analyze(top_news, report_type, client, accumulated_context)

            if report_body and "분석 오류" not in report_body:
                send_email(report_body, report_type)
                save_report_summary(report_type, report_body, history, client)
                print(f"  [{report_type}] 완료")
            else:
                print(f"  [{report_type}] 분석 실패")
                print(report_body)
        except Exception as e:
            print(f"  [{report_type}] 파이프라인 오류: {e}")
            traceback.print_exc()

    # 히스토리 저장
    save_history(history)
    print("\n[DONE] 전체 파이프라인 완료")

if __name__ == "__main__":
    main()
