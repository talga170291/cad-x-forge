-- ДЕМО-ДАННЫЕ ДЛЯ ПЕРВОНАЧАЛЬНОГО НАПОЛНЕНИЯ (необязательно).
-- Товары создаются как ЧЕРНОВИКИ без изображений и файлов: чтобы опубликовать, загрузите изображение и файл в админке.
-- Удалить демо-товары: DELETE FROM products WHERE sku IN (SELECT sku FROM products WHERE sku LIKE 'CF-%');  (или удалите их в админке)

INSERT INTO products(sku,slug,name_ru,name_en,desc_ru,desc_en,category_id,audience_id,price_stars,pieces_count,status) VALUES('CF-D001','cf-d001','Платье «Вена»','Dress “Vienna”','Приталенное платье с юбкой-полусолнце и втачным рукавом.','Fitted dress with a half-circle skirt and set-in sleeves.',(SELECT id FROM categories WHERE slug='dresses'),(SELECT id FROM audiences WHERE slug='women'),450,14,'draft');
INSERT INTO product_sizes(product_id,size_id) SELECT p.id,s.id FROM products p,sizes s JOIN size_groups g ON g.id=s.group_id WHERE p.sku='CF-D001' AND g.slug='women' AND s.label GLOB '[0-9]*' AND CAST(s.label AS INTEGER) BETWEEN 42 AND 52;
INSERT INTO product_heights(product_id,height_id) SELECT p.id,h.id FROM products p,heights h JOIN height_groups g ON g.id=h.group_id WHERE p.sku='CF-D001' AND g.slug='adult' AND h.cm BETWEEN 164 AND 170;
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'Платье' FROM products p,attributes a WHERE p.sku='CF-D001' AND a.slug='garment-type';
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'грудь +6, талия +4, бёдра +6 см' FROM products p,attributes a WHERE p.sku='CF-D001' AND a.slug='ease';

INSERT INTO products(sku,slug,name_ru,name_en,desc_ru,desc_en,category_id,audience_id,price_stars,pieces_count,status) VALUES('CF-D002','cf-d002','Платье-футляр «Милан»','Sheath dress “Milan”','Футляр с рельефами и потайной молнией по спинке.','Sheath dress with princess seams and a hidden back zip.',(SELECT id FROM categories WHERE slug='dresses'),(SELECT id FROM audiences WHERE slug='women'),380,11,'draft');
INSERT INTO product_sizes(product_id,size_id) SELECT p.id,s.id FROM products p,sizes s JOIN size_groups g ON g.id=s.group_id WHERE p.sku='CF-D002' AND g.slug='women' AND s.label GLOB '[0-9]*' AND CAST(s.label AS INTEGER) BETWEEN 40 AND 50;
INSERT INTO product_heights(product_id,height_id) SELECT p.id,h.id FROM products p,heights h JOIN height_groups g ON g.id=h.group_id WHERE p.sku='CF-D002' AND g.slug='adult' AND h.cm BETWEEN 164 AND 170;
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'Платье' FROM products p,attributes a WHERE p.sku='CF-D002' AND a.slug='garment-type';
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'грудь +4, талия +2, бёдра +4 см' FROM products p,attributes a WHERE p.sku='CF-D002' AND a.slug='ease';

INSERT INTO products(sku,slug,name_ru,name_en,desc_ru,desc_en,category_id,audience_id,price_stars,pieces_count,status) VALUES('CF-B001','cf-b001','Блуза «Лилль»','Blouse “Lille”','Блуза свободного кроя со спущенной линией плеча и манжетами.','Relaxed blouse with a dropped shoulder and cuffs.',(SELECT id FROM categories WHERE slug='blouses'),(SELECT id FROM audiences WHERE slug='women'),320,9,'draft');
INSERT INTO product_sizes(product_id,size_id) SELECT p.id,s.id FROM products p,sizes s JOIN size_groups g ON g.id=s.group_id WHERE p.sku='CF-B001' AND g.slug='women' AND s.label GLOB '[0-9]*' AND CAST(s.label AS INTEGER) BETWEEN 42 AND 54;
INSERT INTO product_heights(product_id,height_id) SELECT p.id,h.id FROM products p,heights h JOIN height_groups g ON g.id=h.group_id WHERE p.sku='CF-B001' AND g.slug='adult' AND h.cm BETWEEN 164 AND 170;
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'Блуза' FROM products p,attributes a WHERE p.sku='CF-B001' AND a.slug='garment-type';
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'грудь +10, талия +10, бёдра +12 см' FROM products p,attributes a WHERE p.sku='CF-B001' AND a.slug='ease';

