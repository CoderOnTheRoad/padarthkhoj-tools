import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT = process.argv[2] || "Padarthkhoj_TOC_Editable.pptx";
const PREVIEW = process.argv[3] || "Padarthkhoj_TOC_Preview.png";
const W = 1440, H = 720;
const C = {
  bg: "#FAFBFC", navy: "#173B57", blue: "#2F6B8A", teal: "#27A6A1",
  paleBlue: "#DCEFF3", paleTeal: "#E2F3F1", green: "#70B77E",
  paleGreen: "#E7F3E8", gold: "#D9A441", paleGold: "#F7EAC8",
  dark: "#263238", muted: "#60727D", white: "#FFFFFF", red: "#D85252",
  carbon: "#3B4650", nitrogen: "#4E73C2", oxygen: "#D85A5A", sulfur: "#D6B83F"
};

function rect(slide, name, x, y, w, h, fill, stroke = "none", radius = true, sw = 1) {
  return slide.shapes.add({ geometry: radius ? "roundRect" : "rect", name,
    position: { left:x, top:y, width:w, height:h }, fill,
    line: { style:"solid", fill:stroke, width:stroke === "none" ? 0 : sw },
    borderRadius: radius ? "rounded-xl" : undefined });
}
function txt(slide, name, text, x, y, w, h, size=16, color=C.dark, bold=false, align="left") {
  const s=slide.shapes.add({ geometry:"textbox", name, position:{left:x,top:y,width:w,height:h},
    fill:"none", line:{style:"solid",fill:"none",width:0} });
  s.text=text; s.text.style={fontFamily:"Aptos",fontSize:size,color,bold,alignment:align,verticalAlignment:"middle"};
  return s;
}
function line(slide,name,x1,y1,x2,y2,color=C.blue,width=2){
  const dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy), ang=Math.atan2(dy,dx)*180/Math.PI;
  const s=rect(slide,name,x1,y1-width/2,len,width,color,"none",false); s.rotation=ang; return s;
}
function arrow(slide,name,x,y,w,color=C.teal){
  const shaft=rect(slide,name+"_shaft",x,y+7,w-18,5,color,"none",false);
  const head=slide.shapes.add({geometry:"chevron",name:name+"_head",position:{left:x+w-25,top:y,width:25,height:19},fill:color,line:{style:"solid",fill:"none",width:0}});
  return [shaft,head];
}
function atom(slide,name,x,y,r,fill,stroke=C.white){return slide.shapes.add({geometry:"ellipse",name,position:{left:x-r,top:y-r,width:r*2,height:r*2},fill,line:{style:"solid",fill:stroke,width:1.5}})}
function badge(slide,name,label,x,y,w,fill,stroke=C.teal,color=C.navy){rect(slide,name+"_bg",x,y,w,22,fill,stroke,true,1);txt(slide,name+"_text",label,x,y,w,22,10,color,true,"center")}
function fileCard(slide,name,label,sub,x,y,w=104,h=72){
  rect(slide,name+"_bg",x,y,w,h,C.white,"#B8CCD7",true,1);
  slide.shapes.add({geometry:"foldedCorner",name:name+"_doc",position:{left:x+10,top:y+11,width:28,height:35},fill:C.paleBlue,line:{style:"solid",fill:C.blue,width:1}});
  txt(slide,name+"_label",label,x+43,y+10,w-48,24,label.length>7?10.5:12,C.navy,true);
  txt(slide,name+"_sub",sub,x+43,y+33,w-48,30,8,C.muted,false);
}
function miniPlot(slide,name,x,y,w,h){
  line(slide,name+"_x",x,y+h,x+w,y+h,C.muted,1); line(slide,name+"_y",x,y,x,y+h,C.muted,1);
  const pts1=[[0,.72],[.12,.6],[.23,.25],[.33,.58],[.48,.16],[.62,.46],[.75,.12],[.88,.38],[1,.26]];
  const pts2=[[0,.30],[.14,.44],[.29,.18],[.42,.52],[.56,.28],[.72,.62],[.84,.32],[1,.55]];
  for(const [k,pts,col] of [["a",pts1,C.teal],["b",pts2,C.gold]]) for(let i=0;i<pts.length-1;i++) line(slide,`${name}_${k}${i}`,x+pts[i][0]*w,y+pts[i][1]*h,x+pts[i+1][0]*w,y+pts[i+1][1]*h,col,1.8);
}
function capability(slide,name,title,items,x,y,w,h,fill,accent,icon){
  rect(slide,name+"_panel",x,y,w,h,fill,accent,true,1.2);
  txt(slide,name+"_title",title,x+48,y+8,w-56,24,14,C.navy,true);
  txt(slide,name+"_items",items.map(v=>"• "+v).join("\n"),x+48,y+32,w-55,h-36,9.5,C.muted,false);
  if(icon==="lattice"){
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){if(i<2)line(slide,`${name}_bh${i}${j}`,x+13+i*13,y+21+j*13,x+26+i*13,y+21+j*13,"#8AA9B7",1);if(j<2)line(slide,`${name}_bv${i}${j}`,x+13+i*13,y+21+j*13,x+13+i*13,y+34+j*13,"#8AA9B7",1)}
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)atom(slide,`${name}_a${i}${j}`,x+13+i*13,y+21+j*13,4,(i===1&&j===1)?C.gold:C.blue);
  } else if(icon==="reaction"){
    for(let i=0;i<4;i++)atom(slide,`${name}_surf${i}`,x+9+i*11,y+50,5,i===2?C.gold:C.carbon);
    atom(slide,name+"_ads1",x+30,y+24,6,C.nitrogen); atom(slide,name+"_ads2",x+38,y+15,4,C.white,C.muted); line(slide,name+"_bond",x+31,y+23,x+37,y+17,C.dark,2); line(slide,name+"_attach",x+31,y+30,x+31,y+44,C.teal,1.5);
  } else if(icon==="electronic"){
    miniPlot(slide,name+"_plot",x+8,y+18,33,38); atom(slide,name+"_q1",x+17,y+61,5,C.green); atom(slide,name+"_q2",x+34,y+61,5,C.red);txt(slide,name+"_pm","−   +",x+7,y+62,38,14,7,C.muted,true,"center");
  } else {
    line(slide,name+"_e1",x+8,y+52,x+39,y+52,C.blue,2);line(slide,name+"_e2",x+13,y+37,x+35,y+37,C.teal,2);line(slide,name+"_e3",x+18,y+22,x+31,y+22,C.gold,2);line(slide,name+"_ea",x+24,y+49,x+24,y+40,C.green,2);
  }
}
function build(){
  const p=Presentation.create({slideSize:{width:W,height:H}}); const s=p.slides.add(); s.background.fill=C.bg;
  txt(s,"Title","Padarthkhoj Tools",48,28,430,44,31,C.navy,true);
  txt(s,"Tagline","From atomistic simulation files to validated, AI-ready materials data",48,70,720,28,15,C.blue,false);
  rect(s,"TopRule",48,108,1344,2,C.paleBlue,"none",false);

  // Main flow arrows first so they remain behind content.
  arrow(s,"Flow_Input_Core",330,350,70,C.teal); arrow(s,"Flow_Core_Output",935,350,62,C.green); arrow(s,"Flow_Output_AI",1190,520,55,C.gold);

  // Inputs
  txt(s,"InputsHeading","Computational Inputs",48,128,275,32,19,C.navy,true);
  txt(s,"InputsSub","Structures • simulations • spectra",48,158,275,22,11,C.muted);
  fileCard(s,"CIF","CIF","periodic crystal",48,190); fileCard(s,"QE","QE","input / output",164,190); fileCard(s,"VASP","VASP","POSCAR + DOSCAR",48,274); fileCard(s,"PDOS","PDOS","orbital channels",164,274); fileCard(s,"ACF","ACF",".dat · Bader",48,358); fileCard(s,"FREQ","FREQ","THz / CSV data",164,358);
  // Input scientific accents
  for(let i=0;i<4;i++) atom(s,"CIFAtom"+i,66+(i%2)*11,242+Math.floor(i/2)*10,3,[C.carbon,C.oxygen,C.nitrogen,C.gold][i]);
  miniPlot(s,"PDOSMini",176,329,34,22);
  for(let i=0;i<4;i++) rect(s,"FreqPeak"+i,181+i*8,398-(i%2)*9,2,15+(i%2)*9,C.gold,"none",false);
  rect(s,"InputNote",48,454,220,62,C.paleBlue,"none",true); txt(s,"InputNoteText","Multiple scientific formats\nenter one reviewed workspace",60,464,196,42,11,C.navy,true,"center");

  // Core
  rect(s,"CoreBackground",390,126,545,468,C.paleTeal,C.teal,true,2);
  txt(s,"CoreHeading","Padarthkhoj Scientific Workspace",416,140,490,32,20,C.navy,true,"center");
  txt(s,"CoreSub","Browser-native preparation, analysis and visualization",416,172,490,22,11,C.muted,false,"center");
  capability(s,"Structure","Structure Design",["Crystal editing","Variant generation","Structure-to-QE"],414,210,222,118,C.white,C.blue,"lattice");
  capability(s,"Electronic","Electronic Analysis",["QE/VASP PDOS","Bader charge","Orbital metrics"],689,210,222,118,C.white,C.green,"electronic");
  capability(s,"Reaction","Reaction Pathways",["Preset intermediates","Custom pathways","Active-site placement"],414,374,222,118,C.white,C.teal,"reaction");
  capability(s,"Thermo","Thermochemistry & Plots",["ZPE & entropy","DOS figures","Free-energy diagrams"],689,374,222,118,C.white,C.gold,"energy");
  // Hub connectors then hub.
  line(s,"HubConn1",636,269,662,333,C.teal,2);line(s,"HubConn2",689,269,664,333,C.green,2);line(s,"HubConn3",636,433,662,351,C.teal,2);line(s,"HubConn4",689,433,664,351,C.gold,2);
  slideHub(s,663,342);
  badge(s,"LocalBadge","◫  Browser local",414,531,145,C.white,C.blue,C.navy);badge(s,"PrivateBadge","◇  Private processing",568,531,155,C.white,C.teal,C.navy);badge(s,"ReviewBadge","✓  Human reviewed",732,531,155,C.white,C.green,C.navy);
  txt(s,"CoreBoundary","Prepares and analyzes scientific files — does not execute DFT",416,562,490,18,9,C.muted,false,"center");

  // Outputs
  txt(s,"OutputHeading","Validated Scientific Outputs",986,128,408,32,19,C.navy,true);
  txt(s,"OutputSub","Structured, reusable and machine-readable",986,158,408,22,11,C.muted);
  rect(s,"OutputCanvas",986,190,408,284,C.paleGreen,C.green,true,1.5);
  // Descriptor matrix
  txt(s,"DescriptorTitle","Descriptor table",1004,202,150,20,12,C.navy,true);
  const cols=[1004,1069,1136,1200], widths=[65,67,64,72], heads=["Material","q","εd","Occ."];
  for(let i=0;i<4;i++){rect(s,"TblHead"+i,cols[i],226,widths[i],24,C.navy,"none",false);txt(s,"TblHeadTxt"+i,heads[i],cols[i],226,widths[i],24,8,C.white,true,"center");}
  const vals=[["M-01","−0.14","−1.82","4.63"],["M-02","+0.08","−2.11","4.91"]];
  for(let r=0;r<2;r++)for(let i=0;i<4;i++){rect(s,`Tbl${r}${i}`,cols[i],250+r*24,widths[i],24,r?C.white:C.paleBlue,"#C6D6DD",false,0.6);txt(s,`TblTxt${r}${i}`,vals[r][i],cols[i],250+r*24,widths[i],24,8,C.dark,false,"center");}
  // Structure and plot
  txt(s,"StructureOutTitle","Structure",1290,202,84,20,12,C.navy,true,"center");
  for(let i=0;i<5;i++)atom(s,"OutAtom"+i,1311+(i%3)*22,246+Math.floor(i/3)*23,7,[C.carbon,C.oxygen,C.nitrogen,C.gold,C.white][i],C.muted);
  line(s,"OutBond1",1318,246,1326,246,C.muted,2);line(s,"OutBond2",1339,246,1348,246,C.muted,2);line(s,"OutBond3",1329,252,1318,264,C.muted,2);line(s,"OutBond4",1342,252,1352,264,C.muted,2);
  txt(s,"PlotOutTitle","DOS & free energy",1004,314,170,20,12,C.navy,true);miniPlot(s,"OutputDOS",1008,342,145,78);line(s,"Fermi",1080,342,1080,420,C.red,1);
  txt(s,"EFLabel","E−EF=0",1060,420,52,16,7,C.red,true,"center");
  line(s,"FreeE1",1182,405,1248,405,C.blue,3);line(s,"FreeE2",1258,375,1324,375,C.teal,3);line(s,"FreeEConn",1248,405,1258,375,C.muted,1.5);txt(s,"FreeELabel","Free-energy states",1178,422,150,16,8,C.muted,false,"center");
  const formats=["CIF","JSON","CSV","XLSX","ZIP","PNG/SVG"]; formats.forEach((v,i)=>badge(s,"Fmt"+i,v,1004+i*60,444,i===5?70:54,C.white,C.green,C.navy));

  // AI strip
  txt(s,"AIHeading","AI/ML-Ready Materials Pipeline",986,492,408,30,18,C.navy,true);
  rect(s,"AIBackground",986,528,408,136,C.paleGold,C.gold,true,1.5);
  aiBranch(s,"DescriptorML","Descriptor ML",1004,544,"matrix"); aiBranch(s,"GraphLearning","Graph Learning",1134,544,"graph"); aiBranch(s,"ScientificAI","Scientific AI",1264,544,"network");
  txt(s,"AIBoundary","Downstream use: models are not trained by Padarthkhoj",1000,640,380,17,8,C.muted,false,"center");
  txt(s,"Footer","Human-reviewed data  →  reusable descriptors  →  ML • graph learning • scientific AI",48,680,1344,24,13,C.navy,true,"center");
  return p;
}
function slideHub(s,x,y){
  atom(s,"HubCentre",x,y,25,C.gold,C.navy); txt(s,"HubLabel","DATA\nHUB",x-22,y-16,44,32,9,C.navy,true,"center");
  [[0,-42,C.blue],[42,0,C.green],[0,42,C.teal],[-42,0,C.gold]].forEach((a,i)=>{line(s,"HubSpoke"+i,x,y,x+a[0],y+a[1],C.navy,2);atom(s,"HubNode"+i,x+a[0],y+a[1],9,a[2],C.white)});
}
function aiBranch(s,name,title,x,y,type){
  txt(s,name+"Title",title,x,y,112,18,11,C.navy,true,"center");
  if(type==="matrix"){
    for(let r=0;r<3;r++)for(let c=0;c<4;c++)rect(s,`${name}${r}${c}`,x+13+c*13,y+28+r*11,10,8,(r+c)%2?C.teal:C.blue,"none",false);
    arrow(s,name+"Arrow",x+68,y+37,28,C.green);atom(s,name+"Out",x+102,y+46,9,C.gold,C.white);
  } else if(type==="graph"){
    const pts=[[18,34],[42,26],[63,40],[36,55],[68,61]];[[0,1],[1,2],[0,3],[1,3],[2,4],[3,4]].forEach((e,i)=>line(s,name+"B"+i,x+pts[e[0]][0],y+pts[e[0]][1],x+pts[e[1]][0],y+pts[e[1]][1],C.muted,1.2));pts.forEach((p,i)=>atom(s,name+"A"+i,x+p[0],y+p[1],5,[C.carbon,C.oxygen,C.nitrogen,C.gold,C.teal][i],C.white));arrow(s,name+"Arrow",x+77,y+38,25,C.green);atom(s,name+"Out",x+108,y+47,8,C.green,C.white);
  } else {
    const pts=[[16,35],[16,57],[43,26],[43,46],[43,65],[70,38],[70,58]];[[0,2],[0,3],[1,3],[1,4],[2,5],[3,5],[3,6],[4,6]].forEach((e,i)=>line(s,name+"L"+i,x+pts[e[0]][0],y+pts[e[0]][1],x+pts[e[1]][0],y+pts[e[1]][1],C.blue,1));pts.forEach((p,i)=>atom(s,name+"N"+i,x+p[0],y+p[1],4,i>4?C.gold:C.teal,C.white));arrow(s,name+"Arrow",x+78,y+38,26,C.green);atom(s,name+"Result",x+108,y+47,7,C.gold,C.white);
  }
}

async function main(){
  const p=build();
  const preview=await p.export({slide:p.slides.items[0],format:"png",scale:2});
  await fs.writeFile(PREVIEW,new Uint8Array(await preview.arrayBuffer()));
  const pptx=await PresentationFile.exportPptx(p); await pptx.save(OUT);
  const layout=await p.slides.items[0].export({format:"layout"}); await fs.writeFile(OUT.replace(/\.pptx$/i,".layout.json"),await layout.text());
  const inspection=await p.inspect({kind:"slide,textbox,shape",maxChars:12000}); await fs.writeFile(OUT.replace(/\.pptx$/i,".inspect.ndjson"),inspection.ndjson);
  console.log(`Created ${OUT} and ${PREVIEW}`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
