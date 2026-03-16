const { createPage, parsePrice, safeGoto, delay } = require('../scraper');

const SITE_NAME = '쿠팡';

/**
 * 쿠팡에서 상품 검색 및 가격 추출
 * 봇 감지가 강력하여 실패 가능성 있음
 */
async function scrape(browser, keyword) {
  const page = await createPage(browser);
  const results = [];

  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `https://www.coupang.com/np/search?component=&q=${encodedKeyword}&channel=user`;

    console.log(`  [쿠팡] 검색 중: ${keyword}`);
    await safeGoto(page, url, { timeout: 15000 });
    await delay(3000);

    const items = await page.evaluate(() => {
      const products = [];
      const elements = document.querySelectorAll('.search-product, li.search-product, #productList li');

      elements.forEach((el, i) => {
        if (i >= 5) return;

        const nameEl = el.querySelector('.name, .descriptions .name, div.name');
        const name = nameEl ? nameEl.textContent.trim() : '';

        const priceEl = el.querySelector('.price-value, strong.price-value');
        const price = priceEl ? priceEl.textContent.trim() : '';

        // 쿠팡 로켓배송은 보통 무료배송
        const rocketEl = el.querySelector('.badge-rocket, .rocket-icon, .badge.rocket');
        const shipping = rocketEl ? '무료배송' : '확인필요';

        const linkEl = el.querySelector('a.search-product-link, a[href*="/vp/"]');
        let itemUrl = linkEl ? linkEl.href : '';
        if (itemUrl && !itemUrl.startsWith('http')) {
          itemUrl = 'https://www.coupang.com' + itemUrl;
        }

        if (name && price) {
          products.push({ name, price, shipping, url: itemUrl });
        }
      });

      return products;
    });

    for (const item of items) {
      results.push({
        site: SITE_NAME,
        name: item.name.substring(0, 80),
        price: parsePrice(item.price),
        priceText: item.price,
        shipping: item.shipping.includes('무료') ? 0 : parsePrice(item.shipping),
        shippingText: item.shipping || '확인필요',
        seller: '',
        isDepartment: false,
        url: item.url,
      });
    }

    console.log(`  [쿠팡] ${results.length}개 상품 추출 완료`);
  } catch (error) {
    console.error(`  [쿠팡] 스크래핑 실패: ${error.message}`);
  } finally {
    await page.close();
  }

  return results;
}

module.exports = { scrape, SITE_NAME };