INSERT INTO products(sku,slug,name_ru,name_en,desc_ru,desc_en,category_id,audience_id,price_stars,pieces_count,status) VALUES('CF-S001','cf-s001','Мужская рубашка «Оксфорд»','Men’s shirt “Oxford”','Классическая рубашка с воротником-стойкой на подкладке.','Classic shirt with a lined collar stand.',(SELECT id FROM categories WHERE slug='shirts'),(SELECT id FROM audiences WHERE slug='men'),400,16,'draft');
INSERT INTO product_sizes(product_id,size_id) SELECT p.id,s.id FROM products p,sizes s JOIN size_groups g ON g.id=s.group_id WHERE p.sku='CF-S001' AND g.slug='men' AND s.label GLOB '[0-9]*' AND CAST(s.label AS INTEGER) BETWEEN 46 AND 58;
INSERT INTO product_heights(product_id,height_id) SELECT p.id,h.id FROM products p,heights h JOIN height_groups g ON g.id=h.group_id WHERE p.sku='CF-S001' AND g.slug='adult' AND h.cm BETWEEN 176 AND 182;
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'Рубашка' FROM products p,attributes a WHERE p.sku='CF-S001' AND a.slug='garment-type';
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'грудь +8, талия +8, бёдра +8 см' FROM products p,attributes a WHERE p.sku='CF-S001' AND a.slug='ease';

INSERT INTO products(sku,slug,name_ru,name_en,desc_ru,desc_en,category_id,audience_id,price_stars,pieces_count,status) VALUES('CF-K001','cf-k001','Юбка «Карандаш»','Skirt “Pencil”','Прямая юбка со шлицей и обтачками для плотных тканей.','Straight skirt with a vent and facings for firm fabrics.',(SELECT id FROM categories WHERE slug='skirts'),(SELECT id FROM audiences WHERE slug='women'),250,7,'draft');
INSERT INTO product_sizes(product_id,size_id) SELECT p.id,s.id FROM products p,sizes s JOIN size_groups g ON g.id=s.group_id WHERE p.sku='CF-K001' AND g.slug='women' AND s.label GLOB '[0-9]*' AND CAST(s.label AS INTEGER) BETWEEN 42 AND 52;
INSERT INTO product_heights(product_id,height_id) SELECT p.id,h.id FROM products p,heights h JOIN height_groups g ON g.id=h.group_id WHERE p.sku='CF-K001' AND g.slug='adult' AND h.cm BETWEEN 164 AND 170;
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'Юбка' FROM products p,attributes a WHERE p.sku='CF-K001' AND a.slug='garment-type';
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'талия +1, бёдра +2 см' FROM products p,attributes a WHERE p.sku='CF-K001' AND a.slug='ease';

INSERT INTO products(sku,slug,name_ru,name_en,desc_ru,desc_en,category_id,audience_id,price_stars,pieces_count,status) VALUES('CF-T001','cf-t001','Брюки «Прага»','Trousers “Prague”','Брюки прямого силуэта с высокой посадкой и боковыми карманами.','Straight high-rise trousers with side pockets.',(SELECT id FROM categories WHERE slug='trousers'),(SELECT id FROM audiences WHERE slug='women'),420,10,'draft');
INSERT INTO product_sizes(product_id,size_id) SELECT p.id,s.id FROM products p,sizes s JOIN size_groups g ON g.id=s.group_id WHERE p.sku='CF-T001' AND g.slug='women' AND s.label GLOB '[0-9]*' AND CAST(s.label AS INTEGER) BETWEEN 42 AND 54;
INSERT INTO product_heights(product_id,height_id) SELECT p.id,h.id FROM products p,heights h JOIN height_groups g ON g.id=h.group_id WHERE p.sku='CF-T001' AND g.slug='adult' AND h.cm BETWEEN 164 AND 170;
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'Брюки' FROM products p,attributes a WHERE p.sku='CF-T001' AND a.slug='garment-type';
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'талия +2, бёдра +6 см' FROM products p,attributes a WHERE p.sku='CF-T001' AND a.slug='ease';

INSERT INTO products(sku,slug,name_ru,name_en,desc_ru,desc_en,category_id,audience_id,price_stars,pieces_count,status) VALUES('CF-J001','cf-j001','Жакет «Берлин»','Jacket “Berlin”','Полуприлегающий жакет с английским воротником.','Semi-fitted jacket with a notch collar.',(SELECT id FROM categories WHERE slug='jackets'),(SELECT id FROM audiences WHERE slug='women'),590,22,'draft');
INSERT INTO product_sizes(product_id,size_id) SELECT p.id,s.id FROM products p,sizes s JOIN size_groups g ON g.id=s.group_id WHERE p.sku='CF-J001' AND g.slug='women' AND s.label GLOB '[0-9]*' AND CAST(s.label AS INTEGER) BETWEEN 42 AND 52;
INSERT INTO product_heights(product_id,height_id) SELECT p.id,h.id FROM products p,heights h JOIN height_groups g ON g.id=h.group_id WHERE p.sku='CF-J001' AND g.slug='adult' AND h.cm BETWEEN 164 AND 170;
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'Жакет' FROM products p,attributes a WHERE p.sku='CF-J001' AND a.slug='garment-type';
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'грудь +8, талия +8, бёдра +10 см' FROM products p,attributes a WHERE p.sku='CF-J001' AND a.slug='ease';

