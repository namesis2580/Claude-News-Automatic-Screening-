# 🛒 Price Scraper - 쇼핑몰 가격 비교 스크래퍼

한국 주요 쇼핑몰 13개 사이트에서 상품 가격을 자동으로 수집하여 최저가를 비교하는 CLI 도구입니다.

## 지원 사이트

| # | 사이트 | 도메인 |
|---|--------|--------|
| 1 | G마켓 | gmarket.co.kr |
| 2 | 옥션 | auction.co.kr |
| 3 | 네이버쇼핑 | shopping.naver.com |
| 4 | 쿠팡 | coupang.com |
| 5 | SSG.COM | ssg.com |
| 6 | 롯데ON | lotteon.com |
| 7 | 11번가 | 11st.co.kr |
| 8 | 현대Hmall | hmall.com |
| 9 | GS Shop | gsshop.com |
| 10 | CJ온스타일 | cjonstyle.com |
| 11 | 마켓컬리 | kurly.com |
| 12 | 다나와 | danawa.com |
| 13 | 올리브영 | oliveyoung.co.kr |

## 설치

```bash
# 프로젝트 클론
git clone <repository-url>
cd price-scraper

# 의존성 설치
npm install
```

## 사용법

### 전체 사이트 스크래핑 (기본 키워드)

```bash
npm run scrape
```

기본 검색어: `시세이도 리바이탈에센스 스킨 글로우 파운데이션`

### 키워드 변경

```bash
npm run scrape -- --keyword "에스티로더 더블웨어"
```

### 특정 사이트만 실행

```bash
# G마켓만 실행
npm run scrape:gmarket

# 네이버쇼핑만 실행
npm run scrape:naver

# 임의 사이트 지정
npm run scrape -- --site coupang
npm run scrape -- --site oliveyoung
```

### 사이트 키워드와 함께 사용

```bash
npm run scrape -- --site naver --keyword "맥 파운데이션"
```

### 사용 가능한 사이트 키

`gmarket`, `auction`, `naver`, `coupang`, `ssg`, `lotteon`, `elevenst`, `hmall`, `gsshop`, `cjonstyle`, `kurly`, `danawa`, `oliveyoung`

## 출력

### 터미널 출력
- 가격 낮은 순으로 정렬된 전체 결과 테이블
- 최저가 TOP 5 하이라이트 섹션

### JSON 파일 저장
- `results/YYYY-MM-DD_HH-mm.json` 형식으로 자동 저장
- 검색 키워드, 수집 시간, 전체 결과 포함

## 기술 스택

- **Node.js** - 런타임
- **Puppeteer** - 헤드리스 Chrome 브라우저 자동화
- **puppeteer-extra + stealth plugin** - 봇 감지 회피
- **cli-table3** - 터미널 테이블 출력

## 주의사항

- 각 사이트의 봇 감지 정책에 따라 일부 사이트에서 스크래핑이 실패할 수 있습니다
- 사이트 UI 변경 시 셀렉터 업데이트가 필요할 수 있습니다
- 개인적인 가격 비교 목적으로만 사용하세요
