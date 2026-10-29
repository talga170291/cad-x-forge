/* CAD x FORGE — слой данных каталога (демо-режим).
   Данные лежат в localStorage ЭТОГО браузера и не синхронизируются между устройствами.
   Чтобы подключить сервер, замените только объект `adapter` (get/set) на вызовы API —
   остальной код (покупательский Mini App и админка) трогать не нужно. */
var CFStore=(function(){
var KEY="cfx.catalog.v1",FM=["pdfa4","pdfplot","plt"],AUD=["w","m","k","s"],T0="2026-10-28T00:00:00.000Z";
var CATS=["Платья|Dresses","Блузы|Blouses","Рубашки|Shirts","Юбки|Skirts","Брюки|Trousers","Шорты|Shorts","Жакеты|Jackets","Жилеты|Vests","Блейзер|Blazers","Футболки|T-shirts","Свитшоты|Sweatshirts","Боди|Bodysuits","Корсеты|Corsets","Комбинезоны|Jumpsuits","Спортивная одежда|Sportswear","Домашняя одежда|Loungewear","Верхняя одежда|Outerwear","Мужская одежда|Menswear","Детская одежда|Kidswear","Спец одежда|Workwear","Пальто|Coats","Куртки|Casual jackets"];
// id, артикул, RU, EN, категория, аудитория, силуэт, размер от/до, рост от/до, прибавки, деталей, цена, описание RU, описание EN
var SEED=[
[1,"CF-D001","Платье «Вена»","Dress “Vienna”",0,"w","dress",42,52,164,170,[6,4,6],14,450,"Приталенное платье с юбкой-полусолнце и втачным рукавом.","Fitted dress with a half-circle skirt and set-in sleeves."],
[2,"CF-D002","Платье-футляр «Милан»","Sheath dress “Milan”",0,"w","dress",40,50,164,170,[4,2,4],11,380,"Футляр с рельефами и потайной молнией по спинке.","Sheath dress with princess seams and a hidden back zip."],
[3,"CF-B001","Блуза «Лилль»","Blouse “Lille”",1,"w","top",42,54,164,170,[10,10,12],9,320,"Блуза свободного кроя со спущенной линией плеча и манжетами.","Relaxed blouse with a dropped shoulder and cuffs."],
[4,"CF-S001","Мужская рубашка «Оксфорд»","Men’s shirt “Oxford”",2,"m","top",46,58,176,182,[8,8,8],16,400,"Классическая рубашка с воротником-стойкой на подкладке.","Classic shirt with a lined collar stand."],
[5,"CF-K001","Юбка «Карандаш»","Skirt “Pencil”",3,"w","skirt",42,52,164,170,[0,1,2],7,250,"Прямая юбка со шлицей и обтачками для плотных тканей.","Straight skirt with a vent and facings for firm fabrics."],
[6,"CF-T001","Брюки «Прага»","Trousers “Prague”",4,"w","trousers",42,54,164,170,[4,2,6],10,420,"Брюки прямого силуэта с высокой посадкой и боковыми карманами.","Straight high-rise trousers with side pockets."],
[7,"CF-J001","Жакет «Берлин»","Jacket “Berlin”",6,"w","coat",42,52,164,170,[8,8,10],22,590,"Полуприлегающий жакет с английским воротником.","Semi-fitted jacket with a notch collar."],
[8,"CF-C001","Пальто «Осло»","Coat “Oslo”",20,"w","coat",42,54,164,170,[14,14,16],28,780,"Двубортное пальто прямого кроя с рукавом реглан.","Double-breasted straight coat with raglan sleeves."],
[9,"CF-K101","Детское платье «Лето»","Kids’ dress “Summer”",0,"k","dress",28,36,122,134,[8,8,8],8,220,"Платье на кокетке с оборкой по низу.","Yoke dress with a bottom ruffle."],
[10,"CF-W001","Комбинезон «Мастер»","Overall “Master”",13,"s","overall",44,60,170,182,[12,12,14],18,640,"Рабочий комбинезон на молнии с накладными карманами.","Zip-front work overall with patch pockets."]];
var adapter={get:function(){try{return JSON.parse(localStorage.getItem(KEY))}catch(e){return null}},set:function(d){localStorage.setItem(KEY,JSON.stringify(d))},raw:function(){return localStorage.getItem(KEY)}};
function seed(){var sz={};
var pr=SEED.map(function(r){var s=[];for(var x=r[7];x<=r[8];x+=2){s.push(x);sz[x]=1}
return{id:r[0],a:r[1],ru:r[2],en:r[3],dRu:r[14],dEn:r[15],cat:r[4],aud:r[5],sil:r[6],sizes:s,h:[r[9],r[10]],e:r[11],pcs:r[12],price:r[13],cur:"★",img:{extra:[]},formats:FM.slice(),files:{},status:"published",created:T0,updated:T0}});
return{version:1,categories:CATS.map(function(c,i){var p=c.split("|");return{id:i,ru:p[0],en:p[1]}}),sizes:Object.keys(sz).map(Number).sort(function(a,b){return a-b}),products:pr,settings:{name:"",support:"",cur:"★",cols:2,logo:""},log:[{t:T0,m:"Загружены демонстрационные данные"}]}}
function validate(d){
if(!d||typeof d!=="object"||d.version!==1)return"Неверный формат: нет version=1";
if(!Array.isArray(d.categories)||!Array.isArray(d.sizes)||!Array.isArray(d.products))return"Нет списков categories / sizes / products";
var ids={},i,c,p;
for(i=0;i<d.categories.length;i++){c=d.categories[i];if(!c||!Number.isInteger(c.id)||typeof c.ru!=="string"||typeof c.en!=="string")return"Категория №"+(i+1)+" повреждена";if(ids[c.id])return"Повторяющийся id категории "+c.id;ids[c.id]=1}
if(d.sizes.some(function(s){return typeof s!=="number"||!isFinite(s)||s<=0}))return"Размеры должны быть положительными числами";
var pid={},art={};
for(i=0;i<d.products.length;i++){p=d.products[i];var n="Товар №"+(i+1)+": ";
if(!p||!Number.isInteger(p.id)||pid[p.id])return n+"неверный или повторяющийся id";pid[p.id]=1;
if(typeof p.a!=="string"||!p.a||art[p.a])return n+"пустой или повторяющийся артикул";art[p.a]=1;
if(typeof p.ru!=="string"||!p.ru||typeof p.en!=="string")return n+"нет названия";
if(typeof p.dRu!=="string"||typeof p.dEn!=="string")return n+"нет описания";
if(!ids[p.cat])return n+"категория не найдена";
if(AUD.indexOf(p.aud)<0)return n+"неизвестная аудитория";
if(!Array.isArray(p.sizes)||p.sizes.some(function(s){return typeof s!=="number"}))return n+"неверные размеры";
if(!Array.isArray(p.h)||!Array.isArray(p.e)||p.h.length!==2||p.e.length!==3)return n+"неверные рост или прибавки";
if(typeof p.price!=="number"||!isFinite(p.price)||p.price<0||typeof p.cur!=="string")return n+"неверная цена или валюта";
if(p.status!=="draft"&&p.status!=="published")return n+"неверный статус";
if(!Array.isArray(p.formats)||p.formats.some(function(f){return FM.indexOf(f)<0}))return n+"неизвестный формат файла (разрешены PDF A4, PDF Plotter, PLT)";
if(!p.img||typeof p.img!=="object"||!p.files||typeof p.files!=="object")return n+"нет блока изображений или файлов"}
if(!d.settings||typeof d.settings!=="object")return"Нет блока settings";
if(!Array.isArray(d.log))return"Нет журнала log";return null}
function load(){var d=adapter.get(),raw=adapter.raw();if(d&&!validate(d))return d;
if(raw){try{localStorage.setItem(KEY+".damaged",raw)}catch(e){}}
d=seed();try{adapter.set(d)}catch(e){}return d}
function log(d,m){d.log.unshift({t:new Date().toISOString(),m:m});if(d.log.length>30)d.log.length=30}
return{FM:FM,AUD:AUD,load:load,save:function(d){adapter.set(d)},seed:seed,validate:validate,log:log,adapter:adapter}})();
