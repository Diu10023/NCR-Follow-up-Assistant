#!/usr/bin/env python3
"""Builds docs/app-flow-en.html and docs/app-flow-th.html (flow chart of the whole app). PNGs: see render at the bottom."""
import html, sys
T = {
'en': dict(
 title='NCR Follow-up Control: process flow', sub='Top: how the parts connect · Bottom: what QA does every week',
 s1='1) How the system connects', s2='2) What QA does every week',
 team='Team (QA + others)', team1='Open the same web link', team2='Type the team code once',
 web='Web app (Vercel)', web1='All screens + reads the Excel file', web2='Stores no data itself',
 api='Apps Script (API)', api1='Checks the team code, reads/writes', api2='the Sheet. Link /exec in config.js',
 sheet='Google Sheet (database)', sheet1='NCR_Master · Followup_History', sheet2='Settings · _Data (upload log)', sheet3='Do not edit by hand',
 rw='read / write', gh='GitHub: code → Vercel deploys', gh2='automatically on every push',
 sync='Others see changes in about 8 s (auto-check) or at once with the Refresh button',
 excel='Weekly Excel export', excel1='NCR, Closed, Remarks, Buyer',
 imp='Uploads → Import', imp1='Pick the file date, check the preview',
 sort='Sorted automatically', sort1='Matched to old NCRs by NCR No.',
 chg='What changed', chg1='What buyers wrote. Press Reviewed',
 todo='To follow up', todo1='Red: No remark (chase first)', todo2='Orange: Has remark (buyer replied)', todo3='Press Follow-up',
 fu='Followed up', fu1='Stays here until the', fu2='file closes it',
 cl='Closed', cl1='The file says it is closed',
 hj='Hold & Jira', hj1='Hold for scrap', hj2='Closed because of Jira',
 miss='NCR missing from file', miss1='Shown as missing', miss2='Closed then reopened → comes back',
 loop='Next week: buyer writes Remarks → upload the new file → back to What changed',
 more='Extra menus: Buyers (per buyer + Excel export) · Trends (charts) · Settings (backup/restore, Undo, clear data)',
 more2='No manual editing in the app: everything comes from the Excel file + the Follow-up button'),
'th': dict(
 title='NCR Follow-up Control: ภาพรวมการทำงาน', sub='ส่วนบน: ระบบเชื่อมกันอย่างไร · ส่วนล่าง: สิ่งที่ QA ทำในแต่ละสัปดาห์',
 s1='1) ระบบเชื่อมกันอย่างไร', s2='2) สิ่งที่ QA ทำในแต่ละสัปดาห์',
 team='ทีม (QA + คนอื่น)', team1='เปิดเว็บจากลิงก์เดียวกัน', team2='กรอกรหัสทีมครั้งแรก',
 web='เว็บแอป (Vercel)', web1='หน้าจอทั้งหมด + อ่านไฟล์ Excel', web2='ไม่เก็บข้อมูลเอง',
 api='Apps Script (API)', api1='ตรวจรหัสทีม แล้วอ่าน/เขียนชีต', api2='ลิงก์ /exec ใน config.js',
 sheet='Google Sheet (ฐานข้อมูล)', sheet1='NCR_Master · Followup_History', sheet2='Settings · _Data (ประวัติอัพโหลด)', sheet3='ห้ามแก้ด้วยมือ',
 rw='อ่าน/เขียน', gh='GitHub: เก็บโค้ด → Vercel deploy', gh2='อัตโนมัติทุกครั้งที่ push',
 sync='คนอื่นเห็นการเปลี่ยนแปลงใน ~8 วินาที (เช็กอัตโนมัติ) หรือทันทีด้วยปุ่ม Refresh',
 excel='ไฟล์ Excel ประจำสัปดาห์', excel1='NCR, Closed, Remarks, Buyer',
 imp='Uploads → Import', imp1='เลือกวันที่ไฟล์ ดู preview',
 sort='จัดกลุ่มอัตโนมัติ', sort1='เทียบกับ NCR เดิมด้วยเลข NCR',
 chg='What changed', chg1='Buyer ตอบอะไรมาบ้าง กด Reviewed',
 todo='To follow up', todo1='แดง: No remark (ตามก่อน)', todo2='ส้ม: Has remark (Buyer ตอบแล้ว)', todo3='กด Follow-up',
 fu='Followed up', fu1='อยู่จนกว่าไฟล์', fu2='จะปิดเอง',
 cl='Closed', cl1='ไฟล์ระบุว่าปิดแล้ว',
 hj='Hold & Jira', hj1='Hold for scrap', hj2='ปิดเพราะ Jira',
 miss='NCR หายจากไฟล์', miss1='แจ้งเป็น missing', miss2='ปิดแล้วเปิดใหม่ → กลับมา',
 loop='สัปดาห์ถัดไป: Buyer เขียน Remarks → อัพไฟล์ใหม่ → วนกลับไปที่ What changed',
 more='เมนูเสริม: Buyers (ดูต่อ Buyer + export Excel) · Trends (กราฟ) · Settings (สำรอง/กู้คืน, Undo, ล้างข้อมูล)',
 more2='ไม่มีการแก้ข้อมูลด้วยมือในแอป: ทุกอย่างมาจากไฟล์ Excel + ปุ่ม Follow-up'),
}
def page(lang):
    t = {k: html.escape(v) for k, v in T[lang].items()}
    return f'''<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><title>{t['title']}</title>
<style>
body{{margin:0;background:#fff;color:#3D4852;font-family:Loma,"DejaVu Sans",Arial,sans-serif}}
figure{{margin:0;padding:26px 30px 22px}}
h1{{font-size:22px;margin:0 0 4px}}.sub{{font-size:14px;color:#6B7280;margin:0 0 10px}}
svg{{display:block;width:100%;height:auto}}
text{{font-family:Loma,"DejaVu Sans",Arial,sans-serif;fill:#3D4852;stroke:none}}
.t{{font-size:15px;font-weight:700}}.s{{font-size:12.5px;fill:#5b6572}}.h{{font-size:15px;font-weight:700;fill:#007AC8}}
.l{{font-size:12.5px;font-weight:700;paint-order:stroke;stroke:#fff;stroke-width:5px}}
.box{{fill:#fff;stroke:#3D4852;stroke-width:1.6}}
</style></head><body><figure>
<h1>{t['title']}</h1>
<p class="sub">{t['sub']}</p>
<svg viewBox="0 0 1440 900">
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#3D4852"/></marker></defs>
<g fill="none" stroke="#3D4852" stroke-width="1.8">
<text class="h" x="30" y="30">{t['s1']}</text>
<rect class="box" x="30" y="50" width="270" height="110" rx="14"/>
<text class="t" x="165" y="84" text-anchor="middle">{t['team']}</text>
<text class="s" x="165" y="106" text-anchor="middle">{t['team1']}</text>
<text class="s" x="165" y="124" text-anchor="middle">{t['team2']}</text>
<line x1="300" y1="105" x2="398" y2="105" marker-end="url(#a)"/>
<rect class="box" x="400" y="50" width="270" height="110" rx="14" stroke="#007AC8" stroke-width="2.4"/>
<text class="t" x="535" y="84" text-anchor="middle">{t['web']}</text>
<text class="s" x="535" y="106" text-anchor="middle">{t['web1']}</text>
<text class="s" x="535" y="124" text-anchor="middle">{t['web2']}</text>
<line x1="670" y1="105" x2="768" y2="105" marker-end="url(#a)"/>
<text class="l" x="719" y="94" text-anchor="middle">{t['rw']}</text>
<rect class="box" x="770" y="50" width="270" height="110" rx="14"/>
<text class="t" x="905" y="84" text-anchor="middle">{t['api']}</text>
<text class="s" x="905" y="106" text-anchor="middle">{t['api1']}</text>
<text class="s" x="905" y="124" text-anchor="middle">{t['api2']}</text>
<line x1="1040" y1="105" x2="1138" y2="105" marker-end="url(#a)"/>
<rect class="box" x="1140" y="50" width="270" height="110" rx="14"/>
<text class="t" x="1275" y="78" text-anchor="middle">{t['sheet']}</text>
<text class="s" x="1275" y="100" text-anchor="middle">{t['sheet1']}</text>
<text class="s" x="1275" y="118" text-anchor="middle">{t['sheet2']}</text>
<text class="s" x="1275" y="140" text-anchor="middle">{t['sheet3']}</text>
<rect class="box" x="400" y="190" width="270" height="52" rx="12" stroke-dasharray="6 5"/>
<text class="s" x="535" y="213" text-anchor="middle">{t['gh']}</text>
<text class="s" x="535" y="231" text-anchor="middle">{t['gh2']}</text>
<line x1="535" y1="190" x2="535" y2="162" stroke-dasharray="6 5" marker-end="url(#a)"/>
<rect class="box" x="770" y="190" width="640" height="52" rx="12" stroke-dasharray="6 5"/>
<text class="s" x="1090" y="221" text-anchor="middle">{t['sync']}</text>

<text class="h" x="30" y="300">{t['s2']}</text>
<rect class="box" x="30" y="325" width="230" height="86" rx="14"/>
<text class="t" x="145" y="358" text-anchor="middle">{t['excel']}</text>
<text class="s" x="145" y="380" text-anchor="middle">{t['excel1']}</text>
<line x1="260" y1="368" x2="338" y2="368" marker-end="url(#a)"/>
<rect class="box" x="340" y="325" width="230" height="86" rx="14" stroke="#007AC8" stroke-width="2.4"/>
<text class="t" x="455" y="358" text-anchor="middle">{t['imp']}</text>
<text class="s" x="455" y="380" text-anchor="middle">{t['imp1']}</text>
<line x1="570" y1="368" x2="648" y2="368" marker-end="url(#a)"/>
<rect class="box" x="650" y="325" width="230" height="86" rx="14"/>
<text class="t" x="765" y="358" text-anchor="middle">{t['sort']}</text>
<text class="s" x="765" y="380" text-anchor="middle">{t['sort1']}</text>
<line x1="880" y1="368" x2="958" y2="368" marker-end="url(#a)"/>
<rect class="box" x="960" y="325" width="230" height="86" rx="14"/>
<text class="t" x="1075" y="358" text-anchor="middle">{t['chg']}</text>
<text class="s" x="1075" y="380" text-anchor="middle">{t['chg1']}</text>
<line x1="765" y1="411" x2="765" y2="470"/>
<polyline points="230,540 230,470 1210,470 1210,540"/>
<line x1="485" y1="470" x2="485" y2="538" marker-end="url(#a)"/>
<line x1="765" y1="470" x2="765" y2="538" marker-end="url(#a)"/>
<line x1="990" y1="470" x2="990" y2="538" marker-end="url(#a)"/>
<line x1="230" y1="510" x2="230" y2="538" marker-end="url(#a)"/>
<line x1="1210" y1="510" x2="1210" y2="538" marker-end="url(#a)"/>
<rect class="box" x="90" y="540" width="280" height="110" rx="14" stroke="#C0392B" stroke-width="2.4"/>
<text class="t" x="230" y="570" text-anchor="middle">{t['todo']}</text>
<text class="s" x="230" y="592" text-anchor="middle">{t['todo1']}</text>
<text class="s" x="230" y="610" text-anchor="middle">{t['todo2']}</text>
<text class="s" x="230" y="632" text-anchor="middle">{t['todo3']}</text>
<rect class="box" x="400" y="540" width="170" height="110" rx="14"/>
<text class="t" x="485" y="575" text-anchor="middle">{t['fu']}</text>
<text class="s" x="485" y="597" text-anchor="middle">{t['fu1']}</text>
<text class="s" x="485" y="615" text-anchor="middle">{t['fu2']}</text>
<rect class="box" x="670" y="540" width="190" height="110" rx="14"/>
<text class="t" x="765" y="575" text-anchor="middle">{t['cl']}</text>
<text class="s" x="765" y="597" text-anchor="middle">{t['cl1']}</text>
<rect class="box" x="890" y="540" width="200" height="110" rx="14"/>
<text class="t" x="990" y="575" text-anchor="middle">{t['hj']}</text>
<text class="s" x="990" y="597" text-anchor="middle">{t['hj1']}</text>
<text class="s" x="990" y="615" text-anchor="middle">{t['hj2']}</text>
<rect class="box" x="1120" y="540" width="260" height="110" rx="14" stroke-dasharray="6 5"/>
<text class="t" x="1250" y="575" text-anchor="middle">{t['miss']}</text>
<text class="s" x="1250" y="597" text-anchor="middle">{t['miss1']}</text>
<text class="s" x="1250" y="615" text-anchor="middle">{t['miss2']}</text>
<line x1="370" y1="595" x2="398" y2="595" marker-end="url(#a)"/>
<path d="M485 650 L485 720 L1105 720 L1105 413" stroke-dasharray="6 5" marker-end="url(#a)"/>
<text class="l" x="795" y="710" text-anchor="middle">{t['loop']}</text>
<rect class="box" x="30" y="770" width="1380" height="60" rx="12" stroke-dasharray="6 5"/>
<text class="s" x="720" y="794" text-anchor="middle">{t['more']}</text>
<text class="s" x="720" y="814" text-anchor="middle">{t['more2']}</text>
</g></svg></figure></body></html>'''
for lang in T:
    open(f'docs/app-flow-{lang}.html', 'w').write(page(lang))
