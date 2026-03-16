const { createBrowser } = require('./scraper');
const Table = require('cli-table3');
const fs = require('fs');
const path = require('path');

// 지원하는 사이트 목록 (key: CLI 인자명, value: 모듈)
const SITES = {
  gmarket: require('./sites/gmarket'),
  auction: require('./sites/auction'),
  naver: require('./sites/naver'),
  coupang: require('./sites/coupang'),
  ssg: require('./sites/ssg'),
  lotteon: require('./sites/lotteon'),
  elevenst: require('./sites/elevenst'),
  hmall: require('./sites/hmall'),
  gsshop: require('./sites/gsshop'),
  cjonstyle: require('./sites/cjonstyle'),
  kurly: require('./sites/kurly'),
  danawa: require('./sites/danawa'),
  oliveyoung: require('./sites/oliveyoung'),
};

// 기본 검색 키워드
const DEFAULT_KEYWORD = '시세이도 리바이탈에센스 스킨 글로우 파운데이션';

/**
 * CLI 인자 파싱
 * --keyword "검색어" : 검색 키워드 변경
 * --site siteName : 특정 사이트만 실행
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let keyword = DEFAULT_KEYWORD;
  let siteFilter = null;
  let demo = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--keyword' && args[i + 1]) {
      keyword = args[i + 1];
      i++;
    } else if (args[i] === '--site' && args[i + 1]) {
      siteFilter = args[i + 1].toLowerCase();
      i++;
    } else if (args[i] === '--demo') {
      demo = true;
    }
  }

  return { keyword, siteFilter, demo };
}

/**
 * 데모용 샘플 데이터 생성 (네트워크 차단 환경에서 출력 확인용)
 */
function generateDemoData(keyword) {
  return [
    { site: 'G마켓', name: `시세이도 리바이탈에센스 스킨 글로우 파운데이션 230 SPF30`, price: 42900, priceText: '42,900원', shipping: 0, shippingText: '무료배송', seller: '시세이도공식스토어', isDepartment: true, url: 'https://item.gmarket.co.kr/item?goodscode=123456' },
    { site: '네이버쇼핑', name: `시세이도 리바이탈에센스 스킨 글로우 파운데이션 SPF30 30ml`, price: 39800, priceText: '39,800원', shipping: 0, shippingText: '무료배송', seller: '뷰티탑', isDepartment: false, url: 'https://search.shopping.naver.com/product/123' },
    { site: '쿠팡', name: `시세이도 리바이탈에센스 스킨글로우 파운데이션 30ml 230`, price: 41500, priceText: '41,500원', shipping: 0, shippingText: '무료배송(로켓)', seller: '쿠팡', isDepartment: false, url: 'https://www.coupang.com/vp/products/123' },
    { site: '올리브영', name: `[시세이도] 리바이탈에센스 스킨 글로우 파운데이션 30ml`, price: 52000, priceText: '52,000원', shipping: 0, shippingText: '무료배송', seller: '올리브영', isDepartment: false, url: 'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=123' },
    { site: 'SSG.COM', name: `시세이도 리바이탈에센스 스킨 글로우 파운데이션 230`, price: 44900, priceText: '44,900원', shipping: 0, shippingText: '무료배송', seller: '신세계백화점', isDepartment: true, url: 'https://www.ssg.com/item/itemView.ssg?itemId=123' },
    { site: '11번가', name: `시세이도 리바이탈에센스 스킨 글로우 파운데이션 SPF30 PA+++`, price: 43200, priceText: '43,200원', shipping: 2500, shippingText: '2,500원', seller: '코스메틱월드', isDepartment: false, url: 'https://www.11st.co.kr/products/123' },
    { site: '롯데ON', name: `시세이도 리바이탈에센스 스킨 글로우 파운데이션 30ml`, price: 48000, priceText: '48,000원', shipping: 0, shippingText: '무료배송', seller: '롯데백화점', isDepartment: true, url: 'https://www.lotteon.com/product/123' },
    { site: '현대Hmall', name: `[시세이도] 리바이탈에센스 스킨글로우 파운데이션`, price: 49000, priceText: '49,000원', shipping: 0, shippingText: '무료배송', seller: '현대Hmall', isDepartment: true, url: 'https://www.hmall.com/product/123' },
    { site: '옥션', name: `시세이도 리바이탈에센스 스킨 글로우 파운데이션 SPF30`, price: 40500, priceText: '40,500원', shipping: 3000, shippingText: '3,000원', seller: '뷰티스토어', isDepartment: false, url: 'https://itempage3.auction.co.kr/DetailView/123' },
    { site: '다나와', name: `시세이도 리바이탈에센스 스킨 글로우 파운데이션 30ml`, price: 38900, priceText: '38,900원', shipping: 2500, shippingText: '2,500원', seller: '최저가몰', isDepartment: false, url: 'https://prod.danawa.com/info/?pcode=123' },
    { site: 'GS Shop', name: `시세이도 리바이탈에센스 스킨글로우 파운데이션 세트`, price: 55000, priceText: '55,000원', shipping: 0, shippingText: '무료배송', seller: 'GS Shop', isDepartment: false, url: 'https://www.gsshop.com/prd/prd.gs?prdid=123' },
    { site: 'CJ온스타일', name: `시세이도 리바이탈에센스 스킨 글로우 파운데이션`, price: 47500, priceText: '47,500원', shipping: 0, shippingText: '무료배송', seller: 'CJ온스타일', isDepartment: false, url: 'https://display.cjonstyle.com/product/123' },
    { site: '마켓컬리', name: `[시세이도] 리바이탈에센스 스킨 글로우 파운데이션`, price: 52000, priceText: '52,000원', shipping: 0, shippingText: '무료배송(조건부)', seller: '마켓컬리', isDepartment: false, url: 'https://www.kurly.com/goods/123' },
    { site: 'G마켓', name: `시세이도 리바이탈에센스 스킨 글로우 파운데이션 220 라이트`, price: 44500, priceText: '44,500원', shipping: 0, shippingText: '무료배송', seller: '뷰티넷', isDepartment: false, url: 'https://item.gmarket.co.kr/item?goodscode=456' },
    { site: '네이버쇼핑', name: `시세이도 스킨글로우 파운데이션 리바이탈에센스 30ml`, price: 41200, priceText: '41,200원', shipping: 2500, shippingText: '2,500원', seller: '코스메존', isDepartment: false, url: 'https://search.shopping.naver.com/product/456' },
  ];
}

