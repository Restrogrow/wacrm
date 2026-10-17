// Source of the embeddable widget script served at /widget/<publicId>.js.
//
// Plain ES5-style JavaScript with no dependencies and no cookies or
// storage. It renders inside a shadow root (so the host page's CSS can't
// break it and ours can't leak), builds every piece of text with
// textContent (nothing from the config is ever parsed as HTML), and only
// talks to our own two public endpoints. The only thing it reports is a
// view and a click counter; no visitor data leaves the page.

import { PUBLIC_ID_RE } from './core'

export function widgetScript(publicId: string): string | null {
  if (!PUBLIC_ID_RE.test(publicId)) return null

  return `(function(){
  "use strict";
  var ID=${JSON.stringify(publicId)};
  var el=document.currentScript;
  if(!el||!el.src){return;}
  var base;
  try{base=new URL(el.src).origin;}catch(e){return;}
  var w=window;
  w.__rgWidgets=w.__rgWidgets||{};
  if(w.__rgWidgets[ID]){return;}
  w.__rgWidgets[ID]=1;

  function track(ev){
    var url=base+"/api/widget/"+ID+"/event";
    var body=JSON.stringify({e:ev});
    try{
      if(navigator.sendBeacon&&navigator.sendBeacon(url,new Blob([body],{type:"text/plain"}))){return;}
    }catch(e){}
    try{fetch(url,{method:"POST",body:body,headers:{"Content-Type":"text/plain"},keepalive:true,credentials:"omit"});}catch(e){}
  }

  function el_(tag,css,text){
    var n=document.createElement(tag);
    if(css){n.style.cssText=css;}
    if(text!==undefined){n.textContent=text;}
    return n;
  }

  function waLink(c,name){
    var text=(c.prefill||"").slice(0,300);
    var nm=(name||"").replace(/[\\u0000-\\u001f\\u007f]/g," ").replace(/\\s+/g," ").trim().slice(0,60);
    if(nm){text=text?text+"\\n\\nName: "+nm:"Name: "+nm;}
    var u="https://wa.me/"+String(c.number).replace(/[^0-9]/g,"");
    return text?u+"?text="+encodeURIComponent(text):u;
  }

  function build(c){
    var color=/^#[0-9a-fA-F]{6}$/.test(c.color||"")?c.color:"#25D366";
    var side=c.position==="left"?"left":"right";
    var host=document.createElement("div");
    host.setAttribute("data-repeatgrow-widget",ID);
    host.style.cssText="position:fixed;bottom:20px;"+side+":20px;z-index:2147483000;";
    var root=host.attachShadow?host.attachShadow({mode:"closed"}):host;

    var style=document.createElement("style");
    style.textContent=
      ".f{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.4;color:#111}"+
      ".b{display:flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:12px 18px;color:#fff;cursor:pointer;font:600 14px/1 inherit;box-shadow:0 6px 20px rgba(0,0,0,.25)}"+
      ".b:focus-visible,.s:focus-visible,.x:focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 5px #111}"+
      ".c{position:absolute;bottom:64px;"+side+":0;width:280px;max-width:calc(100vw - 40px);background:#fff;border-radius:14px;box-shadow:0 10px 36px rgba(0,0,0,.28);overflow:hidden}"+
      ".h{color:#fff;padding:12px 14px;font-weight:600;display:flex;justify-content:space-between;align-items:center}"+
      ".x{background:transparent;border:0;color:#fff;font-size:20px;line-height:1;cursor:pointer;padding:0 2px}"+
      ".m{padding:14px}"+
      ".i{width:100%;box-sizing:border-box;margin-top:10px;padding:9px 10px;border:1px solid #ccc;border-radius:8px;font:inherit}"+
      ".s{width:100%;margin-top:12px;border:0;border-radius:8px;padding:11px;color:#fff;font:600 14px/1 inherit;cursor:pointer}";
    root.appendChild(style);

    var wrap=el_("div",null);
    wrap.className="f";
    var card=el_("div",null);
    card.className="c";
    card.style.display="none";

    var head=el_("div","background:"+color);
    head.className="h";
    head.appendChild(el_("span",null,c.label||"Chat with us"));
    var close=el_("button",null,"\\u00d7");
    close.className="x";
    close.setAttribute("aria-label","Close");
    head.appendChild(close);

    var msg=el_("div",null);
    msg.className="m";
    var isOpen=c.open!==false;
    msg.appendChild(el_("div",null,isOpen?(c.greeting||""):(c.offlineText||c.greeting||"")));
    var input=null;
    if(c.collectName){
      input=document.createElement("input");
      input.className="i";
      input.type="text";
      input.maxLength=60;
      input.placeholder="Your name";
      input.setAttribute("aria-label","Your name");
      msg.appendChild(input);
    }
    var go=el_("button","background:"+color,"Start chat on WhatsApp");
    go.className="s";
    msg.appendChild(go);
    card.appendChild(head);
    card.appendChild(msg);

    var btn=el_("button","background:"+color);
    btn.className="b";
    btn.setAttribute("aria-haspopup","dialog");
    btn.appendChild(el_("span",null,c.label||"Chat with us"));

    function toggle(show){card.style.display=show?"block":"none";}
    btn.addEventListener("click",function(){toggle(card.style.display==="none");});
    close.addEventListener("click",function(){toggle(false);});
    go.addEventListener("click",function(){
      track("click");
      var win=window.open(waLink(c,input?input.value:""),"_blank","noopener,noreferrer");
      if(!win){location.href=waLink(c,input?input.value:"");}
      toggle(false);
    });

    wrap.appendChild(card);
    wrap.appendChild(btn);
    root.appendChild(wrap);
    (document.body||document.documentElement).appendChild(host);
    track("view");
  }

  function start(){
    fetch(base+"/api/widget/"+ID,{credentials:"omit"})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(c){if(c&&c.enabled&&c.number){build(c);}})
      .catch(function(){});
  }

  if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",start);}else{start();}
})();
`
}
