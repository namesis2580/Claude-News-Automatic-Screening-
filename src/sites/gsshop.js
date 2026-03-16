const { createPage, parsePrice, safeGoto, delay } = require('../scraper');

const SITE_NAME = 'GS Shop';

/**
 * GS Shop에서 상품 검색 및 가격 추출
 */
async function scrape(browser, keyword) {
  const page = await createPage(browser);
  const results = [];

  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `https://www.gsshop.com/search/total-search?keyword=${encodedKeyword}`;

    console.log(`  [GS Shop] 검색 중: ${keyword}`);
    await safeGoto(page, url);
    await delay(3000);

    const items = await page.evaluate(() => {
      const products = [];
      const elements = document.querySelectorAll('.prd-item, .search_list li, .product-list li, .item_unit');

      elements.forEach((el, i) => {
        if (i >= 5) return;

        const nameEl = el.querySelector('.prd-name, .item_name, .tit a, .product_name');
        const name = nameEl ? nameEl.textContent.trim() : '';

        const priceEl = el.querySelector('.prd-price, .item_price, .price strong, .product_price');
        const price = priceEl ? priceEl.textContent.trim() : '';

        const shippingEl = el.querySelector('.prd-delivery, .delivery, .item_delivery');
        const shipping = shippingEl ? shippingEl.textContent.trim() : '확인필요';

        const linkEl = el.querySelector('a[href*="product"], a[href*="goods"]');
        let itemUrl = linkEl ? linkEl.href : '';
        if (itemUrl && !itemUrl.startsWith('http')) {
          itemUrl = 'https://www.gsshop.com' + itemUrl;
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
        seller: 'GS Shop',
        isDepartment: false,
        url: item.url,
      });
    }

    console.log(`  [GS Shop] ${results.length}개 상품 추출 완료`);
  } catch (error) {
    console.error(`  [GS Shop] 스크래핑 실패: ${error.message}`);
  } finally {
    await page.close();
  }

  return results;
}

module.exports = { scrape, SITE_NAME };
