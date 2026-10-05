#!/usr/bin/env python3
"""Builds docs/upload-flow-en.html and docs/upload-flow-th.html: what happens to each NCR when a new weekly file is imported."""
import html
T = {
'en': dict(
 title='NCR Follow-up Control: what happens at each upload', sub='Decision flow for every NCR when a new weekly file is imported',
 start='Upload next week’s file', start2='Uploads → Import, check the preview',
 match='Match every NCR by NCR No.', match2='with the data already saved',
 d1a='In the new file', d1b='and in the saved data?',
 l_file='Only in the file', l_saved='Only in saved data', l_both='In both',
 new='New NCR', new2='never seen before', newto='To follow up', newto2='Red: No remark · Orange: Has remark',
 miss='Missing from the file', miss2='(it was open before)', missto='Listed in What changed', missto2='QA checks it. Not closed automatically',
 d2a='What does the file say', d2b='about this NCR?',
 closed='Closed', closed2='Closed = Yes in the file', closed3='→ Closed page',
 jira='Jira closed', jira2='Remark contains “Jira”', jira3='→ Hold & Jira page',
 hold='Hold for scrap', hold2='Remark has “hold” or “scrap”', hold3='→ Hold & Jira page',
 open_='Otherwise (still open)', d3a='Buyer’s Remark', d3b='changed?',
 ch='Remark changed', ch1='Badge “Buyer updated”', ch2='Old and new text are saved', ch3='QA reads it → presses Reviewed',
 cl='Remark cleared', cl1='Logged as', cl2='“Buyer cleared Remarks”', cl3='Shown in What changed',
 sm='Remark unchanged', sm1='Nothing changes, stays in its list', sm2='Badges: Still no remark ·', sm3='No reply after 3 follow-ups · Open after 3 rounds', sm4='QA can press Follow-up again',
 foot1='File with no changes at all: the upload is still logged (“0 changes”), the banner can be dismissed and nothing moves. Wrong file? Press Undo this import.',
 foot2='A closed NCR that the file no longer marks as closed is reopened and shown in What changed.'),
'th': dict(
 title='NCR Follow-up Control: เมื่ออัพไฟล์ใหม่ แต่ละ NCR จะเกิดอะไรขึ้น', sub='ผังการตัดสินใจของแอปสำหรับทุก NCR เมื่อ import ไฟล์ประจำสัปดาห์',
 start='อัพไฟล์ของสัปดาห์ถัดไป', start2='Uploads → Import แล้วดู preview',
 match='จับคู่ทุก NCR ด้วยเลข NCR', match2='กับข้อมูลที่บันทึกไว้',
 d1a='อยู่ในไฟล์ใหม่', d1b='และในข้อมูลเดิมหรือไม่?',
 l_file='มีเฉพาะในไฟล์', l_saved='มีเฉพาะข้อมูลเดิม', l_both='มีทั้งสองที่',
 new='NCR ใหม่', new2='ไม่เคยเห็นมาก่อน', newto='To follow up', newto2='แดง: No remark · ส้ม: Has remark',
 miss='หายจากไฟล์', miss2='(เดิมยังเปิดอยู่)', missto='แจ้งใน What changed', missto2='QA ตรวจเอง ไม่ปิดให้อัตโนมัติ',
 d2a='ไฟล์ระบุอะไร', d2b='เกี่ยวกับ NCR นี้?',
 closed='Closed', closed2='ไฟล์ระบุ Closed = Yes', closed3='→ ไปหน้า Closed',
 jira='Jira closed', jira2='Remark มีคำว่า “Jira”', jira3='→ ไปหน้า Hold & Jira',
 hold='Hold for scrap', hold2='Remark มี “hold” หรือ “scrap”', hold3='→ ไปหน้า Hold & Jira',
 open_='นอกนั้น (ยังเปิดอยู่)', d3a='Remark ของ Buyer', d3b='เปลี่ยนไปหรือไม่?',
 ch='Remark เปลี่ยน', ch1='ขึ้นป้าย “Buyer updated”', ch2='เก็บข้อความเก่าและใหม่ไว้', ch3='QA อ่านแล้วกด Reviewed',
 cl='Remark ถูกลบ', cl1='บันทึกว่า', cl2='“Buyer cleared Remarks”', cl3='แสดงใน What changed',
 sm='Remark เหมือนเดิม', sm1='ไม่มีอะไรเปลี่ยน อยู่ในลิสต์เดิม', sm2='ป้าย: Still no remark ·', sm3='No reply after 3 follow-ups · Open after 3 rounds', sm4='กด Follow-up ซ้ำได้ถ้าต้องการตามอีก',
 foot1='ไฟล์ที่ไม่มีอะไรเปลี่ยนเลย: ระบบยังบันทึกการอัพโหลด (“0 changes”) ปิดแถบแจ้งเตือนได้ และไม่มีอะไรย้ายที่ ถ้าอัพผิดไฟล์ กด Undo this import',
 foot2='NCR ที่เคยปิดแล้ว แต่ไฟล์ใหม่ไม่ระบุว่าปิด จะถูกเปิดใหม่ (reopened) และแจ้งใน What changed'),
}
def page(lang):
    t = {k: html.escape(v) for k, v in T[lang].items()}
    def box(x, y, w, h, title, lines, stroke='#3D4852', sw='1.6', dash=''):
        d = f' stroke-dasharray="{dash}"' if dash else ''
        out = f'<rect class="box" x="{x}" y="{y}" width="{w}" height="{h}" rx="14" stroke="{stroke}" stroke-width="{sw}"{d}/>'
        cy = y + 28
        out += f'<text class="t" x="{x + w/2}" y="{cy}" text-anchor="middle">{title}</text>'
        for i, ln in enumerate(lines):
            out += f'<text class="s" x="{x + w/2}" y="{cy + 22 + i*18}" text-anchor="middle">{ln}</text>'
        return out
    def dia(cx, cy, hw, hh, a, b):
        return (f'<polygon class="box" points="{cx},{cy-hh} {cx+hw},{cy} {cx},{cy+hh} {cx-hw},{cy}" stroke="#007AC8" stroke-width="2.2"/>'
                f'<text class="t" x="{cx}" y="{cy-2}" text-anchor="middle">{a}</text><text class="t" x="{cx}" y="{cy+18}" text-anchor="middle">{b}</text>')
    def arrow(x1, y1, x2, y2): return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" marker-end="url(#a)"/>'
    def lbl(x, y, s, anchor='middle'): return f'<text class="l" x="{x}" y="{y}" text-anchor="{anchor}">{s}</text>'
    g = ''
    g += box(570, 40, 300, 70, t['start'], [t['start2']])
    g += arrow(720, 110, 720, 140)
    g += box(570, 140, 300, 70, t['match'], [t['match2']])
    g += arrow(720, 210, 720, 240)
    g += dia(720, 300, 200, 60, t['d1a'], t['d1b'])
    # left: only in file
    g += f'<line x1="520" y1="300" x2="330" y2="300" marker-end="url(#a)"/>' + lbl(425, 288, t['l_file'])
    g += box(60, 270, 270, 70, t['new'], [t['new2']])
    g += arrow(195, 340, 195, 380)
    g += box(60, 380, 270, 80, t['newto'], [t['newto2']], stroke='#C0392B', sw='2.4')
    # right: only in saved
    g += f'<line x1="920" y1="300" x2="1110" y2="300" marker-end="url(#a)"/>' + lbl(1015, 288, t['l_saved'])
    g += box(1110, 270, 270, 70, t['miss'], [t['miss2']], dash='6 5')
    g += arrow(1245, 340, 1245, 380)
    g += box(1110, 380, 270, 80, t['missto'], [t['missto2']], dash='6 5')
    # both
    g += arrow(720, 360, 720, 400) + lbl(735, 384, t['l_both'], 'start')
    g += dia(720, 460, 220, 60, t['d2a'], t['d2b'])
    g += '<line x1="720" y1="520" x2="720" y2="545"/><polyline points="200,545 200,570"/><polyline points="1100,545 1100,570"/><line x1="200" y1="545" x2="1100" y2="545"/>'
    g += arrow(200, 545, 200, 590) + arrow(470, 545, 470, 590) + arrow(740, 545, 740, 590) + arrow(1100, 545, 1100, 590)
    g += box(90, 590, 220, 100, t['closed'], [t['closed2'], t['closed3']])
    g += box(360, 590, 220, 100, t['jira'], [t['jira2'], t['jira3']])
    g += box(630, 590, 220, 100, t['hold'], [t['hold2'], t['hold3']])
    g += lbl(1115, 572, t['open_'], 'start')
    g += dia(1100, 650, 210, 62, t['d3a'], t['d3b'])
    g += '<line x1="1100" y1="712" x2="1100" y2="740"/><line x1="340" y1="740" x2="1100" y2="740"/>'
    g += arrow(340, 740, 340, 790) + arrow(720, 740, 720, 790) + arrow(1100, 740, 1100, 790)
    g += box(180, 790, 320, 120, t['ch'], [t['ch1'], t['ch2'], t['ch3']], stroke='#E67E22', sw='2.4')
    g += box(570, 790, 300, 120, t['cl'], [t['cl1'], t['cl2'], t['cl3']])
    g += box(940, 790, 320, 120, t['sm'], [t['sm1'], t['sm2'], t['sm3'], t['sm4']])
    g += '<rect class="box" x="30" y="940" width="1380" height="70" rx="12" stroke-dasharray="6 5"/>'
    g += f'<text class="s" x="720" y="968" text-anchor="middle">{t["foot1"]}</text><text class="s" x="720" y="990" text-anchor="middle">{t["foot2"]}</text>'
    return f'''<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><title>{t['title']}</title>
<style>
body{{margin:0;background:#fff;color:#3D4852;font-family:Loma,"DejaVu Sans",Arial,sans-serif}}
figure{{margin:0;padding:26px 30px 22px}}
h1{{font-size:22px;margin:0 0 4px}}.sub{{font-size:14px;color:#6B7280;margin:0 0 10px}}
svg{{display:block;width:100%;height:auto}}
text{{font-family:Loma,"DejaVu Sans",Arial,sans-serif;fill:#3D4852;stroke:none}}
.t{{font-size:15px;font-weight:700}}.s{{font-size:12.5px;fill:#5b6572}}
.l{{font-size:12.5px;font-weight:700;paint-order:stroke;stroke:#fff;stroke-width:5px}}
.box{{fill:#fff;stroke:#3D4852;stroke-width:1.6}}
</style></head><body><figure>
<h1>{t['title']}</h1><p class="sub">{t['sub']}</p>
<svg viewBox="0 0 1440 1030"><defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#3D4852"/></marker></defs>
<g fill="none" stroke="#3D4852" stroke-width="1.8">{g}</g></svg></figure></body></html>'''
for lang in T:
    open(f'docs/upload-flow-{lang}.html', 'w').write(page(lang))
