import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationPlacement,dialogNotificationPlacement} from '../src/notification-position';

test('phone toast clears the actual two-row insertion tools and keeps both viewport gutters',()=>{
  const placement=notificationPlacement({width:360,height:68},{left:0,top:0,width:390,height:844},{top:72,footer:{left:25,right:365,top:560,bottom:830}});
  assert.equal(placement.top+68,548);assert.equal(placement.hidden,false);assert(placement.left>=12);assert(placement.left+placement.width<=378);
  const narrow=notificationPlacement({width:360,height:68},{left:0,top:0,width:320,height:740},{top:72,footer:{left:20,right:300,top:480,bottom:730}});
  assert.equal(narrow.left,12);assert.equal(narrow.width,296);assert.equal(narrow.top+68,468);
});
test('desktop toast stays in the canvas, away from inspector controls and footer',()=>{
  const placement=notificationPlacement({width:360,height:50},{left:0,top:0,width:1440,height:1000},{canvas:{left:196,right:1160,top:180,bottom:930},footer:{left:220,right:1140,top:925,bottom:985},top:180});
  assert.equal(placement.left,784);assert.equal(placement.top,863);assert.equal(placement.hidden,false);
});
test('visual viewport offsets and short landscape space do not push a toast outside visible bounds',()=>{
  const viewport={left:10,top:100,width:667,height:375};
  const placement=notificationPlacement({width:360,height:68},viewport,{top:170,footer:{left:100,right:650,top:320,bottom:460}});
  assert.equal(placement.top,240);assert.equal(placement.hidden,false);assert(placement.left>=22);assert(placement.left+placement.width<=665);
});
test('a crowded critical banner defers a toast instead of covering toolbar controls',()=>{
  const viewport={left:0,top:0,width:667,height:375},footer={left:50,right:650,top:195,bottom:365};
  const crowded=notificationPlacement({width:360,height:68},viewport,{top:230,footer});assert.equal(crowded.hidden,true);
  const cleared=notificationPlacement({width:360,height:68},viewport,{top:72,footer});assert.equal(cleared.hidden,false);assert.equal(cleared.top+68,183);
});
test('dialog notifications defer when chrome leaves too little room for editing',()=>{
  assert.equal(dialogNotificationPlacement(108,140,360).hidden,true);
  const roomy=dialogNotificationPlacement(48,584,844);assert.equal(roomy.hidden,false);assert(roomy.maxHeight<=844*.3);
});
test('modal notices wait until their complete message fits beside enlarged editing content',()=>{
  const result=dialogNotificationPlacement(350,400,640,168);assert.equal(result.hidden,true);assert(result.maxHeight<=192);assert(400-result.maxHeight-16>=168);
  assert.equal(dialogNotificationPlacement(115,400,640,168).hidden,false);
  assert.equal(dialogNotificationPlacement(350,210,640,168).hidden,true);
});
