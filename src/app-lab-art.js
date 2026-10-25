// Shared presentation for BOTH experimental conditions. No memory, score,
// dialogue generation, exposure-budget, voice or collision state is read here.
const LAB_PROP_LAYOUT = [
  {id:"table",asset:"table",x:51,y:62,widthPx:320,floorDepthPx:28},
  {id:"chair-top-left",asset:"chair",x:43,y:53,widthPx:28,floorDepthPx:12,padding:.6},
  {id:"chair-top-right",asset:"chair",x:59,y:53,widthPx:28,floorDepthPx:12,padding:.6},
  {id:"chair-bottom-left",asset:"chair",x:43,y:70,widthPx:28,floorDepthPx:12,padding:.6},
  {id:"chair-bottom-right",asset:"chair",x:59,y:70,widthPx:28,floorDepthPx:12,padding:.6},
  {id:"board",asset:"board",x:15,y:71,widthPx:180,floorDepthPx:14},
  {id:"plant-right",asset:"plant",x:90,y:38,widthPx:66,floorDepthPx:12,padding:.6}
];
const LAB_SCENE_VERSION="lab-scale-workstations-v3", LAB_BODY_HEIGHT=96;
const LAB_WATER_STATION={x:10,y:38,approach:{x:14,y:41}};
const LAB_WORKSTATIONS=[
  {npcId:"mina",x:25,y:43,activity:"notes",zh:"看会议笔记",en:"Reading meeting notes"},
  {npcId:"leo",x:48,y:38,activity:"read",zh:"翻阅资料",en:"Browsing reading material"},
  {npcId:"riley",x:62,y:38,activity:"notes",zh:"看会议议程",en:"Reading the meeting agenda"},
  {npcId:"sam",x:79,y:60,activity:"screen",zh:"看屏幕",en:"Looking at a screen"},
  {npcId:"nora",x:76,y:77,activity:"notes",zh:"整理个人笔记",en:"Organizing personal notes"}
];
function labSceneScale(){return (document.getElementById("pixel-world")?.getBoundingClientRect().width||1440)/1440;}
function labSceneFloorGeometry(){
  // Ground coordinates do not change when the browser camera/viewport changes.
  // Elevated silhouettes use aspect-preserving rendering, not collision boxes.
  return scenarioLayouts["newcomer-circle"].collisionObstacles;
}
function labStationHome(npcId){const desk=LAB_WORKSTATIONS.find(p=>p.npcId===npcId);return desk?{x:desk.x,y:desk.y-2.5}:null;}

