const { createPage, parsePrice, safeGoto, delay } = require('../scraper');

const SITE_NAME = '네이버쇼핑';

/**
 * 네이버쇼핑에서 상품 검색 (가격낮은순 정렬)
 */
async function scrape(browser, keyword) {
  const page = await createPage(browser);
  const results = [];

  try {
    const encodedKeyword = encodeURIComponent(keyword);
    // 가격낮은순 정렬: sort=price_asc
    const url = `https://search.shopping.naver.com/search/all?query=${encodedKeyword}&sort=price_asc`;

    console.log(`  [네이버쇼핑] 검색 중: ${keyword} (가격낮은순)`);
    await safeGoto(page, url);
    await delay(4000);

    const items = await page.evaluate(() => {
      const products = [];
      // 네이버쇼핑 상품 카드 셀렉터
      const elements = document.querySelectorAll('.product_item, .basicList_item__0T9JD, .item, li.product_info_area');

      elements.forEach((el, i) => {
        if (i >= 5) return;

        const nameEl = el.querySelector('.product_title, .basicList_title__VfX3c, .tit a, a.product_link__TrAac');
        const name = nameEl ? nameEl.textContent.trim() : '';

        const priceEl = el.querySelector('.product_num, .price_num__S2p_v, .price .num, span.price_num');
        const price = priceEl ? priceEl.textContent.trim() : '';

        const shippingEl = el.querySelector('.product_delivery, .basicList_delivery__WOmyo, .delivery');
        const shipping = shippingEl ? shippingEl.textContent.trim() : '확인필요';

        const sellerEl = el.querySelector('.product_mall_title, .basicList_mall_name__IEHPY, .mall_nm');
        const seller = sellerEl ? sellerEl.textContent.trim() : '';

        const isDept = seller.includes('백화점') || seller.includes('현대') || seller.includes('롯데');

        const linkEl = el.querySelector('a[href*="shopping"], a.product_link__TrAac, .tit a');
        let itemUrl = linkEl ? linkEl.href : '';

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

    console.log(`  [네이버쇼핑] ${results.length}개 상품 추출 완료`);
  } catch (error) {
    console.error(`  [네이버쇼핑] 스크래핑 실패: ${error.message}`);
  } finally {
    await page.close();
  }

  return results;
}

module.exports = { scrape, SITE_NAME };
