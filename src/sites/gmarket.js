const { createPage, parsePrice, safeGoto, delay } = require('../scraper');

const SITE_NAME = 'G마켓';

/**
 * G마켓에서 상품 검색 및 가격 추출
 * 백화점 상품 우선 추출 시도
 */
async function scrape(browser, keyword) {
  const page = await createPage(browser);
  const results = [];

  try {
    // 검색 URL 구성 (백화점 상품 필터 포함)
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `https://browse.gmarket.co.kr/search?keyword=${encodedKeyword}&category=0`;

    console.log(`  [G마켓] 검색 중: ${keyword}`);
    await safeGoto(page, url);
    await delay(3000);

    // 상품 목록 추출
    const items = await page.evaluate(() => {
      const products = [];
      // G마켓 검색 결과 상품 셀렉터
      const selectors = [
        '.box__item-container',
        '.box__component-itemcard',
        '.item_list .item',
        '.search-result .item',
      ];

      let elements = [];
      for (const sel of selectors) {
        elements = document.querySelectorAll(sel);
        if (elements.length > 0) break;
      }

      elements.forEach((el, i) => {
        if (i >= 5) return; // 상위 5개만

        // 상품명 추출
        const nameEl = el.querySelector('.text__item-title, .item_title, .title a, a.link__item');
        const name = nameEl ? nameEl.textContent.trim() : '';

        // 가격 추출
        const priceEl = el.querySelector('.box__price-seller .text__value, .item_price .price_real, .price strong, .text__price');
        const price = priceEl ? priceEl.textContent.trim() : '';

        // 배송비 추출
        const shippingEl = el.querySelector('.text__shipping, .item_delivery, .delivery');
        const shipping = shippingEl ? shippingEl.textContent.trim() : '확인필요';

        // 판매자 추출
        const sellerEl = el.querySelector('.text__seller, .item_seller, .seller');
        const seller = sellerEl ? sellerEl.textContent.trim() : '';

        // 백화점 상품 여부
        const isDept = el.querySelector('.badge__department, .icon_depart') !== null ||
                       seller.includes('백화점');

        // 상품 URL
        const linkEl = el.querySelector('a[href*="item"], a.link__item, .title a');
        let itemUrl = linkEl ? linkEl.href : '';
        if (itemUrl && !itemUrl.startsWith('http')) {
          itemUrl = 'https://www.gmarket.co.kr' + itemUrl;
        }

        if (name && price) {
          products.push({ name, price, shipping, seller, isDepartment: isDept, url: itemUrl });
        }
      });

      return products;
    });

    // 결과 가공
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

    console.log(`  [G마켓] ${results.length}개 상품 추출 완료`);
  } catch (error) {
    console.error(`  [G마켓] 스크래핑 실패: ${error.message}`);
  } finally {
    await page.close();
  }

  return results;
}

module.exports = { scrape, SITE_NAME };
