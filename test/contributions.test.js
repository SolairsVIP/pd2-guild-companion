import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';

test('交付才累计，重复交付不重复计数，徽章门槛由服务端校验且并发领取唯一', async () => {
  const app=createApp({dbPath:':memory:'}); await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}/api`;
  async function call(path,body,cookie='') { const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie}; }
  const account=username=>({username,password:'BadgeTest2026!',nickname:username,character:username,className:'法师',level:80,mode:'SC 天梯'});
  try {
    const owner=await call('/setup',{guild:'贡献测试',...account('giver')});
    const invitation=await call('/invites',{},owner.cookie);
    const receiver=await call('/register',{...account('receiver'),invite:invitation.body.code});
    assert.equal((await call('/badges/claim',{badgeId:'first-gift'})).status,401);
    assert.equal((await call('/badges/claim',{badgeId:'first-gift',completedShares:999},owner.cookie)).status,409);
    assert.equal((await call('/badges/claim',{badgeId:'fake'},owner.cookie)).status,400);
    for(let i=0;i<5;i++) {
      await call('/gear',{name:`装备 ${i}`,category:'防具',description:'测试属性'},owner.cookie);
      const gear=(await call('/state',undefined,owner.cookie)).body.gear.find(g=>g.name===`装备 ${i}`);
      await call(`/gear/${gear.id}/claim`,{},receiver.cookie);
      assert.equal((await call('/state',undefined,owner.cookie)).body.me.completedShares,i);
      assert.equal((await call(`/gear/${gear.id}/complete`,{},receiver.cookie)).status,403);
      assert.equal((await call(`/gear/${gear.id}/complete`,{},owner.cookie)).status,200);
      assert.equal((await call(`/gear/${gear.id}/complete`,{},owner.cookie)).status,409);
    }
    const claimed=await Promise.all([call('/badges/claim',{badgeId:'helping-hand'},owner.cookie),call('/badges/claim',{badgeId:'helping-hand'},owner.cookie)]);
    assert.deepEqual(claimed.map(r=>r.status).sort(),[201,409]);
    assert.equal((await call('/badges/claim',{badgeId:'camp-pillar'},owner.cookie)).status,409);
    assert.equal((await call('/badges/claim',{badgeId:'first-gift',memberId:1},receiver.cookie)).status,409);
    const state=(await call('/state',undefined,receiver.cookie)).body;
    const giver=state.members.find(m=>m.nickname==='giver');
    assert.equal(giver.completedShares,5);assert.equal(giver.badges.length,1);assert.equal(giver.badges[0].id,'helping-hand');assert.equal(state.me.completedShares,0);
    await call('/gear',{name:'撤回装备',category:'防具',description:'测试'},owner.cookie);
    const withdrawn=(await call('/state',undefined,owner.cookie)).body.gear.find(g=>g.name==='撤回装备');
    await call(`/gear/${withdrawn.id}/withdraw`,{},owner.cookie);
    assert.equal((await call('/state',undefined,owner.cookie)).body.me.completedShares,5);
  } finally {await app.close();}
});
