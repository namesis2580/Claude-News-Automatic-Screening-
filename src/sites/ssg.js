const { createPage, parsePrice, safeGoto, delay } = require('../scraper');

const SITE_NAME = 'SSG.COM';

/**
 * SSG.COM에서 상품 검색 및 가격 추출
 */
async function scrape(browser, keyword) {
  const page = await createPage(browser);
  const results = [];

  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `https://www.ssg.com/search.ssg?target=all&query=${encodedKeyword}`;

    console.log(`  [SSG.COM] 검색 중: ${keyword}`);
    await safeGoto(page, url);
    await delay(3000);

    const items = await page.evaluate(() => {
      const products = [];
      const elements = document.querySelectorAll('.cunit_prod, .csrch_item, .item_unit');

      elements.forEach((el, i) => {
        if (i >= 5) return;

        const nameEl = el.querySelector('.cunit_info .title, .csrch_name, .item_name a');
        const name = nameEl ? nameEl.textContent.trim() : '';

        const priceEl = el.querySelector('.cunit_price .ssg_price, .opt_price .ssg_price, .item_price em');
        const price = priceEl ? priceEl.textContent.trim() : '';

        const shippingEl = el.querySelector('.cunit_delivery, .csrch_delivery, .item_delivery');
        const shipping = shippingEl ? shippingEl.textContent.trim() : '확인필요';

        const sellerEl = el.querySelector('.cunit_store, .csrch_mall');
        const seller = sellerEl ? sellerEl.textContent.trim() : '';
        const isDept = seller.includes('백화점') || seller.includes('신세계');

        const linkEl = el.querySelector('a[href*="item"], .title a');
        let itemUrl = linkEl ? linkEl.href : '';
        if (itemUrl && !itemUrl.startsWith('http')) {
          itemUrl = 'https://www.ssg.com' + itemUrl;
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

    console.log(`  [SSG.COM] ${results.length}개 상품 추출 완료`);
  } catch (error) {
    console.error(`  [SSG.COM] 스크래핑 실패: ${error.message}`);
  } finally {
    await page.close();
  }

  return results;
}

module.exports = { scrape, SITE_NAME };
