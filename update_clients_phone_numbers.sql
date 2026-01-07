-- ============================================
-- UPDATE CLIENTS PHONE NUMBERS WITH SEPARATORS
-- ============================================
-- This script updates client phone numbers to include "/" separators
-- for multiple phone numbers
-- ============================================
-- IMPORTANT: Review and modify the phone numbers below as needed
-- Format: phone_number1/phone_number2/phone_number3
-- ============================================

-- Update phone numbers for clients
-- Modify the phone numbers in the format below to add "/" separators where needed

UPDATE clients SET phone = '22280542' WHERE cin = '11075951' AND name = 'Rami bahloul';
UPDATE clients SET phone = '97229508' WHERE cin = '11174126' AND name = 'جمال الزواري';
UPDATE clients SET phone = '9763238250027261' WHERE cin = '08163014' AND name = 'حمزة معتوق';
UPDATE clients SET phone = '25432207' WHERE cin = '11007502' AND name = 'خالد عبيد';
UPDATE clients SET phone = '53696179' WHERE cin = '08863159' AND name = 'خلود بن يونس';
UPDATE clients SET phone = '5106204727022526' WHERE cin = '06034919' AND name = 'خولة شوشان';
UPDATE clients SET phone = '93164632' WHERE cin = '11202335' AND name = 'رامي كداشي';
UPDATE clients SET phone = '26360216' WHERE cin = '08152373' AND name = 'رندة اللومي';
UPDATE clients SET phone = '52433977' WHERE cin = '05347379' AND name = 'ريم الكركري';
UPDATE clients SET phone = '29221973' WHERE cin = '11051373' AND name = 'زهرة شعبان';
UPDATE clients SET phone = '2069049821357125' WHERE cin = '11020087' AND name = 'سحر القاسمي';
UPDATE clients SET phone = '23683132' WHERE cin = '08848587' AND name = 'سرور القبايلي';
UPDATE clients SET phone = '51842046' WHERE cin = '11046405' AND name = 'سلمى بن فرج';
UPDATE clients SET phone = '28826204' WHERE cin = '08825855' AND name = 'سمية الهمامي';
UPDATE clients SET phone = '20193567' WHERE cin = '05287676' AND name = 'فاطمة الزغل';
UPDATE clients SET phone = '44321399' WHERE cin = '05329554' AND name = 'فاطمة اليوسفي';
UPDATE clients SET phone = '56270230' WHERE cin = '11077839' AND name = 'كوثر جوة';
UPDATE clients SET phone = '98962792' WHERE cin = '01281724' AND name = 'محمد البرادعي';
UPDATE clients SET phone = '23510456' WHERE cin = '08828822' AND name = 'محمد علي بوعافية';
UPDATE clients SET phone = '20131691' WHERE cin = '05385506' AND name = 'مريم البرشاني';
UPDATE clients SET phone = '5822092120192614/10/593' WHERE cin = '11047846' AND name = 'منال اللومي';
UPDATE clients SET phone = '2242855144696179' WHERE cin = '085750606' AND name = 'منى الزغل';
UPDATE clients SET phone = '26548646' WHERE cin = '09246445' AND name = 'منى حسناوي';
UPDATE clients SET phone = '22356841' WHERE cin = '01211560' AND name = 'منير الشامخي';
UPDATE clients SET phone = '2242855144794486' WHERE cin = '11191819' AND name = 'ميساء البهلول';
UPDATE clients SET phone = '44321399' WHERE cin = '08412506' AND name = 'ناجية اليوسفي';
UPDATE clients SET phone = '23801614' WHERE cin = '05361500' AND name = 'وردة دريرة';
UPDATE clients SET phone = '53696179' WHERE cin = '08761952' AND name = 'وفاء بركية';
UPDATE clients SET phone = '25621783' WHERE cin = '11129879' AND name = 'وهيب الغريبي';
UPDATE clients SET phone = '2654864620808461' WHERE cin = '06011796' AND name = 'ياسين عبد الاوي';

-- Verify updates
SELECT 
    name,
    cin,
    phone,
    LENGTH(phone) as phone_length
FROM clients
WHERE cin IN (
    '11075951', '11174126', '08163014', '11007502', '08863159',
    '06034919', '11202335', '08152373', '05347379', '11051373',
    '11020087', '08848587', '11046405', '08825855', '05287676',
    '05329554', '11077839', '01281724', '08828822', '05385506',
    '11047846', '085750606', '09246445', '01211560', '11191819',
    '08412506', '05361500', '08761952', '11129879', '06011796'
)
ORDER BY name;

-- Show clients with phone numbers containing "/"
SELECT 
    name,
    cin,
    phone
FROM clients
WHERE phone LIKE '%/%'
ORDER BY name;

