const { createPage, parsePrice, safeGoto, delay } = require('../scraper');

const SITE_NAME = '11번가';

/**
 * 11번가에서 상품 검색 및 가격 추출
 */
async function scrape(browser, keyword) {
  const page = await createPage(browser);
  const results = [];

  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `https://search.11st.co.kr/MW/search?searchKeyword=${encodedKeyword}`;

    console.log(`  [11번가] 검색 중: ${keyword}`);
    await safeGoto(page, url);
    await delay(3000);

    const items = await page.evaluate(() => {
      const products = [];
      const elements = document.querySelectorAll('.c_listing_product_item, .search_list li, .l_grid .l_grid_item, li.product_item');

      elements.forEach((el, i) => {
        if (i >= 5) return;

        const nameEl = el.querySelector('.c_prd_name, .item_title, .info_tit a, .product_name');
        const name = nameEl ? nameEl.textContent.trim() : '';

        const priceEl = el.querySelector('.c_prd_price, .item_price, .price_value, .product_price strong');
        const price = priceEl ? priceEl.textContent.trim() : '';

        const shippingEl = el.querySelector('.c_prd_delivery, .item_delivery, .delivery');
        const shipping = shippingEl ? shippingEl.textContent.trim() : '확인필요';

        const sellerEl = el.querySelector('.c_prd_seller, .seller_name');
        const seller = sellerEl ? sellerEl.textContent.trim() : '';

        const linkEl = el.querySelector('a[href*="product"], a[href*="products"]');
        let itemUrl = linkEl ? linkEl.href : '';
        if (itemUrl && !itemUrl.startsWith('http')) {
          itemUrl = 'https://www.11st.co.kr' + itemUrl;
        }

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

    console.log(`  [11번가] ${results.length}개 상품 추출 완료`);
  } catch (error) {
    console.error(`  [11번가] 스크래핑 실패: ${error.message}`);
  } finally {
    await page.close();
  }

  return results;
}

module.exports = { scrape, SITE_NAME };