/**
 * 결과를 가격 낮은 순으로 정렬
 */
function sortByPrice(results) {
  return results.sort((a, b) => {
    const totalA = a.price + a.shipping;
    const totalB = b.price + b.shipping;
    return totalA - totalB;
  });
}

/**
 * 터미널 테이블 출력
 */
function printTable(results, keyword) {
  console.log('\n');
  console.log('='.repeat(120));
  console.log(`  📊 가격 비교 결과 - "${keyword}"`);
  console.log(`  📅 ${new Date().toLocaleString('ko-KR')}`);
  console.log(`  📦 총 ${results.length}개 상품 수집`);
  console.log('='.repeat(120));

  if (results.length === 0) {
    console.log('\n  ⚠️  수집된 상품이 없습니다. 사이트 접속 상태를 확인해주세요.\n');
    return;
  }

  // 전체 결과 테이블
  const table = new Table({
    head: ['순위', '사이트', '상품명', '가격', '배송비', '총비용', '백화점', 'URL'],
    colWidths: [6, 12, 45, 12, 10, 12, 8, 30],
    style: { head: ['cyan'] },
    wordWrap: true,
  });

  results.forEach((item, idx) => {
    const isTop5 = idx < 5;
    const rank = `${idx + 1}`;
    const price = item.price > 0 ? item.price.toLocaleString() + '원' : '가격확인';
    const shipping = item.shipping === 0 ? '무료' : item.shipping.toLocaleString() + '원';
    const total = (item.price + item.shipping).toLocaleString() + '원';
    const dept = item.isDepartment ? '✅' : '-';
    const shortUrl = item.url ? item.url.substring(0, 28) + '..' : '-';

    // TOP 5는 ★ 표시
    const prefix = isTop5 ? '★ ' : '  ';
    table.push([
      prefix + rank,
      item.site,
      item.name || '상품명 없음',
      price,
      shipping,
      total,
      dept,
      shortUrl,
    ]);
  });

  console.log(table.toString());

  // 최저가 TOP 5 하이라이트
  console.log('\n');
  console.log('🏆'.repeat(20));
  console.log('  🎯 최저가 TOP 5');
  console.log('🏆'.repeat(20));

  const top5Table = new Table({
    head: ['순위', '사이트', '상품명', '총비용', '백화점', 'URL'],
    colWidths: [6, 12, 50, 15, 8, 40],
    style: { head: ['green'] },
    wordWrap: true,
  });

  results.slice(0, 5).forEach((item, idx) => {
    const total = (item.price + item.shipping).toLocaleString() + '원';
    const dept = item.isDepartment ? '✅ 백화점' : '-';
    const urlDisplay = item.url ? item.url.substring(0, 38) + '..' : '-';

    top5Table.push([
      `🥇🥈🥉4️⃣5️⃣`.substring(idx * 2, idx * 2 + 2) || `${idx + 1}`,
      item.site,
      item.name || '상품명 없음',
      total,
      dept,
      urlDisplay,
    ]);
  });

  console.log(top5Table.toString());
  console.log('\n');
}

