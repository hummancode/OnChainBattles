// Usage: start the server (npm run server) and the client (npm start), then: node scripts/qa/fullmatch.cjs
// Screenshots are written to the current directory.
// Two real browsers, lobby → battle → full match to GAME_OVER. Each client's moves are chosen
// by the SmartBot but sent through the real local path (dispatchLocal → applyAction → socket),
// so relay, server validation and state-hash checks run on every action.
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const click = async (p, x, y) => { await p.mouse.move(x, y); await sleep(150); await p.mouse.down(); await sleep(50); await p.mouse.up(); };
(async () => {
  const b = await chromium.launch();
  const issues = [];
  const mk = async (tag) => {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    p.on('pageerror', e => issues.push(`${tag} PAGEERROR ${e.message}`));
    p.on('console', m => {
      const t = m.text();
      if (m.type() === 'error' && !/401|favicon/.test(t)) issues.push(`${tag} ERR ${t.slice(0, 200)}`);
      if (/resync|REJECTED|diverged|Could not apply/i.test(t)) issues.push(`${tag} ${t.slice(0, 200)}`);
    });
    await p.goto('http://localhost:8080', { waitUntil: 'networkidle' }); await sleep(4000);
    await p.evaluate(() => { const t = window.game.scene.getScene('LoginScene').children.list.find(o => o.text === '[ PLAY AS GUEST ]'); t.emit('pointerdown'); });
    await sleep(3000);
    return p;
  };
  const host = await mk('[H]');
  await click(host, 640, 170); await sleep(1200);
  await host.keyboard.press('Enter'); await sleep(2500);
  const rooms = await (await fetch('http://localhost:3001/api/rooms')).json();
  const code = rooms.rooms.find(r => r.status === 'waiting').code;
  const joiner = await mk('[J]');
  await click(joiner, 640, 300); await sleep(1200);
  const inputs = await joiner.$$('input');
  await inputs[inputs.length - 1].fill(code);
  await joiner.keyboard.press('Enter'); await sleep(3000);
  await click(joiner, 440, 560); await sleep(1500);  // READY
  await click(host, 660, 560); await sleep(9000);    // START GAME
  await host.screenshot({ path: 'f01_host_start.png' });

  const drive = (p, level) => p.evaluate(async (level) => {
    const { nextBotAction } = await import('/src/game/ai/SimpleBot.ts');
    const { dispatchLocal, networkSink } = await import('/src/scenes/battle/InputCoordinator.ts');
    const GS = (await import('/src/GameState.ts')).default;
    window.__drive = setInterval(() => {
      const sc = window.game.scene.getScene('BattleScene');
      if (!window.game.scene.isActive('BattleScene') || !sc.engine) return;
      const e = sc.engine, me = GS.playerIndex ?? 0, st = e.getState();
      if (st.status === 'GAME_OVER' || st.turn.activePlayer !== me) return;
      const a = nextBotAction(e, me, { difficulty: level });
      if (!dispatchLocal(e, a, networkSink)) {
        if (e.getPendingKind()) dispatchLocal(e, { type: 'CANCEL_PENDING' }, networkSink);
        dispatchLocal(e, { type: e.getState().turn.phase === 'PLAY' ? 'END_PLAY_PHASE' : 'END_ACT_PHASE' }, networkSink);
      }
    }, 250);
  }, level);
  await drive(host, 'hard'); await drive(joiner, 'normal');

  const scene = p => p.evaluate(() => window.game.scene.getScenes(true).map(s => s.scene.key).join(','));
  let t = 0;
  while (t < 240) { // ≤ 4 min
    await sleep(2000); t += 2;
    const [hs, js] = [await scene(host), await scene(joiner)];
    if (hs.includes('ResultScene') && js.includes('ResultScene')) break;
    if (t % 30 === 0) await host.screenshot({ path: `f02_host_t${t}.png` });
  }
  const result = p => p.evaluate(async () => { const GS = (await import('/src/GameState.ts')).default; return GS.lastMatch; });
  const [hr, jr] = [await result(host), await result(joiner)];
  await host.screenshot({ path: 'f03_host_result.png' }); await joiner.screenshot({ path: 'f04_joiner_result.png' });
  console.log('host', JSON.stringify(hr)); console.log('joiner', JSON.stringify(jr));
  const consistent = hr && jr && hr.turns === jr.turns && (hr.isTie ? jr.isTie : hr.playerWon !== jr.playerWon);
  console.log('consistent result:', !!consistent, 'time', t, 's');
  console.log(issues.length ? issues.join('\n') : 'no issues');
  await b.close();
})();
