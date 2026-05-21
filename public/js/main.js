async function api(url, opts={}){const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed');return d;}
const sf=document.getElementById('signupForm');if(sf)sf.onsubmit=async(e)=>{e.preventDefault();const f=new FormData(sf);try{await api('/api/signup',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});location='/dashboard.html';}catch(err){msg.textContent=err.message;}};
const lf=document.getElementById('loginForm');if(lf)lf.onsubmit=async(e)=>{e.preventDefault();const f=new FormData(lf);try{await api('/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});location='/dashboard.html';}catch(err){msg.textContent=err.message;}};
window.api=api;
