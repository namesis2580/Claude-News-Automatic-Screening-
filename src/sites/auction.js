const { createPage, parsePrice, safeGoto, delay } = require('../scraper');

const SITE_NAME = '옥션';

/**
 * 옥션에서 상품 검색 및 가격 추출
 */
async function scrape(browser, keyword) {
  const page = await createPage(browser);
  const results = [];

  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `https://browse.auction.co.kr/search?keyword=${encodedKeyword}`;

    console.log(`  [옥션] 검색 중: ${keyword}`);
    await safeGoto(page, url);
    await delay(3000);

    const items = await page.evaluate(() => {
      const products = [];
      const elements = document.querySelectorAll('.component--item_card, .item_list .item, .search-result .item, .box__item-container');

      elements.forEach((el, i) => {
        if (i >= 5) return;

        const nameEl = el.querySelector('.text--title, .item_title, .title a, .text__item-title');
        const name = nameEl ? nameEl.textContent.trim() : '';

        const priceEl = el.querySelector('.text--price_seller, .price_real, .price strong, .text__value');
        const price = priceEl ? priceEl.textContent.trim() : '';

        const shippingEl = el.querySelector('.text--shipping, .item_delivery, .delivery');
        const shipping = shippingEl ? shippingEl.textContent.trim() : '확인필요';

        const sellerEl = el.querySelector('.text--seller, .item_seller');
        const seller = sellerEl ? sellerEl.textContent.trim() : '';

        const linkEl = el.querySelector('a[href*="item"], a.link--item, .title a');
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

    console.log(`  [옥션] ${results.length}개 상품 추출 완료`);
  } catch (error) {
    console.error(`  [옥션] 스크래핑 실패: ${error.message}`);
  } finally {
    await page.close();
  }

  return results;
}

module.exports = { scrape, SITE_NAME };
