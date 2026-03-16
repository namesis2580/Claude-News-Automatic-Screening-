const { createPage, parsePrice, safeGoto, delay } = require('../scraper');

const SITE_NAME = '마켓컬리';

/**
 * 마켓컬리에서 상품 검색 및 가격 추출
 */
async function scrape(browser, keyword) {
  const page = await createPage(browser);
  const results = [];

  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `https://www.kurly.com/search?sword=${encodedKeyword}`;

    console.log(`  [마켓컬리] 검색 중: ${keyword}`);
    await safeGoto(page, url);
    await delay(4000);

    const items = await page.evaluate(() => {
      const products = [];
      const elements = document.querySelectorAll('[class*="ProductList"] a, .search-product-item, .goods_list li, [class*="product-item"]');

      elements.forEach((el, i) => {
        if (i >= 5) return;

        const nameEl = el.querySelector('[class*="Name"], [class*="name"], .goods_name, .item_name');
        const name = nameEl ? nameEl.textContent.trim() : '';

        const priceEl = el.querySelector('[class*="Price"]:not([class*="discount"]), [class*="price"] span, .goods_price, .item_price');
        const price = priceEl ? priceEl.textContent.trim() : '';

        const linkEl = el.closest('a') || el.querySelector('a');
        let itemUrl = linkEl ? linkEl.href : '';
        if (itemUrl && !itemUrl.startsWith('http')) {
          itemUrl = 'https://www.kurly.com' + itemUrl;
        }

        if (name && price) {
          products.push({ name, price, shipping: '무료배송(조건부)', url: itemUrl });
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
        shipping: 0,
        shippingText: item.shipping || '무료배송(조건부)',
        seller: '마켓컬리',
        isDepartment: false,
        url: item.url,
      });
    }

    console.log(`  [마켓컬리] ${results.length}개 상품 추출 완료`);
  } catch (error) {
    console.error(`  [마켓컬리] 스크래핑 실패: ${error.message}`);
  } finally {
    await page.close();
  }

  return results;
}

module.exports = { scrape, SITE_NAME };