/**
 * 결과를 HTML 리포트로 저장
 */
function saveHtmlReport(results, keyword, jsonPath) {
  const now = new Date();
  const htmlPath = jsonPath.replace('.json', '.html');
  const top5 = results.slice(0, 5);

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>가격 비교 - ${keyword}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Malgun Gothic', sans-serif; background: #f0f2f5; color: #333; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 30px; border-radius: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 24px; margin-bottom: 8px; }
    .header .meta { opacity: 0.85; font-size: 14px; }
    .top5 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .top5-card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); position: relative; overflow: hidden; }
    .top5-card .rank { font-size: 28px; margin-bottom: 8px; }
    .top5-card .site { font-size: 12px; color: #888; font-weight: 600; text-transform: uppercase; }
    .top5-card .name { font-size: 14px; margin: 8px 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .top5-card .price { font-size: 22px; font-weight: 700; color: #e53e3e; }
    .top5-card .shipping { font-size: 12px; color: #888; margin-top: 4px; }
    .top5-card .dept { display: inline-block; background: #ebf8ff; color: #2b6cb0; font-size: 11px; padding: 2px 8px; border-radius: 4px; margin-top: 8px; }
    .top5-card a { display: inline-block; margin-top: 10px; font-size: 13px; color: #667eea; text-decoration: none; }
    .top5-card a:hover { text-decoration: underline; }
    .gold { border-top: 4px solid #FFD700; }
    .silver { border-top: 4px solid #C0C0C0; }
    .bronze { border-top: 4px solid #CD7F32; }
    table { width: 100%; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-collapse: collapse; }
    th { background: #667eea; color: white; padding: 14px 12px; text-align: left; font-size: 13px; font-weight: 600; }
    td { padding: 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
    tr:hover { background: #f9fafb; }
    tr.top5-row { background: #fffff0; }
    .price-cell { font-weight: 700; color: #e53e3e; white-space: nowrap; }
    .total-cell { font-weight: 700; white-space: nowrap; }
    .free { color: #38a169; }
    .dept-badge { background: #ebf8ff; color: #2b6cb0; font-size: 11px; padding: 2px 6px; border-radius: 4px; }
    .link { color: #667eea; text-decoration: none; font-size: 12px; word-break: break-all; }
    .link:hover { text-decoration: underline; }
    .section-title { font-size: 18px; font-weight: 700; margin: 24px 0 16px; }
    .footer { text-align: center; color: #999; font-size: 12px; margin-top: 24px; padding: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛒 가격 비교 결과</h1>
      <div class="meta">
        검색어: <strong>${keyword}</strong><br>
        ${now.toLocaleString('ko-KR')} · 총 ${results.length}개 상품 수집
      </div>
    </div>

    <div class="section-title">🏆 최저가 TOP 5</div>
    <div class="top5">
      ${top5.map((item, i) => {
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        const borders = ['gold', 'silver', 'bronze', '', ''];
        const total = (item.price + item.shipping).toLocaleString();
        const ship = item.shipping === 0 ? '무료배송' : `배송비 ${item.shipping.toLocaleString()}원`;
        return `
      <div class="top5-card ${borders[i]}">
        <div class="rank">${medals[i]}</div>
        <div class="site">${item.site}</div>
        <div class="name">${item.name || '상품명 없음'}</div>
        <div class="price">${total}원</div>
        <div class="shipping">${ship}</div>
        ${item.isDepartment ? '<div class="dept">백화점</div>' : ''}
        ${item.url ? `<a href="${item.url}" target="_blank">상품 보기 →</a>` : ''}
      </div>`;
      }).join('')}
    </div>

    <div class="section-title">📋 전체 결과 (가격 낮은 순)</div>
    <table>
      <thead>
        <tr><th>순위</th><th>사이트</th><th>상품명</th><th>가격</th><th>배송비</th><th>총비용</th><th>백화점</th><th>링크</th></tr>
      </thead>
      <tbody>
        ${results.map((item, i) => {
          const total = (item.price + item.shipping).toLocaleString();
          const ship = item.shipping === 0 ? '<span class="free">무료</span>' : item.shipping.toLocaleString() + '원';
          const isTop = i < 5;
          return `
        <tr class="${isTop ? 'top5-row' : ''}">
          <td>${isTop ? '★ ' : ''}${i + 1}</td>
          <td>${item.site}</td>
          <td>${item.name || '상품명 없음'}</td>
          <td class="price-cell">${item.price > 0 ? item.price.toLocaleString() + '원' : '확인필요'}</td>
          <td>${ship}</td>
          <td class="total-cell">${total}원</td>
          <td>${item.isDepartment ? '<span class="dept-badge">백화점</span>' : '-'}</td>
          <td>${item.url ? `<a class="link" href="${item.url}" target="_blank">보기</a>` : '-'}</td>
        </tr>`;
        }).join('')}
      </tbody>
    </table>

    <div class="footer">
      Price Scraper v1.0 · ${now.toISOString().slice(0, 10)}
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log(`  📄 HTML 리포트: ${htmlPath}`);
  return htmlPath;
}

/**
 * 결과를 JSON 파일로 저장
 */
function saveResults(results, keyword) {
  const resultsDir = path.join(__dirname, '..', 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const filename = `${dateStr}.json`;
  const filepath = path.join(resultsDir, filename);

  const output = {
    keyword,
    scrapedAt: now.toISOString(),
    totalProducts: results.length,
    results: results.map((item) => ({
      ...item,
      totalCost: item.price + item.shipping,
    })),
  };

  fs.writeFileSync(filepath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`  💾 결과 저장 완료: ${filepath}`);

  // HTML 리포트도 함께 생성
  saveHtmlReport(results, keyword, filepath);

  return filepath;
}

/**
 * 메인 실행 함수
 */
async function main() {
  const { keyword, siteFilter, demo } = parseArgs();

  console.log('\n' + '='.repeat(60));
  console.log('  🛒 쇼핑몰 가격 스크래퍼 v1.0');
  console.log('='.repeat(60));
  console.log(`  검색어: ${keyword}`);
  console.log(`  대상: ${siteFilter ? siteFilter : '전체 사이트 (13개)'}`);
  if (demo) console.log('  모드: 데모 (샘플 데이터)');
  console.log('='.repeat(60) + '\n');

  // 데모 모드: 브라우저 없이 샘플 데이터로 출력 테스트
  if (demo) {
    console.log('📋 데모 모드 - 샘플 데이터로 출력 테스트\n');
    const demoResults = generateDemoData(keyword);
    const sorted = sortByPrice(demoResults);
    printTable(sorted, keyword);
    saveResults(sorted, keyword);
    return;
  }

  // 브라우저 초기화
  console.log('🌐 브라우저 초기화 중...');
  const browser = await createBrowser();
  let allResults = [];

  try {
    // 실행할 사이트 결정
    const sitesToRun = siteFilter
      ? { [siteFilter]: SITES[siteFilter] }
      : SITES;

    if (siteFilter && !SITES[siteFilter]) {
      console.error(`\n  ❌ 알 수 없는 사이트: ${siteFilter}`);
      console.log(`  사용 가능한 사이트: ${Object.keys(SITES).join(', ')}`);
      await browser.close();
      process.exit(1);
    }

    // 각 사이트별 순차 스크래핑
    for (const [key, site] of Object.entries(sitesToRun)) {
      console.log(`\n📍 [${site.SITE_NAME}] 스크래핑 시작...`);
      try {
        const results = await site.scrape(browser, keyword);
        allResults = allResults.concat(results);
      } catch (error) {
        console.error(`  ❌ [${site.SITE_NAME}] 전체 실패: ${error.message}`);
      }
    }

    // 가격이 0인 항목 필터링 (유효한 가격만)
    const validResults = allResults.filter((r) => r.price > 0);

    // 가격 낮은 순 정렬
    const sorted = sortByPrice(validResults);

    // 터미널 테이블 출력
    printTable(sorted, keyword);

    // JSON 파일 저장
    saveResults(sorted, keyword);

  } finally {
    await browser.close();
    console.log('🌐 브라우저 종료');
  }
}

// 실행
main().catch((error) => {
  console.error('❌ 치명적 오류:', error.message);
  process.exit(1);
});
