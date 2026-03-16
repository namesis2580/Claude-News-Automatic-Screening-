const { createPage, parsePrice, safeGoto, delay } = require('../scraper');

const SITE_NAME = '롯데ON';

/**
 * 롯데ON에서 상품 검색 및 가격 추출
 */
async function scrape(browser, keyword) {
  const page = await createPage(browser);
  const results = [];

  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `https://www.lotteon.com/search/search/search.ecn?render=search&platform=pc&q=${encodedKeyword}`;

    console.log(`  [롯데ON] 검색 중: ${keyword}`);
    await safeGoto(page, url);
    await delay(4000);

    const items = await page.evaluate(() => {
      const products = [];
      const elements = document.querySelectorAll('.srchProductItem, .product-item, .search_list li, .item');

      elements.forEach((el, i) => {
        if (i >= 5) return;

        const nameEl = el.querySelector('.srchProductItem__title, .product-name, .item_name, a.srchProductUnitTitle');
        const name = nameEl ? nameEl.textContent.trim() : '';

        const priceEl = el.querySelector('.srchProductItem__price, .product-price, .item_price, .srchProductUnitPrice em');
        const price = priceEl ? priceEl.textContent.trim() : '';

        const shippingEl = el.querySelector('.srchProductItem__delivery, .product-delivery, .item_delivery');
        const shipping = shippingEl ? shippingEl.textContent.trim() : '확인필요';

        const sellerEl = el.querySelector('.srchProductItem__seller, .seller-name');
        const seller = sellerEl ? sellerEl.textContent.trim() : '';
        const isDept = seller.includes('백화점') || seller.includes('롯데');

        const linkEl = el.querySelector('a[href*="product"], a[href*="goods"]');
        let itemUrl = linkEl ? linkEl.href : '';
        if (itemUrl && !itemUrl.startsWith('http')) {
          itemUrl = 'https://www.lotteon.com' + itemUrl;
        }

        if (name && price) {
          products.push({ name, price, shipping, seller, isDepartment: isDept, url: itemUrl });
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
        seller: item.seller,
        isDepartment: item.isDepartment,
        url: item.url,
      });
    }

    console.log(`  [롯데ON] ${results.length}개 상품 추출 완료`);
  } catch (error) {
    console.error(`  [롯데ON] 스크래핑 실패: ${error.message}`);
  } finally {
    await page.close();
  }

  return results;
}

module.exports = { scrape, SITE_NAME };
