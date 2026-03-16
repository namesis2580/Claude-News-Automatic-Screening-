const { createPage, parsePrice, safeGoto, delay } = require('../scraper');

const SITE_NAME = '다나와';

/**
 * 다나와에서 상품 검색 및 가격 추출
 */
async function scrape(browser, keyword) {
  const page = await createPage(browser);
  const results = [];

  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `https://search.danawa.com/dsearch.php?query=${encodedKeyword}&tab=goods`;

    console.log(`  [다나와] 검색 중: ${keyword}`);
    await safeGoto(page, url);
    await delay(3000);

    const items = await page.evaluate(() => {
      const products = [];
      const elements = document.querySelectorAll('.prod_main_info, .product_list li, .search_list li');

      elements.forEach((el, i) => {
        if (i >= 5) return;

        const nameEl = el.querySelector('.prod_name a, .product_name, .tit a');
        const name = nameEl ? nameEl.textContent.trim() : '';

        const priceEl = el.querySelector('.price_sect strong, .product_price, .price_info .txt_prc');
        const price = priceEl ? priceEl.textContent.trim() : '';

        const shippingEl = el.querySelector('.ship_fee, .delivery, .item_delivery');
        const shipping = shippingEl ? shippingEl.textContent.trim() : '확인필요';

        const sellerEl = el.querySelector('.mall_name, .seller_name');
        const seller = sellerEl ? sellerEl.textContent.trim() : '';

        const linkEl = el.querySelector('.prod_name a, a[href*="prod"]');
        let itemUrl = linkEl ? linkEl.href : '';

        if (name && price) {
          products.push({ name, price, shipping, seller, url: itemUrl });
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
        isDepartment: false,
        url: item.url,
      });
    }

    console.log(`  [다나와] ${results.length}개 상품 추출 완료`);
  } catch (error) {
    console.error(`  [다나와] 스크래핑 실패: ${error.message}`);
  } finally {
    await page.close();
  }

  return results;
}

module.exports = { scrape, SITE_NAME };
