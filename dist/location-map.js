const maps=new WeakMap();
export function renderMap(element,people){
  if(!element||!window.L)return;
  let state=maps.get(element);
  if(!state){const map=L.map(element,{zoomControl:false,scrollWheelZoom:false}).setView([25,0],1);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'origin',attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(map);state={map,layer:L.layerGroup().addTo(map),key:''};maps.set(element,state);new ResizeObserver(()=>map.invalidateSize()).observe(element);}
  const pins=people.filter(p=>p.position&&Date.now()-p.position.capturedAt<300000),key=JSON.stringify(pins.map(p=>[p.actor,p.position.latitude,p.position.longitude]));if(key===state.key)return;state.key=key;state.layer.clearLayers();
  for(const p of pins)L.marker([p.position.latitude,p.position.longitude],{icon:L.divIcon({className:'',html:'<div class="location-pin '+(p.actor==='youssef'?'location-y':'')+'">'+(p.actor==='asnat'?'A':'Y')+'</div>',iconSize:[32,32],iconAnchor:[16,16]})}).addTo(state.layer).bindTooltip(p.actor==='asnat'?'Asnat':'Youssef');
  if(pins.length===1)state.map.setView([pins[0].position.latitude,pins[0].position.longitude],14);else if(pins.length>1)state.map.fitBounds(pins.map(p=>[p.position.latitude,p.position.longitude]),{padding:[32,22],maxZoom:18});
}
