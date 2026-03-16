const { createPage, parsePrice, safeGoto, delay } = require('../scraper');

const SITE_NAME = '올리브영';

/**
 * 올리브영에서 상품 검색 및 가격 추출
 */
async function scrape(browser, keyword) {
  const page = await createPage(browser);
  const results = [];

  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=${encodedKeyword}`;

    console.log(`  [올리브영] 검색 중: ${keyword}`);
    await safeGoto(page, url);
    await delay(3000);

    const items = await page.evaluate(() => {
      const products = [];
      const elements = document.querySelectorAll('.prd_info, .search_list li, .product_list li, .cate_prd_list li');

      elements.forEach((el, i) => {
        if (i >= 5) return;

        const nameEl = el.querySelector('.tx_name, .prd_name, .item_name a, a.prd_name');
        const name = nameEl ? nameEl.textContent.trim() : '';

        const priceEl = el.querySelector('.tx_cur .tx_num, .prd_price, .item_price, span.price');
        const price = priceEl ? priceEl.textContent.trim() : '';

        const shippingEl = el.querySelector('.delivery, .item_delivery');
        const shipping = shippingEl ? shippingEl.textContent.trim() : '확인필요';

        const linkEl = el.querySelector('a[href*="goods"], a[href*="product"]');
        let itemUrl = linkEl ? linkEl.href : '';
        if (itemUrl && !itemUrl.startsWith('http')) {
          itemUrl = 'https://www.oliveyoung.co.kr' + itemUrl;
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
        seller: '올리브영',
        isDepartment: false,
        url: item.url,
      });
    }

    console.log(`  [올리브영] ${results.length}개 상품 추출 완료`);
  } catch (error) {
    console.error(`  [올리브영] 스크래핑 실패: ${error.message}`);
  } finally {
    await page.close();
  }

  return results;
}

module.exports = { scrape, SITE_NAME };