function renderLabArtScene(unit = labSceneScale()) {
  const world = document.getElementById("pixel-world"), actors = document.getElementById("sprite-layer");
  if (!world || !actors) return;
  const active = currentScenario().id === "newcomer-circle";
  const value = String(unit);
  if (world.style.getPropertyValue("--lab-unit") !== value) world.style.setProperty("--lab-unit", value);
  world.classList.toggle("lab-art-ready", active);
  let scene = document.getElementById("lab-art-scene");
  if (!active) {
    if (scene) { world.append(actors); scene.remove(); }
    document.getElementById("lab-room-surface")?.remove();
    return;
  }
  if (scene) return; // RAF updates never rebuild furniture or image elements.
  const surface = document.createElement("div");
  surface.id = "lab-room-surface"; surface.setAttribute("aria-hidden", "true");
  surface.innerHTML = '<div class="lab-window-light lab-window-light-left"></div><div class="lab-window-light lab-window-light-right"></div>';
  world.append(surface);
  scene = document.createElement("div"); scene.id = "lab-art-scene";
  world.append(scene);
  for (const layout of LAB_PROP_LAYOUT) {
    const asset = window.SocialEvoLabArt.props[layout.asset];
    const [x,y,x2,y2] = asset.bounds, width = x2-x, height = y2-y;
    const prop = document.createElement("div");
    prop.className = `lab-prop lab-prop-${layout.asset}`;
    prop.dataset.propId = layout.id; prop.setAttribute("aria-hidden", "true");
    Object.assign(prop.style, {left:`${layout.x}%`,top:`${layout.y}%`,width:`calc(${layout.widthPx}px * var(--lab-unit))`,height:`calc(${layout.widthPx*height/width}px * var(--lab-unit))`,zIndex:String(Math.round(layout.y*10))});
    const shadow = document.createElement("span"); shadow.className = "lab-prop-shadow";
    const clip = document.createElement("span"); clip.className = "lab-prop-art";
    const img = document.createElement("img"); img.src = asset.url; img.alt = ""; img.draggable = false;
    Object.assign(img.style,{width:`${asset.imageWidth/width*100}%`,height:`${asset.imageHeight/height*100}%`,left:`${-x/width*100}%`,top:`${-y/height*100}%`});
    clip.append(img); prop.append(shadow,clip); scene.append(prop);
  }
  for(const desk of LAB_WORKSTATIONS){
    const node=document.createElement("div");node.className=`lab-personal-desk lab-station-${desk.activity}`;node.dataset.stationNpcId=desk.npcId;node.setAttribute("aria-hidden","true");
    Object.assign(node.style,{left:`${desk.x}%`,top:`${desk.y}%`,zIndex:String(Math.round(desk.y*10))});
    node.innerHTML='<span class="lab-desk-leg lab-desk-leg-left"></span><span class="lab-desk-leg lab-desk-leg-right"></span><span class="lab-desk-top"><span class="lab-desk-wood"><img src="./assets/lab-entry-v62/room/table.png" alt="" draggable="false"></span></span><span class="lab-desk-monitor"><i></i></span><span class="lab-desk-notes"></span><span class="lab-desk-pencil"></span>';
    scene.append(node);
  }
  const water=document.createElement("div");water.id="lab-water-cooler";water.className="lab-water-cooler";water.setAttribute("aria-hidden","true");
  Object.assign(water.style,{left:`${LAB_WATER_STATION.x}%`,top:`${LAB_WATER_STATION.y}%`,zIndex:String(Math.round(LAB_WATER_STATION.y*10))});
  water.innerHTML='<span class="lab-water-bottle"></span><span class="lab-water-body"><i class="lab-water-tap"></i><i class="lab-water-stream"></i><i class="lab-water-tray"></i></span>';
  scene.append(water);
  // This wrapper has NO stacking context: furniture and actor foot-depths
  // participate in the SAME scene context, underneath every player HUD layer.
  scene.append(actors);
}

function applyLabSpriteFrame(element, sprite, unit = labSceneScale()) {
  const frame = sprite.frames[sprite.frameRow || 0][sprite.frameColumn || 0];
  // Normalize generated frame heights, retain the standing direction's body
  // center, and pin visible feet at the logical collision/navigation point.
  const scale = LAB_BODY_HEIGHT * unit / frame.bodyHeight;
  let art = element.querySelector(".lab-sprite-art");
  if (!art) {
    const shadow = document.createElement("span"); shadow.className = "lab-contact-shadow"; shadow.setAttribute("aria-hidden","true");
    art = document.createElement("span"); art.className = "lab-sprite-art"; art.setAttribute("aria-hidden","true");
    element.prepend(shadow,art);
  }
  element.classList.add("asset-image-sprite");
  element.style.setProperty("--sprite-display-width",`${sprite.displayWidth*unit}px`);
  element.style.setProperty("--sprite-display-height",`${LAB_BODY_HEIGHT*unit+10}px`);
  Object.assign(art.style,{
    width:`${frame.width*scale}px`,height:`${frame.height*scale}px`,
    left:`calc(50% - ${(frame.anchorX-frame.x)*scale}px)`,
    bottom:`${-(frame.y+frame.height-frame.footY)*scale}px`,
    backgroundImage:`url("${cssUrl(sprite.url)}")`,
    backgroundSize:`${sprite.imageWidth*scale}px ${sprite.imageHeight*scale}px`,
    backgroundPosition:`${-frame.x*scale}px ${-frame.y*scale}px`
  });
  art.style.transform=sprite.poseFlip?"scaleX(-1)":"";
  art.style.transformOrigin=`${(frame.anchorX-frame.x)*scale}px center`;
  element.dataset.artFrame = `${sprite.frameColumn || 0}:${sprite.frameRow || 0}`;
  element.dataset.artVersion = sprite.artVersion;
}
