# ใช้งานแบบเว็บไซต์ (Vercel + GitHub) โดยเก็บข้อมูลใน Google Sheet

แนวทางนี้แยกเป็น 2 ส่วน
- **หน้าเว็บ** อยู่บน Vercel ดึงโค้ดจาก GitHub ทุกครั้งที่มีการอัปเดตจะขึ้นให้เอง ไม่ต้องวางไฟล์ใน Apps Script ทีละไฟล์
- **ฐานข้อมูล** คือ Google Sheet โดยมี Apps Script ไฟล์เดียว (`Code.gs`) เป็นตัวกลางอ่าน/เขียน

ใช้เวลาประมาณ 15 นาที

## ข้อควรรู้ก่อนเริ่ม (ความปลอดภัย)
- ตัวกลาง Apps Script ต้องตั้งให้ "ทุกคนเข้าถึงได้" (เพื่อให้เว็บบน Vercel เรียกได้) การป้องกันข้อมูลจึงอาศัย **รหัสผ่านทีม (`ACCESS_CODE`)** ที่ตรวจที่ฝั่ง Google ทุกครั้ง ถ้าไม่ตั้งรหัส ระบบจะปฏิเสธทุกคำขอ
- ตั้งรหัสให้ยาวและเดายาก (12 ตัวอักษรขึ้นไป) แจกเฉพาะทีม ผู้ใช้กรอกรหัสครั้งเดียวต่ออุปกรณ์
- หน้าเว็บบน Vercel เป็นสาธารณะ (เห็นแต่โค้ด ไม่เห็นข้อมูล) ข้อมูลอยู่ใน Sheet ที่ไม่ได้แชร์ให้ใคร
- ไม่มีการล็อกอินด้วย Google และไม่มีระบบแยกตัวตนผู้ใช้ (ทุกคนที่รู้รหัสทำได้เท่ากัน)

## ส่วนที่ 1: Google Sheet และ Apps Script (ไฟล์เดียว)
1. สร้าง Google Sheet ใหม่ (เปล่าๆ) → **Extensions → Apps Script**
2. ลบโค้ดเดิม แล้ววางเนื้อหาไฟล์ `apps-script/Code.gs` (หรือ `apps-script/paste-me/Code.txt`) **ไม่ต้องสร้างไฟล์ HTML**
3. แก้บรรทัด `var ACCESS_CODE = '';` เป็น `var ACCESS_CODE = 'รหัสผ่านทีมของคุณ';` แล้วกด Ctrl+S
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - กด Deploy → อนุญาตสิทธิ์ (Advanced → Go to … (unsafe) → Allow)
5. คัดลอก **Web app URL** (ลงท้าย `/exec`) เก็บไว้
6. ลองเปิดลิงก์นั้นในเบราว์เซอร์ ควรขึ้นข้อความ "NCR API is running"

## ส่วนที่ 2: ใส่ URL ในโค้ดบน GitHub
1. เปิดโปรเจกต์บน GitHub → ไฟล์ **`config.js`** → ไอคอนดินสอ (Edit)
2. แก้เป็น `window.NCR_CONFIG = { apiUrl: 'วาง URL /exec ที่นี่' };`
3. กด **Commit changes** (ลงในสาขา/branch ที่จะใช้ deploy)

## ส่วนที่ 3: Deploy บน Vercel
1. เข้า vercel.com → ล็อกอินด้วย GitHub → **Add New → Project** → เลือกรีโพ `ncr-follow-up-assistant` → **Import**
2. ตั้งค่า: **Framework Preset = Other**, Root Directory = `./`, ช่อง Build/Output **เว้นว่าง** → **Deploy**
3. สาขาที่ใช้: Vercel ขึ้นเว็บจริง (Production) จากสาขาหลักของรีโพ ถ้าโค้ดล่าสุดอยู่ในสาขา `claude/busy-wozniak-stc8ah` ให้เลือกอย่างใดอย่างหนึ่ง
   - รวมสาขานี้เข้า `main` บน GitHub (ให้ผมเปิด Pull Request ให้ได้)
   - หรือใน Vercel: **Settings → Git → Production Branch** ใส่ `claude/busy-wozniak-stc8ah`
4. ได้ลิงก์เช่น `https://ncr-follow-up-assistant.vercel.app` ส่งให้ทีม

## ใช้งาน
- เปิดลิงก์ → กรอกรหัสผ่านทีมครั้งแรก → ไปที่ **Uploads → Import** อัพไฟล์ Excel ตัวแรก ข้อมูลลง Sheet อัตโนมัติ
- ทุกคนเห็นข้อมูลเดียวกัน ข้อมูลรีเฟรชเองทุก 1 นาที ให้คนเดียวเป็นผู้อัพไฟล์ประจำสัปดาห์
- ถ้าอยากทดลองก่อนแก้โค้ด: ในเว็บไปที่ **Settings → Apps Script API URL** วาง URL แล้วกด Save and connect (เก็บไว้เฉพาะในเบราว์เซอร์นั้น)
- อัปเดตแอป: ผมแก้โค้ดแล้ว push ขึ้น GitHub Vercel อัปเดตเอง (ปกติไม่ต้องแตะ Apps Script ยกเว้นเมื่อ `Code.gs` เปลี่ยน ซึ่งผมจะแจ้ง)

## ถ้ามีปัญหา
- ขึ้น "Cannot reach the Google Sheet": ตรวจว่า URL ถูก (ลงท้าย `/exec`) และ Deploy แบบ **Anyone**
- ขอรหัสวนซ้ำ: รหัสไม่ตรงกับ `ACCESS_CODE` ใน Code.gs (ถ้าแก้รหัสต้อง Deploy เวอร์ชันใหม่)
- ข้อมูลไม่ขึ้น: ดูแถบสถานะด้านล่างว่ามีข้อความ "Save failed" แล้วส่งภาพมา

ยังไม่ได้ทดสอบกับ Google และ Vercel จริง ทดสอบกับระบบจำลองแล้ว: ขอรหัส, รหัสผิดถูกปฏิเสธ, อัพไฟล์แล้วข้อมูลลง Sheet, ผู้ใช้คนที่สองเห็นข้อมูลเดียวกัน
