// Временная headless-проверка: доводка смены топиков — JS-пружина вместо
// CSS-transition Swiper (подхват скорости пальца, slideChange после остановки).
import { chromium } from 'playwright-core';

const EXEC =
  '/Users/vakirianov/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const BASE = 'http://localhost:5179';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS: ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    failed += 1;
    console.log(`FAIL: ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

const browser = await chromium.launch({ executablePath: EXEC });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

async function cdpSwipe(x0, y, x1, durMs = 250) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  const steps = 16;
  for (let i = 1; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await wait(durMs / steps);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function longPress(x, y) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await wait(650);
  await page.mouse.up();
}

async function activeTabName() {
  return page
    .locator('.island-glass button[aria-selected="true"]')
    .first()
    .textContent()
    .then((t) => (t ?? '').trim());
}

async function swiperState() {
  return page.evaluate(() => {
    const el = document.querySelector('swiper-container');
    if (!el || !el.swiper) return null;
    const s = el.swiper;
    return {
      translate: s.translate,
      activeIndex: s.activeIndex,
      width: el.clientWidth,
      slides: s.slides.length,
    };
  });
}

const results = [];

try {
  // ── Регистрация ────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Регистрация' }).click();
  const uname = `qa${Date.now() % 100000000}`;
  await page.locator('input[placeholder="Логин"]').fill(uname);
  await page.locator('input[placeholder="Пароль"]').fill('password123');
  await page.locator('form button[type="submit"]').click();
  await page.getByText('Создайте топик').waitFor({ timeout: 15000 });
  results.push(['регистрация и переход на главную', true]);
  console.log('OK: регистрация');

  // ── Создание топиков А и Б ─────────────────────────────────────────────
  async function createTopicModal(name) {
    const form = page.locator('form', { hasText: 'Новый топик' });
    await form.locator('input[placeholder="Название"]').fill(name);
    await form.locator('button[type="submit"]').click();
  }

  // Первый топик — кнопкой «Создать» на пустом экране.
  await page.getByRole('button', { name: /Создать/ }).first().click();
  await createTopicModal('А');
  await page.locator('.island-glass button', { hasText: 'А' }).first().waitFor({ timeout: 8000 });

  // Второй — долгий тап по табу «А» → меню → «Создать топик».
  const tabA = page.locator('.island-glass button', { hasText: 'А' }).first();
  const tb = await tabA.boundingBox();
  await longPress(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.getByRole('button', { name: 'Создать топик' }).click();
  await createTopicModal('Б');
  await page.locator('.island-glass button', { hasText: 'Б' }).first().waitFor({ timeout: 8000 });
  await wait(600);
  results.push(['созданы топики А и Б', true]);
  console.log('OK: топики А и Б');

  // ── Заметки ────────────────────────────────────────────────────────────
  async function addNote(text) {
    const ta = page.locator('textarea[placeholder="Написать заметку…"]');
    await ta.click();
    await page.keyboard.type(text, { delay: 10 });
    await page.keyboard.press('Enter');
    await page.getByText(text).first().waitFor({ timeout: 8000 });
    await wait(300);
  }

  async function gotoTab(name) {
    await page.locator('.island-glass button', { hasText: name }).first().click();
    await wait(700);
  }

  await gotoTab('А');
  await addNote('заметка А1');
  await addNote('заметка А2');
  await gotoTab('Б');
  await addNote('заметка Б1');
  await gotoTab('А');
  await wait(400);
  console.log('OK: заметки');

  // ── Проба: события свайпера с метками времени ─────────────────────────
  async function probeEvents() {
    return page.evaluate(() => {
      window.__marks = [];
      const el = document.querySelector('swiper-container');
      const s = el.swiper;
      s.on('touchEnd', () => window.__marks.push(['touchend', performance.now()]));
      s.on('slideChange', () =>
        window.__marks.push(['slideChange', performance.now(), s.activeIndex, s.translate]),
      );
      return true;
    });
  }
  async function readMarks(clear = true) {
    return page.evaluate((doClear) => {
      const m = window.__marks ?? [];
      if (doClear) window.__marks = [];
      return m;
    }, clear);
  }

  // События ВНУТРЕННЕГО свайпера уровней (вложен в слайд живого топика:
  // внешний — document.querySelector('swiper-container'), внутренний ищем
  // внутри слайда). Метки — в тот же window.__marks, что и у внешнего
  // (проверки не пересекаются).
  async function probeEventsInner() {
    return page.evaluate(() => {
      window.__marks = [];
      const el = document.querySelector('swiper-slide swiper-container');
      if (!el || !el.swiper) return false;
      const s = el.swiper;
      s.on('touchEnd', () => window.__marks.push(['touchend', performance.now()]));
      s.on('slideChange', () =>
        window.__marks.push(['slideChange', performance.now(), s.activeIndex, s.translate]),
      );
      return true;
    });
  }
  async function innerState() {
    return page.evaluate(() => {
      const el = document.querySelector('swiper-slide swiper-container');
      if (!el || !el.swiper) return null;
      const s = el.swiper;
      return {
        translate: s.translate,
        activeIndex: s.activeIndex,
        width: el.clientWidth,
        slides: s.slides.length,
      };
    });
  }

  const swBox = await page.locator('swiper-container.chat-swiper').boundingBox();
  const y = swBox.y + swBox.height * 0.55;
  const xL = swBox.x + swBox.width * 0.82;
  const xR = swBox.x + swBox.width * 0.18;
  const W = swBox.width;

  // Проверка 1: свайп влево (А → Б), доводка-пружина.
  await probeEvents();
  await cdpSwipe(xL, y, xR, 250);
  await wait(100); // доводка ещё идёт — таб должен подсветиться сразу
  const tabEarly = await activeTabName();
  const mEarly = await readMarks(false);
  const scEarly = mEarly.filter((a) => a[0] === 'slideChange').length;
  ok(
    'свайп А→Б: таб Б подсвечен сразу (до конца доводки)',
    tabEarly.includes('Б') && scEarly === 0,
    `активный="${tabEarly}", slideChange ещё не было`,
  );
  await wait(900);
  const m1 = await readMarks();
  const te1 = m1.find((a) => a[0] === 'touchend');
  const sc1 = m1.find((a) => a[0] === 'slideChange');
  const dt1 = te1 && sc1 ? sc1[1] - te1[1] : -1;
  const scCount1 = m1.filter((a) => a[0] === 'slideChange').length;
  const tab1 = await activeTabName();
  const st1 = await swiperState();
  ok('свайп А→Б: slideChange после отпускания (пружина, dt>60мс)', dt1 >= 60 && dt1 <= 900, `dt=${dt1.toFixed(0)}мс`);
  ok('свайп А→Б: ровно один slideChange', scCount1 === 1, `count=${scCount1}`);
  ok('свайп А→Б: активен топик Б', tab1.includes('Б'), `активный="${tab1}"`);
  ok('свайп А→Б: слайд стоит у цели', st1 !== null && Math.abs(st1.translate + st1.width) < 4, `translate=${st1?.translate.toFixed(1)}`);
  const bContent = await page
    .locator('swiper-slide[data-topic-id]')
    .nth(1)
    .textContent()
    .then((t) => (t ?? '').includes('заметка Б1'));
  ok('свайп А→Б: контент Б на месте', bContent);

  // Проверка 2: свайп вправо (Б → А).
  await probeEvents();
  await cdpSwipe(xR, y, xL, 250);
  await wait(900);
  const m2 = await readMarks();
  const te2 = m2.find((a) => a[0] === 'touchend');
  const sc2 = m2.find((a) => a[0] === 'slideChange');
  const dt2 = te2 && sc2 ? sc2[1] - te2[1] : -1;
  const tab2 = await activeTabName();
  const st2 = await swiperState();
  ok('свайп Б→А: slideChange после отпускания (пружина)', dt2 >= 60 && dt2 <= 900, `dt=${dt2.toFixed(0)}мс`);
  ok('свайп Б→А: активен топик А', tab2.includes('А'), `активный="${tab2}"`);
  ok('свайп Б→А: слайд у цели', st2 !== null && Math.abs(st2.translate) < 4, `translate=${st2?.translate.toFixed(1)}`);

  // Проверка 3: программный переход (клик по табу «Б») — orig slideTo цел.
  await page.locator('.island-glass button', { hasText: 'Б' }).first().click();
  await wait(900);
  const tab3 = await activeTabName();
  const st3 = await swiperState();
  ok('клик по табу Б: переключение работает', tab3.includes('Б'));
  ok('клик по табу Б: слайд у цели', st3 !== null && Math.abs(st3.translate + st3.width) < 4, `translate=${st3?.translate.toFixed(1)}`);

  // Проверка 4: быстрый двойной свайп «передумал» (влево, затем вправо,
  // пока пружина ещё едет) — слайд не застревает, активный снова А.
  await probeEvents();
  await cdpSwipe(xL, y, xR, 250); // А → Б (пружина поехала)
  await wait(110); // ловим слайд на полпути
  await cdpSwipe(xR, y, xL, 250); // передумали → назад к А
  await wait(900);
  const tab4 = await activeTabName();
  const st4 = await swiperState();
  ok('двойной свайп «передумал»: активный снова А', tab4.includes('А'), `активный="${tab4}"`);
  ok('двойной свайп: слайд не застрял', st4 !== null && Math.abs(st4.translate) < 4, `translate=${st4?.translate.toFixed(1)}`);

  // Проверка 5: «Уровни — слайды» (вложенный Swiper в папках). Вход в папку
  // тапом по строке — анимированный переезд к глубокому слайду; свайп-влево
  // в папке не выходит (дальше некуда); выход — свайп-вправо с доводкой-
  // пружиной внутреннего свайпера (dt > 60мс, как у топиков); палец, ушедший
  // за вьюпорт, не «залипает» (регрессия самописного drag-follow).
  const tabA2 = page.locator('.island-glass button', { hasText: 'А' }).first();
  const tb2 = await tabA2.boundingBox();
  await longPress(tb2.x + tb2.width / 2, tb2.y + tb2.height / 2);
  await page.getByRole('button', { name: 'Создать топик' }).click();
  await createTopicModal('В');
  await page.locator('.island-glass button', { hasText: 'В' }).first().waitFor({ timeout: 8000 });
  await page.locator('.island-glass button', { hasText: 'В' }).first().click();
  await wait(800);

  // Пустое место списка (ниже островка): долгий тап → QuickMenu «Создать папку».
  const emptyY = swBox.y + Math.min(170, swBox.height * 0.4);
  await longPress(swBox.x + swBox.width * 0.5, emptyY);
  await page.getByRole('menuitem', { name: 'Создать папку' }).click();
  const folderForm = page.locator('form', { hasText: 'Новая папка' });
  await folderForm.locator('input[placeholder="Название"]').fill('П1');
  await folderForm.locator('button[type="submit"]').click();
  const folderRow = page.locator('.chat-scroll button', { hasText: 'П1' }).first();
  await folderRow.waitFor({ timeout: 8000 });
  console.log('OK: папка П1 создана');

  // Вход в папку тапом по строке: цепочка растёт — внутренний свайпер ведёт
  // к глубокому слайду (корень → П1), активный слайд = 1.
  await folderRow.click();
  await wait(900);
  const inSt = await innerState();
  const tabIn = await activeTabName();
  ok(
    'вход в папку: активный слайд уровней — П1',
    inSt !== null && inSt.activeIndex === 1 && tabIn.includes('П1'),
    `activeIndex=${inSt?.activeIndex}, слайдов=${inSt?.slides}, таб="${tabIn}"`,
  );

  // Заметка пишется в активный уровень (П1) и видна на глубоком слайде.
  await addNote('заметка В1');
  const v1Seen = await page
    .locator('swiper-slide swiper-container swiper-slide')
    .last()
    .textContent()
    .then((t) => (t ?? '').includes('заметка В1'));
  ok('заметка внутри папки на глубоком слайде', v1Seen);

  // Свайп-влево в папке: глубже некуда — остаёмся в П1, топики не листаются.
  await cdpSwipe(xL, y, xR, 250);
  await wait(900);
  const tabL = await activeTabName();
  const stL = await innerState();
  ok(
    'свайп-влево в папке: не выходит из П1',
    tabL.includes('П1') && stL !== null && stL.activeIndex === 1,
    `таб="${tabL}", activeIndex=${stL?.activeIndex}`,
  );

  // Выход свайпом-вправо: доводка-пружина внутреннего свайпера — slideChange
  // после отпускания (dt > 60мс), уровень в сторе меняется на корень.
  await probeEventsInner();
  await cdpSwipe(xR, y, xL, 250);
  await wait(900);
  const m5 = await readMarks();
  const te5 = m5.find((a) => a[0] === 'touchend');
  const sc5 = m5.find((a) => a[0] === 'slideChange');
  const dt5 = te5 && sc5 ? sc5[1] - te5[1] : -1;
  const scCount5 = m5.filter((a) => a[0] === 'slideChange').length;
  const tab5 = await activeTabName();
  const st5 = await innerState();
  const rowBack = await page
    .locator('.chat-scroll button', { hasText: 'П1' })
    .count()
    .then((n) => n > 0);
  ok(
    'выход из папки свайпом: slideChange после отпускания (пружина)',
    dt5 >= 60 && dt5 <= 900,
    `dt=${dt5.toFixed(0)}мс`,
  );
  ok('выход из папки свайпом: ровно один slideChange', scCount5 === 1, `count=${scCount5}`);
  ok('выход из папки свайпом: снова корень В', tab5.includes('В') && !tab5.includes('П1'), `таб="${tab5}"`);
  ok(
    'выход из папки свайпом: слайд уровней у корня',
    st5 !== null && st5.activeIndex === 0 && Math.abs(st5.translate) < 4,
    `activeIndex=${st5?.activeIndex}, translate=${st5?.translate.toFixed(1)}`,
  );
  ok('выход из папки свайпом: папка П1 снова в списке', rowBack);

  // Регрессия бага «палец убрали за вьюпорт — перетаскивание залагало»:
  // снова входим в П1 и выходим свайпом-вправо, уводя палец за правый край
  // экрана — выход должен пройти как обычно (Swiper не «залипает»).
  await page.locator('.chat-scroll button', { hasText: 'П1' }).first().click();
  await wait(900);
  const reIn = await innerState();
  ok('повторный вход в П1', reIn !== null && reIn.activeIndex === 1, `activeIndex=${reIn?.activeIndex}`);
  await cdpSwipe(60, y, 470, 250); // палец уходит за вьюпорт (ширина 390)
  await wait(900);
  const tabOut = await activeTabName();
  const stOut = await innerState();
  ok(
    'палец за вьюпортом: выход из папки не «залип»',
    tabOut.includes('В') && !tabOut.includes('П1') && stOut !== null && stOut.activeIndex === 0,
    `таб="${tabOut}", activeIndex=${stOut?.activeIndex}`,
  );

  // Проверка 6: предзагрузка цели стартует в момент отпускания — ДО конца
  // доводки. Активный «В»; создаём новый топик «Г» (кеша нет — никогда не
  // открывался) и свайпаем В→Г. Пока пружина едет (slideChange ещё не было),
  // слайд Г уже должен наполниться превью из кеша (без ⏳): предзагрузка
  // пошла сразу при отпускании, а не после остановки слайда.
  const tabV = page.locator('.island-glass button', { hasText: 'В' }).first();
  const tbV = await tabV.boundingBox();
  await longPress(tbV.x + tbV.width / 2, tbV.y + tbV.height / 2);
  await page.getByRole('button', { name: 'Создать топик' }).click();
  await createTopicModal('Г');
  await page.locator('.island-glass button', { hasText: 'Г' }).first().waitFor({ timeout: 8000 });
  await wait(500);
  const lastSlideId = await page.evaluate(() => {
    const slides = [...document.querySelectorAll('swiper-slide[data-topic-id]')];
    const last = slides[slides.length - 1];
    return last?.getAttribute('data-topic-id') ?? null;
  });
  ok('топик Г добавлен слайдом в конец', lastSlideId !== null, `id=${lastSlideId}`);

  await probeEvents();
  await cdpSwipe(xL, y, xR, 250); // В → Г
  await wait(150); // доводка ещё идёт (~590мс), slideChange не было
  const gMidText = await page
    .locator(`swiper-slide[data-topic-id="${lastSlideId}"]`)
    .innerText()
    .catch(() => '');
  const m6 = await readMarks(false);
  const sc6 = m6.filter((a) => a[0] === 'slideChange').length;
  const tab6mid = await activeTabName();
  ok(
    'свайп В→Г: слайд Г наполнен превью ДО конца доводки (предзагрузка при отпускании)',
    sc6 === 0 && !gMidText.includes('⏳'),
    `slideChange ещё нет (${sc6}), таб="${tab6mid}", ⏳=${gMidText.includes('⏳')}`,
  );
  await wait(900);
  const tab6 = await activeTabName();
  const st6 = await swiperState();
  ok('свайп В→Г: активен топик Г', tab6.includes('Г'), `активный="${tab6}"`);
  ok(
    'свайп В→Г: слайд у цели',
    st6 !== null && st6.activeIndex === 3 && Math.abs(st6.translate + st6.width * 3) < 4,
    `activeIndex=${st6?.activeIndex}, translate=${st6?.translate.toFixed(1)}`,
  );
} catch (e) {
  failed += 1;
  console.log('ОШИБКА СКРИПТА:', e.message);
} finally {
  await browser.close();
}

const totalOk = passed + results.filter((r) => r[1]).length;
console.log(`\nИТОГ: ${totalOk} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
