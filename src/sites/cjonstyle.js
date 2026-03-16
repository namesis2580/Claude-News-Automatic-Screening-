const { createPage, parsePrice, safeGoto, delay } = require('../scraper');

const SITE_NAME = 'CJ온스타일';

/**
 * CJ온스타일에서 상품 검색 및 가격 추출
 */
async function scrape(browser, keyword) {
  const page = await createPage(browser);
  const results = [];

  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `https://display.cjonstyle.com/p/search/main?query=${encodedKeyword}`;

    console.log(`  [CJ온스타일] 검색 중: ${keyword}`);
    await safeGoto(page, url);
    await delay(3000);

    const items = await page.evaluate(() => {
      const products = [];
      const elements = document.querySelectorAll('.product-item, .search_list li, .prd_item, .item_unit');

      elements.forEach((el, i) => {
        if (i >= 5) return;

        const nameEl = el.querySelector('.product-name, .prd_name, .item_name, .tit a');
        const name = nameEl ? nameEl.textContent.trim() : '';

        const priceEl = el.querySelector('.product-price, .prd_price, .item_price, .price strong');
        const price = priceEl ? priceEl.textContent.trim() : '';

        const shippingEl = el.querySelector('.product-delivery, .delivery, .item_delivery');
        const shipping = shippingEl ? shippingEl.textContent.trim() : '확인필요';

        const linkEl = el.querySelector('a[href*="product"], a[href*="goods"]');
        let itemUrl = linkEl ? linkEl.href : '';
        if (itemUrl && !itemUrl.startsWith('http')) {
          itemUrl = 'https://www.cjonstyle.com' + itemUrl;
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
        seller: 'CJ온스타일',
        isDepartment: false,
        url: item.url,
      });
    }

    console.log(`  [CJ온스타일] ${results.length}개 상품 추출 완료`);
  } catch (error) {
    console.error(`  [CJ온스타일] 스크래핑 실패: ${error.message}`);
  } finally {
    await page.close();
  }

  return results;
}

module.exports = { scrape, SITE_NAME };
