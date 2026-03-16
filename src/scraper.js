const vanillaPuppeteer = require('puppeteer-core');
const { addExtra } = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// puppeteer-extra에 puppeteer-core를 래핑
const puppeteer = addExtra(vanillaPuppeteer);

// Stealth 플러그인 적용 (봇 감지 회피)
puppeteer.use(StealthPlugin());

// 일반 Chrome 브라우저 User-Agent
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Chromium 경로 (Playwright 설치 경로 또는 시스템 경로)
const CHROMIUM_PATH = process.env.CHROMIUM_PATH
  || '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome'
  || '/usr/bin/chromium-browser';

/**
 * 브라우저 인스턴스를 생성하고 반환
 */
async function createBrowser() {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROMIUM_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  });
  return browser;
}

/**
 * 새 페이지를 생성하고 기본 설정 적용
 */
async function createPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1920, height: 1080 });
  // 이미지/폰트 로딩 차단 (속도 향상)
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (['image', 'font', 'media'].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });
  return page;
}

/**
 * 가격 문자열에서 숫자만 추출
 * 예: "32,500원" → 32500
 */
function parsePrice(priceStr) {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/[^0-9]/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}

/**
 * 안전하게 페이지 이동 (타임아웃 처리 포함)
 */
async function safeGoto(page, url, options = {}) {
  const defaultOptions = {
    waitUntil: 'networkidle2',
    timeout: 30000,
  };
  return page.goto(url, { ...defaultOptions, ...options });
}

/**
 * 지정 시간(ms) 대기
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  puppeteer,
  createBrowser,
  createPage,
  parsePrice,
  safeGoto,
  delay,
  USER_AGENT,
};