INSERT INTO products(sku,slug,name_ru,name_en,desc_ru,desc_en,category_id,audience_id,price_stars,pieces_count,status) VALUES('CF-C001','cf-c001','Пальто «Осло»','Coat “Oslo”','Двубортное пальто прямого кроя с рукавом реглан.','Double-breasted straight coat with raglan sleeves.',(SELECT id FROM categories WHERE slug='coats'),(SELECT id FROM audiences WHERE slug='women'),780,28,'draft');
INSERT INTO product_sizes(product_id,size_id) SELECT p.id,s.id FROM products p,sizes s JOIN size_groups g ON g.id=s.group_id WHERE p.sku='CF-C001' AND g.slug='women' AND s.label GLOB '[0-9]*' AND CAST(s.label AS INTEGER) BETWEEN 42 AND 54;
INSERT INTO product_heights(product_id,height_id) SELECT p.id,h.id FROM products p,heights h JOIN height_groups g ON g.id=h.group_id WHERE p.sku='CF-C001' AND g.slug='adult' AND h.cm BETWEEN 164 AND 170;
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'Пальто' FROM products p,attributes a WHERE p.sku='CF-C001' AND a.slug='garment-type';
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'грудь +14, талия +14, бёдра +16 см' FROM products p,attributes a WHERE p.sku='CF-C001' AND a.slug='ease';

INSERT INTO products(sku,slug,name_ru,name_en,desc_ru,desc_en,category_id,audience_id,price_stars,pieces_count,status) VALUES('CF-K101','cf-k101','Детское платье «Лето»','Kids’ dress “Summer”','Платье на кокетке с оборкой по низу.','Yoke dress with a bottom ruffle.',(SELECT id FROM categories WHERE slug='dresses'),(SELECT id FROM audiences WHERE slug='kids'),220,8,'draft');
INSERT INTO product_sizes(product_id,size_id) SELECT p.id,s.id FROM products p,sizes s JOIN size_groups g ON g.id=s.group_id WHERE p.sku='CF-K101' AND g.slug='kids' AND s.label GLOB '[0-9]*' AND CAST(s.label AS INTEGER) BETWEEN 28 AND 36;
INSERT INTO product_heights(product_id,height_id) SELECT p.id,h.id FROM products p,heights h JOIN height_groups g ON g.id=h.group_id WHERE p.sku='CF-K101' AND g.slug='kids' AND h.cm BETWEEN 122 AND 134;
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'Платье' FROM products p,attributes a WHERE p.sku='CF-K101' AND a.slug='garment-type';
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'грудь +8, талия +8, бёдра +8 см' FROM products p,attributes a WHERE p.sku='CF-K101' AND a.slug='ease';

INSERT INTO products(sku,slug,name_ru,name_en,desc_ru,desc_en,category_id,audience_id,price_stars,pieces_count,status) VALUES('CF-W001','cf-w001','Комбинезон «Мастер»','Overall “Master”','Рабочий комбинезон на молнии с накладными карманами.','Zip-front work overall with patch pockets.',(SELECT id FROM categories WHERE slug='workwear'),(SELECT id FROM audiences WHERE slug='men'),640,18,'draft');
INSERT INTO product_sizes(product_id,size_id) SELECT p.id,s.id FROM products p,sizes s JOIN size_groups g ON g.id=s.group_id WHERE p.sku='CF-W001' AND g.slug='men' AND s.label GLOB '[0-9]*' AND CAST(s.label AS INTEGER) BETWEEN 44 AND 60;
INSERT INTO product_heights(product_id,height_id) SELECT p.id,h.id FROM products p,heights h JOIN height_groups g ON g.id=h.group_id WHERE p.sku='CF-W001' AND g.slug='adult' AND h.cm BETWEEN 170 AND 182;
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'Комбинезон' FROM products p,attributes a WHERE p.sku='CF-W001' AND a.slug='garment-type';
INSERT INTO product_attributes(product_id,attribute_id,text_value) SELECT p.id,a.id,'грудь +12, талия +12, бёдра +14 см' FROM products p,attributes a WHERE p.sku='CF-W001' AND a.slug='ease';
