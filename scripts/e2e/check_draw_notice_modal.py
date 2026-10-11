# Browser regression: draw notice modal must keep footer actions visible (run with dev server on :8080).
import asyncio
from playwright.async_api import async_playwright
JS = "async () => { const m = await import('/src/test/e2e/draw-modal-harness.tsx'); m.mount(); await new Promise(r => setTimeout(r, 800)); }"
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(headless=True)
    cases = [("narrow575x1000",575,1000,1),("560x600",560,600,1),("1280x720@125",1024,576,1.25),("1280x720@150",853,480,1.5),("1280x720@200",640,360,2),("mobile390x640",390,640,2),("320x480",320,480,2)]
    for name,w,hgt,dpr in cases:
      c = await b.new_context(viewport={"width":w,"height":hgt}, device_scale_factor=dpr); pg = await c.new_page()
      await pg.goto("http://localhost:8080/privacy"); await pg.wait_for_timeout(1500)
      await pg.evaluate(JS)
      dlg = await pg.locator('[role=dialog]').bounding_box()
      foot = await pg.get_by_test_id('footer').bounding_box()
      send = pg.get_by_test_id('send')
      body = pg.get_by_test_id('body')
      sh = await body.evaluate("e => [e.scrollHeight, e.clientHeight]")
      await body.hover(); await pg.mouse.wheel(0, 5000); await pg.wait_for_timeout(300)
      ch_vis = await pg.get_by_test_id('channels').is_visible()
      ch_box = await pg.get_by_test_id('channels').bounding_box()
      inview = ch_box and ch_box['y'] + ch_box['height'] <= foot['y'] + 1
      clicked = True
      try: await send.click(timeout=2000, trial=True)
      except Exception: clicked = False
      print(f"{name}: dialog top={dlg['y']:.0f} bottom={dlg['y']+dlg['height']:.0f}/{hgt} footer bottom={foot['y']+foot['height']:.0f} bodyScroll={sh} channelsReachable={bool(inview)} sendClickable={clicked}")
      await pg.screenshot(path=f"/tmp/{name}.png")
      await c.close()
    await b.close()
asyncio.run(main())
