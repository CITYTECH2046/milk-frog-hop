(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const sprite = new Image();
  const MAX_HOLD = 1350;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const storage = {get(k) {try {return localStorage.getItem(k);} catch {return null;}}, set(k,v) {try {localStorage.setItem(k,String(v));} catch {}}};
  let best = Math.max(0, Number(storage.get('milk-hop-best')) || 0);
  let sound = storage.get('milk-hop-sound') === 'true', audio;
  let width = 1, height = 1, scale = 1, score = 0, streak = 0, started = false;
  let phase = 'loading', chargeStart = 0, charge = 0, source = null;
  let pads = [], index = 0, frog = {x:0,y:0,z:0}, camera = {x:0,y:0};
  let flight = null, particles = [], ripples = [], landingTime = -10000, endAt = 0;
  let lastTime = 0, time = 0, toastUntil = 0, recordBefore = best;
  const palette = [
    {top:'#f6f8e9', side:'#cfddba', rim:'#ffffff', spot:'#ccdcb7'},
    {top:'#b9d887', side:'#8fb35d', rim:'#d9ecb8', spot:'#85ad56'},
    {top:'#f3e3ad', side:'#d0ba80', rim:'#fff3d0', spot:'#d7c38e'},
    {top:'#c2dfca', side:'#95bfa1', rim:'#e4f4e5', spot:'#91bb9b'}
  ];
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width=rect.width; height=rect.height;
    const dpr=Math.min(devicePixelRatio || 1,2);
    canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    scale=Math.min(width/430,(height-130)/450,1.35);
  }
  new ResizeObserver(resize).observe(canvas);
  function screen(p) {return {x:width*(width>650?.60:.53)+(p.x-camera.x)*scale, y:height*.56+(p.y-camera.y)*.58*scale};}
  function makePad(previous,n) {
    const sign=previous.x>75?-1:previous.x< -75?1:Math.random()>.5?1:-1;
    return {x:previous.x+sign*(105+Math.random()*50),y:previous.y-(175+Math.random()*45),r:Math.max(46,62-n*.45),color:n%4,n};
  }
  function reset() {
    phase='ready';score=0;streak=0;index=0;started=false;charge=0;source=null;recordBefore=best;
    pads=[{x:0,y:0,r:67,color:0,n:0},{x:126,y:-186,r:62,color:1,n:1}];
    pads.push(makePad(pads[1],2));frog={x:0,y:0,z:0};camera={x:50.4,y:0};document.querySelector('.scene-label').style.opacity='1';
    particles=[];ripples=[];flight=null;landingTime=-10000;
    $('result-dialog').open && $('result-dialog').close();
    $('score').textContent='0';$('best').textContent=best;
    $('combo').textContent='每一跳，都是小进步';
    $('jump').disabled=false;$('hint').textContent='按住蓄力，松手跳跃';
    $('jump-label').textContent='按住 · 蓄力起跳';$('jump').classList.remove('pressed');
    $('toast').classList.remove('visible');updatePower();
  }
  function initAudio(){if(!sound)return;try{audio ||= new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();}catch{}}
  function tone(freq,duration,type='sine',delay=0){if(!sound||!audio)return;try{const o=audio.createOscillator(),g=audio.createGain(),now=audio.currentTime+delay;o.type=type;o.frequency.setValueAtTime(freq,now);o.frequency.exponentialRampToValueAtTime(freq*.8,now+duration);g.gain.setValueAtTime(.07,now);g.gain.exponentialRampToValueAtTime(.001,now+duration);o.connect(g);g.connect(audio.destination);o.start(now);o.stop(now+duration);}catch{}}
  function updateSound(){ $('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');$('sound-waves').setAttribute('d',sound?'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14':'m16 9 6 6m0-6-6 6');}
  $('sound').addEventListener('click',()=>{sound=!sound;storage.set('milk-hop-sound',sound);initAudio();updateSound();if(sound)tone(660,.12);});updateSound();
  function updatePower(){const percent=Math.round(charge*100);$('power').style.width=percent+'%';$('power-number').textContent=percent+'%';$('power').style.background=percent>90?'#bb9756':'#679a40';}
  function modalOpen(){return $('help-dialog').open||$('result-dialog').open;}
  function begin(input){if(phase!=='ready'||modalOpen())return false;source=input;started=true;document.querySelector('.scene-label').style.opacity='0';phase='charging';chargeStart=performance.now();charge=0;initAudio();$('jump').classList.add('pressed');$('jump-label').textContent='松手 · 轻轻一跃';$('hint').textContent='按得越久，跳得越远';tone(220,.1);return true;}
  function cancel(){if(phase!=='charging')return;source=null;phase='ready';charge=0;updatePower();$('jump').classList.remove('pressed');$('jump-label').textContent='按住 · 蓄力起跳';$('hint').textContent='按住蓄力，松手跳跃';}
  function end(input){if(phase!=='charging'||source!==input)return;charge=clamp((performance.now()-chargeStart)/MAX_HOLD,0,1);const next=pads[index+1],d=distance(frog,next),jumpDistance=25+charge*355;
    flight={from:{...frog},to:{x:frog.x+(next.x-frog.x)/d*jumpDistance,y:frog.y+(next.y-frog.y)/d*jumpDistance,z:0},start:performance.now(),duration:530+charge*140};
    phase='flying';source=null;$('jump').classList.remove('pressed');$('jump').disabled=true;$('jump-label').textContent='奶蛙起飞啦';tone(420,.18);
  }
  for(const surface of [canvas,$('jump')]){
    surface.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0)return;e.preventDefault();if(begin(e.pointerId))surface.setPointerCapture(e.pointerId);});
    surface.addEventListener('pointerup',e=>{e.preventDefault();end(e.pointerId);});
    surface.addEventListener('pointercancel',e=>{if(source===e.pointerId)cancel();});
    surface.addEventListener('lostpointercapture',e=>{if(source===e.pointerId)cancel();});
    surface.addEventListener('contextmenu',e=>e.preventDefault());
  }
  document.addEventListener('keydown',e=>{if(e.code!=='Space'||e.repeat||modalOpen()||(['BUTTON','A','INPUT'].includes(document.activeElement?.tagName)&&document.activeElement!==$('jump')))return;e.preventDefault();begin('keyboard');});
  document.addEventListener('keyup',e=>{if(e.code==='Space'&&source==='keyboard'){e.preventDefault();end('keyboard');}});
  window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
  $('help').addEventListener('click',()=>{cancel();$('help-dialog').showModal();});
  $('help-close').onclick=()=>$('help-dialog').close();document.querySelector('.close').onclick=()=>$('help-dialog').close();
  $('restart').onclick=()=>{reset();$('jump').focus({preventScroll:true});};
  $('result-dialog').addEventListener('cancel',e=>{e.preventDefault();reset();});
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');toastUntil=performance.now()+1500;}
  function burst(p,perfect){for(let i=0;i<(perfect?18:8);i++)particles.push({x:p.x,y:p.y,z:18,vx:(Math.random()-.5)*100,vy:(Math.random()-.5)*100,vz:60+Math.random()*130,life:1,color:['#fff9db','#83af51','#f3d88b'][i%3]});}
  function finishJump(now){const next=pads[index+1],here=pads[index];let landed=null;
    const onPad=p=>p.n%3===2?distance(frog,p)<p.r*.86:Math.abs(frog.x-p.x)+Math.abs(frog.y-p.y)<p.r*1.13;
    if(onPad(next))landed=next;else if(onPad(here))landed=here;
    if(!landed){phase='falling';flight.start=now;endAt=now+650;tone(160,.35,'triangle');charge=0;updatePower();return;}
    landingTime=now;phase='settling';flight=null;burst(frog,landed===next&&distance(frog,next)<next.r*.26);ripples.push({x:frog.x,y:frog.y,start:now});
    if(landed===next){const perfect=distance(frog,next)<next.r*.26;streak=perfect?streak+1:0;const gain=perfect?Math.min(streak*2,10):1;score+=gain;index++;pads.push(makePad(pads[pads.length-1],pads[pads.length-1].n+1));if(index>4){pads.shift();index--;}
      $('score').textContent=score;$('combo').textContent=perfect?(streak>1?'连续中心 × '+streak:'正中中心，真棒！'):'稳稳落地，再来一跳';
      toast(perfect?'完美落点 +'+gain:'稳稳落地 +1');tone(perfect?880:620,.14);if(perfect)tone(1100,.16,'sine',.1);
      if(score>best){best=score;storage.set('milk-hop-best',best);$('best').textContent=best;}
    }else{toast('再多蓄一点力');tone(330,.1);}
    charge=0;updatePower();
  }
  function gameOver(){phase='over';$('final-score').textContent=score;$('record-note').textContent='最佳记录 '+best+' 分';$('result-title').textContent=score>recordBefore?'新纪录！奶蛙好棒':'休息一下，再跳一次';$('jump-label').textContent='再试一次吧';$('result-dialog').showModal();}
  function ellipse(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
  function drawPad(p,opacity=1){const s=screen(p),r=p.r*scale,h=38*scale,c=palette[p.color];ctx.save();ctx.globalAlpha=opacity;
    if(p.n%3!==2){const rx=r*1.3,ry=rx*.58;const poly=(points,color)=>{ctx.beginPath();points.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.closePath();ctx.fillStyle=color;ctx.fill();};
      poly([[s.x-rx-20*scale,s.y+h],[s.x-20*scale,s.y+h+ry],[s.x+rx,s.y+h],[s.x,s.y+h-ry]],'#668b4925');
      poly([[s.x-rx,s.y],[s.x,s.y+ry],[s.x,s.y+ry+h],[s.x-rx,s.y+h]],c.side);
      poly([[s.x,s.y+ry],[s.x+rx,s.y],[s.x+rx,s.y+h],[s.x,s.y+ry+h]],p.color===0?'#b9cda4':c.spot);
      poly([[s.x,s.y-ry],[s.x+rx,s.y],[s.x,s.y+ry],[s.x-rx,s.y]],c.top);
      if(p.n%4===0){const q=h*.48,b=7*scale;poly([[s.x-rx,s.y+q],[s.x,s.y+ry+q],[s.x,s.y+ry+q+b],[s.x-rx,s.y+q+b]],'#eef2e4');poly([[s.x,s.y+ry+q],[s.x+rx,s.y+q],[s.x+rx,s.y+q+b],[s.x,s.y+ry+q+b]],'#dfe8d2');}
      ctx.strokeStyle=c.rim;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(s.x-rx,s.y);ctx.lineTo(s.x,s.y-ry);ctx.lineTo(s.x+rx,s.y);ctx.stroke();
      ctx.strokeStyle=c.spot;ctx.lineWidth=1.2*scale;ctx.beginPath();ctx.ellipse(s.x,s.y,16*scale,9*scale,0,0,Math.PI*2);ctx.stroke();ellipse(s.x,s.y,2*scale,1.3*scale,c.spot);ctx.restore();return;
    }
    ellipse(s.x+13*scale,s.y+h+17*scale,r*1.13,r*.43,'#668b4920');
    ctx.beginPath();ctx.ellipse(s.x,s.y+h,r,r*.53,0,0,Math.PI);ctx.lineTo(s.x-r,s.y);ctx.ellipse(s.x,s.y,r,r*.53,0,Math.PI,Math.PI*2);ctx.closePath();const g=ctx.createLinearGradient(s.x-r,0,s.x+r,0);g.addColorStop(0,c.side);g.addColorStop(.6,c.side);g.addColorStop(1,c.top);ctx.fillStyle=g;ctx.fill();
    ellipse(s.x,s.y,r,r*.55,c.rim);ellipse(s.x,s.y-3*scale,r*.98,r*.51,c.top);
    ctx.beginPath();ctx.ellipse(s.x,s.y-3*scale,r*.28,r*.15,0,0,Math.PI*2);ctx.strokeStyle=c.spot;ctx.lineWidth=1.3*scale;ctx.stroke();ellipse(s.x,s.y-3*scale,2*scale,1.3*scale,c.spot);
    if(p.n%4===2){ctx.fillStyle='#aa9565';ctx.font=`${8*scale}px system-ui`;ctx.textAlign='center';ctx.fillText('MILK',s.x,s.y+h+4*scale);}
    ctx.restore();
  }
  function drawFrog(now){const s=screen(frog),z=frog.z*scale;const squash=phase==='charging'?charge*.22:Math.max(0,1-(now-landingTime)/230)*.18;
    ctx.save();const falling=phase==='falling'?clamp((now-flight.start)/500,0,1):0;ctx.globalAlpha=1-falling;
    ellipse(s.x+3*scale,s.y+3*scale,24*scale*(1-frog.z/350),10*scale*(1-frog.z/350),'#42603830');
    const size=116*scale,bob=phase==='ready'&&!matchMedia('(prefers-reduced-motion: reduce)').matches?Math.sin(now/380)*1.7*scale:0;
    const fw=size*(sprite.naturalWidth/sprite.naturalHeight)*(1+squash*.6),fh=size*(1-squash);ctx.translate(s.x,s.y-z+8*scale+bob+falling*75*scale);
    if(phase==='flying')ctx.rotate(Math.sin((now-flight.start)/flight.duration*Math.PI)*.09*(flight.to.x>flight.from.x?1:-1));
    ctx.drawImage(sprite,-fw/2,-fh,fw,fh);ctx.restore();
  }
  function background(now){ctx.save();
    for(let i=0;i<11;i++){const x=((i*197+78)%997)/997*width,y=((i*131+51)%701)/701*height;const drift=matchMedia('(prefers-reduced-motion: reduce)').matches?0:Math.sin(now/2400+i)*4;ctx.strokeStyle='#91ad6d18';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x+drift,y,23+(i%3)*15,8+(i%3)*4,-.2,0,Math.PI*2);ctx.stroke();}
    ctx.restore();
  }
  function drawGuide(){if(index>1||phase!=='charging')return;const next=pads[index+1],d=distance(frog,next),jump=25+charge*355;const dest={x:frog.x+(next.x-frog.x)/d*jump,y:frog.y+(next.y-frog.y)/d*jump},s=screen(dest);ctx.save();ctx.strokeStyle='#567d4260';ctx.setLineDash([3,4]);ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(s.x,s.y,18*scale,10*scale,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
  function frame(now){const dt=Math.min((now-lastTime)/1000,.04);lastTime=now;time=now;
    if(phase==='charging'){charge=clamp((now-chargeStart)/MAX_HOLD,0,1);updatePower();}
    if(phase==='flying'){const t=clamp((now-flight.start)/flight.duration,0,1);frog.x=lerp(flight.from.x,flight.to.x,t);frog.y=lerp(flight.from.y,flight.to.y,t);frog.z=Math.sin(t*Math.PI)*(95+charge*65);if(t>=1){frog.z=0;finishJump(now);}}
    if(phase==='settling'&&now-landingTime>340){phase='ready';$('jump').disabled=false;$('jump-label').textContent='按住 · 蓄力起跳';$('hint').textContent='按住蓄力，松手跳跃';}
    if(phase==='falling'&&now>=endAt)gameOver();
    if(pads[index]&&phase!=='loading'){const a=1-Math.exp(-dt*4.5);camera.x=lerp(camera.x,lerp(pads[index].x,pads[index+1].x,.4),a);camera.y=lerp(camera.y,pads[index].y,a);}
    ctx.clearRect(0,0,width,height);background(now);
    if(phase!=='loading'){
      for(let i=pads.length-1;i>=0;i--)drawPad(pads[i],i>index+1?.45:i<index?.62:1);
      for(const r of ripples){const age=(now-r.start)/650;if(age>1)continue;const s=screen(r);ctx.save();ctx.globalAlpha=1-age;ctx.strokeStyle='#fffbed';ctx.lineWidth=3*scale;ctx.beginPath();ctx.ellipse(s.x,s.y,(25+age*40)*scale,(12+age*18)*scale,0,0,Math.PI*2);ctx.stroke();ctx.restore();}ripples=ripples.filter(r=>now-r.start<650);
      drawGuide();drawFrog(now);
      if(!started&&phase==='ready'){const s=screen(pads[index+1]);ctx.fillStyle='#739656';ctx.font=`500 ${12*scale}px system-ui`;ctx.textAlign='center';ctx.fillText('下一站',s.x,s.y-53*scale);ctx.beginPath();ctx.moveTo(s.x-4*scale,s.y-44*scale);ctx.lineTo(s.x,s.y-40*scale);ctx.lineTo(s.x+4*scale,s.y-44*scale);ctx.strokeStyle='#89a469';ctx.lineWidth=1.5;ctx.stroke();}
      for(const p of particles){p.life-=dt*1.6;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vz-=360*dt;const s=screen(p);ctx.save();ctx.globalAlpha=Math.max(0,p.life);ellipse(s.x,s.y-p.z*scale,3*scale,3*scale,p.color);ctx.restore();}particles=particles.filter(p=>p.life>0);
    }
    if(now>toastUntil)$('toast').classList.remove('visible');
    requestAnimationFrame(frame);
  }
  sprite.onload=()=>{$('loading').remove();reset();};
  sprite.onerror=()=>{$('loading').textContent='奶蛙走丢了，刷新页面再试一次。';};sprite.src='frog.png';
  resize();requestAnimationFrame(frame);
  const modelContext=document.modelContext;
  if(modelContext?.registerTool){const lifecycle=new AbortController();const read=()=>({phase,score,best});
    for(const tool of [{name:'read_game_state',description:'Read the current frog game score and status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:read},{name:'restart_game',description:'Discard the current run and restart the frog jumping game with score zero.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(input&&Object.keys(input).length)throw new Error('No inputs accepted');if(phase==='loading')throw new Error('Frog image is still loading');$('help-dialog').open&&$('help-dialog').close();reset();return read();}}]){try{Promise.resolve(modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
    window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
})();
