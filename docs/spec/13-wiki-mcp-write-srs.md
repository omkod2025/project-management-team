# SRS — Wiki MCP Create and Write Permissions

| รายการ | รายละเอียด |
|---|---|
| ระบบ | T-Timeline / Wiki MCP |
| เวอร์ชัน | 1.0 |
| วันที่ | 2026-11-09 |
| สถานะ | อ้างอิงแบบออกแบบที่ผู้ใช้อนุมัติแล้ว; ยังไม่ใช่รายงานการติดตั้งหรือผลทดสอบ |
| แบบออกแบบ | [2026-11-09 Wiki MCP permissions](../superpowers/specs/2026-11-09-wiki-mcp-write-permissions-design.md) |
| ข้อกำหนดเดิม | [Wiki specification](12-wiki.md) |

## 1. วัตถุประสงค์และขอบเขต

เพิ่มความสามารถให้ AI client สร้าง Wiki สร้างหน้า และแก้ไขข้อมูลผ่าน MCP โดยเจ้าของ token เลือกสิทธิ์ก่อนเลือกรายการ Wiki ที่อนุญาต ทุกการทำงานต้องอยู่ภายใต้สิทธิ์ปัจจุบันของเจ้าของ token และไม่มีความสามารถลบหรือ archive ผ่าน MCP

เอกสารนี้เป็นข้อกำหนดสำหรับฟีเจอร์ที่กำลังจะพัฒนา ไม่ได้ระบุว่าระบบปัจจุบันเขียนผ่าน MCP ได้แล้ว เมื่อมีข้อความขัดกัน ให้เอกสารนี้ใช้แทนข้อจำกัด read-only ของ `12-wiki.md` เฉพาะเรื่อง MCP และสิทธิ์ token เท่านั้น ข้อกำหนด Wiki, เนื้อหา, ความปลอดภัย และสิทธิ์ผู้ใช้เดิมยังใช้ต่อ

ครอบคลุมหน้าสร้าง/แก้ไข token การจัดเก็บสิทธิ์ การตรวจสิทธิ์ MCP เครื่องมือใหม่ การสร้าง Wiki พร้อมผูก scope การป้องกันเขียนทับ และการรองรับ token เดิม ไม่เพิ่มสิทธิ์ REST ด้วย Bearer token และไม่เปลี่ยนระบบสมาชิกของ Wiki

## 2. คำศัพท์และผู้เกี่ยวข้อง

| คำ | ความหมาย |
|---|---|
| เจ้าของ token | ผู้ใช้ที่สร้าง token; ใช้สิทธิ์ของบัญชีนี้ตรวจการทำงาน MCP |
| เจ้าของ Wiki | ผู้เป็นเจ้าของ Wiki ตามระบบเดิม อาจเป็นคนละคนกับเจ้าของ token |
| Token scope | รายการ Wiki ที่ token ได้รับอนุญาตให้เข้าถึง |
| Optional permissions | `create_wiki`, `create_page`, `write_wiki` ซึ่งเลือกแยกกันระดับ token |
| Baseline read tools | `list_wikis`, `list_pages`, `read_page`, `search` ที่ทุก token มีเป็นพื้นฐาน |
| Write member | สมาชิกที่เขียนหน้าได้ แต่ไม่ได้สิทธิ์จัดการรายละเอียด Wiki |
| Manage access | สิทธิ์เจ้าของ Wiki หรือ install admin ตามกฎเดิม |
| AI client | MCP client ที่ใช้ Bearer token เช่น Claude Code หรือ client ที่รองรับ Streamable HTTP |

ผู้ใช้จัดการ token ของตนผ่านหน้าระบบ ส่วน install admin เห็นรายการ token และเพิกถอน token ตามสิทธิ์เดิม การเพิ่มสิทธิ์นี้ไม่ทำให้ admin แก้ไข token ของผู้อื่นได้

## 3. รูปแบบสิทธิ์

### 3.1 สิทธิ์ระดับ token

| Permission | ความสามารถที่ให้ | ความสามารถที่ไม่ให้โดยอัตโนมัติ |
|---|---|---|
| `create_wiki` | สร้าง Wiki ใหม่และเพิ่ม Wiki นั้นเข้า scope ของ token ที่สร้าง | ไม่ให้สร้างหน้าหรือแก้ไขข้อมูลเดิม |
| `create_page` | สร้างหน้าใน Wiki ที่เข้าเงื่อนไข พร้อมชื่อและเนื้อหาเริ่มต้น | ไม่ให้สร้าง Wiki หรือแก้ไขหน้าที่สร้างไปแล้ว |
| `write_wiki` | แก้ชื่อ/คำอธิบาย Wiki และชื่อ/เนื้อหาหน้าที่มีอยู่ ตามสิทธิ์ผู้ใช้ | ไม่ให้สร้าง Wiki หรือสร้างหน้า |

ไม่มี `read_wiki` เพราะซ้ำกับสิทธิ์พื้นฐาน และไม่มี permission ลบ ทุก Wiki ใน scope ใช้ permission ชุดเดียวกัน

### 3.2 การตัดสินสิทธิ์จริง

| งาน | เงื่อนไขเพิ่มเติมนอกเหนือจาก token ที่ใช้งานได้ |
|---|---|
| อ่าน/ค้นหา | Wiki อยู่ใน scope และเจ้าของ token อ่านได้; Wiki/หน้าต้องไม่ archived |
| สร้าง Wiki | มี `create_wiki` และบัญชีเจ้าของ token มีสิทธิ์สร้าง Wiki ตามระบบเดิม; ไม่ต้องเลือก Wiki ล่วงหน้า |
| สร้างหน้า | มี `create_page`, Wiki อยู่ใน scope, เจ้าของ token เขียน Wiki ได้ และ Wiki ไม่ archived |
| แก้ชื่อ/คำอธิบาย Wiki | มี `write_wiki`, Wiki อยู่ใน scope, เจ้าของ token มี manage access และ Wiki ไม่ archived |
| แก้ชื่อ/เนื้อหาหน้า | มี `write_wiki`, Wiki ของหน้าอยู่ใน scope, เจ้าของ token มี write access และ Wiki/หน้าไม่ archived |

## 4. Functional requirements

### 4.1 การจัดการ token

- **TOK-01:** ระบบต้องให้เลือก optional permissions แต่ละรายการได้อย่างอิสระ และเริ่มต้นโดยไม่เลือกทั้งสามรายการ
- **TOK-02:** หน้าสร้างและแก้ไข token ต้องแสดงส่วนเลือก permissions ก่อนส่วนเลือกรายการ Wiki; ใช้ข้อความส่วนติดต่อภาษาอังกฤษตามระบบเดิม ได้แก่ Create wiki, Create page, Write wiki
- **TOK-03:** รายการ Wiki ต้องจำกัดตามสิทธิ์การมองเห็นปัจจุบันของผู้ใช้ การเลือก Wiki ไม่ให้สิทธิ์ผู้ใช้เพิ่ม ระบบต้องอธิบายว่าการเขียนยังขึ้นกับสิทธิ์ผู้ใช้ และเลือก Wiki ที่อ่านอย่างเดียวได้
- **TOK-04:** บันทึก permission ชุดเดียวต่อ token และใช้กับทุก Wiki ใน scope ไม่เก็บ permission แยกต่อ Wiki
- **TOK-05:** เจ้าของ token ต้องแก้ permissions และ scope ของ token เดิมได้โดยไม่ต้องสร้าง secret ใหม่ ให้มีผลตั้งแต่คำขอ MCP ถัดไป
- **TOK-06:** Token ที่มีอยู่ก่อน migration ต้องมี baseline reads อย่างเดียว; การสร้างผ่าน API ที่ไม่ส่ง permissions ต้องได้ผลเดียวกัน ห้ามเพิ่มสิทธิ์เขียนให้ token เดิมอัตโนมัติ
- **TOK-07:** การแก้ token ผ่าน API โดยไม่ส่ง permissions ต้องคงค่าที่บันทึกไว้ ส่วนการส่งชุดว่างต้องนำ optional permissions ทั้งหมดออก; ปฏิเสธ permission ที่ไม่รู้จักหรือรูปแบบข้อมูลผิด
- **TOK-08:** ผลลัพธ์ token API และตาราง token ของเจ้าของ/admin ต้องแสดง permissions ที่บันทึก โดยไม่แสดง hash หรือ secret ซ้ำ
- **TOK-09:** การอนุญาต token จากหน้า Wiki settings ต้องเปลี่ยนเฉพาะ scope ไม่เปลี่ยน permissions; คงข้อจำกัด token ของตนและเงื่อนไขผู้ใช้งานเดิม
- **TOK-10:** Token ที่ไม่มี Wiki ใน scope ต้องอ่านได้รายการว่าง แต่ยังสร้าง Wiki ได้ถ้ามี `create_wiki`

### 4.2 เครื่องมือ MCP

- **MCP-01:** คง baseline read tools ทั้งสี่และรูปแบบผลลัพธ์เดิม; การมี tool ไม่ได้รับประกันว่าจะเห็น Wiki ใดหากไม่มี scope หรือ user access
- **MCP-02:** เพิ่ม `create_wiki`, `create_page`, `update_wiki`, `update_page` ตามตารางสัญญาด้านล่าง
- **MCP-03:** รายการ tools ที่ประกาศต้องมี optional write tools เฉพาะที่ token มี permission และยังต้องตรวจ permission ฝั่ง server เมื่อเรียกจริง โดยไม่เชื่อรายการ tools ที่ client จำไว้
- **MCP-04:** Read tools ต้องคง `readOnlyHint: true`; write tools ต้องระบุว่าไม่ใช่ read-only และห้ามประกาศว่าการเรียกสร้างซ้ำเป็น idempotent
- **MCP-05:** คง `POST /api/mcp` แบบ Streamable HTTP, stateless และ JSON responses; ใช้ Bearer token เท่านั้น ไม่ใช้ session cookie หรือ public-link secret; GET/DELETE ยังเป็น 405

### 4.3 การสร้างและแก้ไข

- **WRT-01:** `create_wiki` ต้องสร้าง Wiki โดยให้เจ้าของ token เป็นเจ้าของ Wiki และเพิ่ม Wiki เข้า scope ของ token ที่สร้างใน transaction เดียวกัน หากผูก scope ไม่สำเร็จต้องไม่เหลือ Wiki ที่สร้างครึ่งทาง
- **WRT-02:** การสร้าง Wiki ต้องไม่เพิ่ม scope ให้ token อื่นของผู้ใช้ และไม่เพิ่ม optional permissions ใดให้ token ที่สร้าง
- **WRT-03:** `create_page` ต้องรับชื่อและเนื้อหาเริ่มต้น พร้อม optional parent/slug ตามกฎเดิม รองรับหน้าลึกสุดสามระดับและตรวจ parent ว่าเป็นหน้าที่ยังใช้งานใน Wiki เดียวกัน
- **WRT-04:** `update_wiki` ต้องแก้ได้เฉพาะชื่อและคำอธิบายที่ส่งมา ไม่รับ action archive, restore, transfer, publish, unpublish หรือการจัดการสมาชิก; หากส่งทั้งชื่อและคำอธิบายต้องบันทึกทั้งคู่สำเร็จหรือไม่บันทึกเลย
- **WRT-05:** `update_page` ต้องแก้เนื้อหา Markdown และ optional title ของหน้าที่มีอยู่ โดยไม่เปลี่ยน Wiki, slug, parent หรือลำดับหน้า
- **WRT-06:** การแก้หน้าต้องส่ง `updatedAt` จากการอ่านล่าสุด และตรวจเทียบภายใต้การควบคุม concurrent writes หากเก่าแล้วต้องไม่เขียนทับ พร้อมระบุ conflict ให้ client อ่านใหม่; ไม่เพิ่มทางข้าม conflict
- **WRT-07:** การเขียนหน้าต้องใช้กฎ validation, revision history, search indexing และ asset-reference validation เดิม โดยบันทึกเจ้าของ token เป็นผู้แก้ไข ไม่เพิ่ม upload หรือ asset-finalization operations ใน MCP
- **WRT-08:** Markdown ภาษาไทยและ Mermaid ต้องผ่านเส้นทางจัดเก็บ/อ่านเดิมโดยไม่สูญเสียเนื้อหาหรือกลายเป็น HTML ที่รันได้ คงข้อจำกัดความยาวและ validation เดิม
- **WRT-09:** ต้องไม่แปลง rich content เป็น Markdown แล้วทำให้ข้อมูลหรือรูปแบบหายโดยเงียบ การส่ง Markdown กลับมาโดยไม่เปลี่ยนต้องคง rich body เดิม หากเปลี่ยน Markdown ของ rich page ให้ปฏิเสธและแนะนำให้อ่านด้วย `include_rich_content: true` แล้วแก้ `rich_content` แทน; read response เดิมไม่เปลี่ยนเมื่อไม่ขอ field นี้

### 4.4 สัญญาเครื่องมือใหม่

ตารางนี้กำหนดข้อมูลเชิงหน้าที่; ชื่อ field ย่อยต้องสอดคล้องกับธรรมเนียม MCP เดิมและระบุแน่นอนในแผนพัฒนา

| Tool | Permission | ข้อมูลเข้า | ผลสำเร็จขั้นต่ำ |
|---|---|---|---|
| `create_wiki` | `create_wiki` | ชื่อ; คำอธิบายไม่บังคับ | Wiki ID, ชื่อ, คำอธิบาย; Wiki ปรากฏใน `list_wikis` ของ token นั้น |
| `create_page` | `create_page` | Wiki ID, ชื่อ, Markdown; parent ID และ slug ไม่บังคับ | Page ID, Wiki ID, slug, ชื่อ, `updatedAt` |
| `update_wiki` | `write_wiki` | Wiki ID และชื่อหรือคำอธิบายอย่างน้อยหนึ่งรายการ | Wiki ID, ชื่อและคำอธิบายหลังบันทึก |
| `update_page` | `write_wiki` | Page ID, `updatedAt`, เลือกส่ง `markdown` หรือ canonical `rich_content` เพียงหนึ่งรายการ; ชื่อไม่บังคับ | Page ID, ชื่อและ `updatedAt` ใหม่ |

`read_page` รับ `include_rich_content` เป็นตัวเลือก เมื่อเป็น true ให้คืน `rich_content` เป็นสตริง `fieldbook-rich-v1:` สำหรับ rich page หรือ null สำหรับหน้า Markdown ปกติ การแก้ rich content ยังผ่าน validation, limits และการตรวจ asset เดิมทั้งหมด

## 5. Authorization และข้อกำหนดที่ไม่ใช่ฟังก์ชัน

- **SEC-01:** ตรวจ token status, expiry, บัญชี active, permissions และ effective scope ใหม่ทุกคำขอ; token ถูก revoke/หมดอายุ หรือเจ้าของถูกปิดบัญชีต้องใช้ไม่ได้ตามพฤติกรรม 401 เดิม
- **SEC-02:** สิทธิ์ token ต้องไม่เกินสิทธิ์ผู้ใช้ ตรวจ read/write/manage ตามงาน หากผู้ใช้เสียสิทธิ์ต้องมีผลในคำขอถัดไป; scope เดิมคงอยู่และกลับมีผลเมื่อผู้ใช้ได้รับสิทธิ์คืนตามกฎเดิม
- **SEC-03:** ตรวจ Wiki ของ page และ parent จากข้อมูลจริง ห้ามใช้ Wiki ID ที่ client ส่งมาเพื่ออนุญาตการเข้าถึงหน้าของ Wiki อื่น
- **SEC-04:** เป้าหมายนอก scope, มองไม่เห็น, archived, ไม่พบ หรือ ID ผิดรูปแบบ ต้องตอบ `Not found.` แบบเดิมโดยไม่เปิดเผยว่ามีอยู่; การไม่มี permission ต้องไม่เปิดเผยข้อมูลเป้าหมายเช่นกัน
- **SEC-05:** ความผิดพลาดที่ client แก้ได้ต้องแยกได้ระหว่างไม่มี permission, validation และ stale-page conflict; unexpected error ต้องไม่ส่ง stack trace, SQL, secret, hash, public-link secret หรือข้อมูลส่วนตัวเพิ่มไปยัง client
- **SEC-06:** คง rate limit 60 requests ต่อนาทีต่อ token; การเขียนนับในงบเดียวกับการอ่าน คงนโยบาย `last_used_at` เดิม
- **SEC-07:** ใช้ parameterized SQL และกฎการ render ที่ปลอดภัยเดิม; ห้ามเปิดช่องให้ client เรียก domain actions อื่นผ่าน input ที่ไม่ได้จำกัด
- **CMP-01:** Token secret รูปแบบเดิมยังใช้ได้ การแก้ permission ไม่เปลี่ยน secret; คง expiry, revoke, จำนวน active tokens และนโยบายเจ้าของ/admin เดิม
- **CMP-02:** Migration ต้องรักษา scope และข้อมูลเดิม; ตรวจได้ทั้งฐานข้อมูลที่ migrate จากของเดิมและ schema สำหรับติดตั้งใหม่
- **CMP-03:** คู่มือผู้ใช้ คู่มือภายใน และข้อกำหนด Wiki ต้องอ้างถึง permissions ใหม่และเลิกระบุว่า MCP ทุกกรณีอ่านอย่างเดียว

## 6. User flows

1. ผู้ใช้เปิด Tokens / MCP ระบุ label/expiry ตามเดิม เลือก permissions ก่อนเลือกรายการ Wiki แล้วสร้าง token; secret แสดงครั้งเดียว
2. AI client เชื่อมด้วย token และค้น/อ่านเฉพาะ Wiki ที่ได้รับอนุญาต
3. หากมี `create_wiki` ให้สร้าง Wiki ใหม่แม้เริ่มด้วย scope ว่าง; Wiki ใหม่ปรากฏให้ token นั้นทันที
4. หากมี `create_page` และสิทธิ์ผู้ใช้เพียงพอ ให้สร้างหน้าพร้อมเนื้อหาใน Wiki นั้นได้
5. หากมี `write_wiki` และสิทธิ์ผู้ใช้เพียงพอ ให้อ่านหน้าเพื่อได้ `updatedAt` แล้วแก้ไข; หากเกิด conflict ต้องอ่านใหม่ก่อนตัดสินใจส่งอีกครั้ง
6. ผู้ใช้แก้ permission หรือ scope ในหน้า token แล้วคำขอถัดไปใช้สิทธิ์ใหม่ โดยไม่เปลี่ยน secret

## 7. เกณฑ์ยอมรับและการตรวจสอบย้อนกลับ

| AC | กรณีและผลที่ต้องได้ | Requirements |
|---|---|---|
| AC-01 | Token เดิม/สร้างใหม่โดยไม่เลือก permissions เห็นเฉพาะสี่ read tools และเขียนไม่ได้ | TOK-01, TOK-06, MCP-01–04, CMP-01–02 |
| AC-02 | Token มี `create_wiki` อย่างเดียวและ scope ว่าง สร้าง Wiki ได้ อ่านได้ แต่สร้างหน้าหรือแก้ไขไม่ได้; token อื่นไม่ได้ scope เพิ่ม | TOK-10, WRT-01–02 |
| AC-03 | จำลองความล้มเหลวของการผูก scope แล้วไม่มี Wiki ที่สร้างค้างอยู่ | WRT-01 |
| AC-04 | `create_page` อย่างเดียวสร้างหน้าพร้อมเนื้อหาได้ แต่แก้หน้าที่สร้างแล้วไม่ได้; `write_wiki` อย่างเดียวแก้หน้าได้แต่สร้างไม่ได้ | TOK-01, WRT-03, WRT-05 |
| AC-05 | Read member เขียนไม่ได้แม้ token เลือกทุก permission; write member แก้หน้าได้แต่เปลี่ยนชื่อ/คำอธิบาย Wiki ไม่ได้; owner/admin ทำได้ตาม scope | SEC-02, WRT-04–05 |
| AC-06 | Wiki/page นอก scope, ของผู้อื่น, archived หรือ ID ผิด ให้ผลไม่เปิดเผยข้อมูล; parent/page ข้าม Wiki ใช้ไม่ได้ | SEC-03–05, WRT-03 |
| AC-07 | แก้ token แล้วคำขอถัดไปใช้ permissions ใหม่; API edit ที่ไม่ส่ง permissions คงค่าเดิม และส่งชุดว่างนำสิทธิ์ออก | TOK-05, TOK-07, MCP-03 |
| AC-08 | เปลี่ยน scope จาก Wiki settings แล้ว permissions ไม่เปลี่ยน; ไม่มีสิทธิ์แก้ token ของผู้อื่นเพิ่ม | TOK-09 |
| AC-09 | ลดสิทธิ์ผู้ใช้หรือ revoke/expire/deactivate แล้ว token หยุดตามกฎเดิม; ให้สมาชิกกลับคืนแล้ว scope เดิมกลับมีผล | SEC-01–02 |
| AC-10 | อ่านแล้วมีผู้อื่นแก้ก่อน ส่ง `updatedAt` เก่าต้องได้ conflict และข้อมูลล่าสุดไม่ถูกทับ | WRT-06 |
| AC-11 | เขียนไทย/Mermaid แล้วอ่านกลับได้ ค้นพบเนื้อหาใหม่ มี revision/ผู้แก้ไข และใช้ validation เดิม; input ผิดไม่เปลี่ยนข้อมูล; rich no-op คง body รวม toggle label/marks เดิม การแก้ rich ทำผ่าน canonical content และห้าม flatten เงียบ | WRT-07–09, SEC-07 |
| AC-12 | ไม่มี tool หรือ input ที่ลบ/archive/restore/transfer/publish/จัดการสมาชิกได้ แม้ token owner เป็น install admin | WRT-04–05, SEC-07 |
| AC-13 | UI เรียง permissions ก่อน Wiki และสร้าง/แก้ไข/แสดงสิทธิ์ได้ตรงกัน ทั้งตารางเจ้าของและ admin | TOK-02–04, TOK-08 |
| AC-14 | ชื่อและคำอธิบาย Wiki ที่ส่งมาคู่กันสำเร็จพร้อมกัน หรือคงค่าเดิมทั้งคู่เมื่อ validation/write ล้มเหลว | WRT-04 |
| AC-15 | Bearer/session/public-link/GET/DELETE/rate-limit ยังเป็นไปตามพฤติกรรมเดิม; คู่มืออธิบาย tools และสิทธิ์ใหม่ตรงกัน | MCP-05, SEC-06, CMP-03 |

ทดสอบ pure rules สำหรับ permission parsing และการตัดสินสิทธิ์, database สำหรับ migration/transaction, API/MCP integration สำหรับ authorization และผลข้อมูลจริง และ browser check สำหรับหน้าตั้งค่า token ไม่ใช้เพียงการซ่อนปุ่มเป็นหลักฐานความปลอดภัย

## 8. นอกขอบเขต

ไม่มีการลบ, archive, restore, เปลี่ยนเจ้าของ, จัดการสมาชิก, publish/unpublish, ย้าย/เรียงหน้า, upload ไฟล์, restore revision, permission แยกต่อ Wiki หรือ OAuth ผ่าน MCP ไม่เปลี่ยนความสามารถของผู้ใช้ในหน้า Wiki เดิม

## 9. ข้อกำหนดที่สืบทอดและการส่งมอบ

คง Next.js/PostgreSQL/Drizzle/TypeScript และ MCP SDK เดิม ใช้ชื่อฐานข้อมูลตาม prefix ของโครงการและไม่เพิ่ม triggers การออกแบบ UI ยึด `DESIGN.md` และมาตรฐาน React ของโครงการ

ส่งมอบ migration/schema, token API/UI, MCP tools, tests, คู่มือ และผลการตรวจสอบตาม AC โดยแผนพัฒนาต้องระบุลำดับงานและไฟล์ที่เปลี่ยน เอกสารนี้ไม่ถือว่าผ่าน AC จนกว่าจะมีผลการตรวจจริง
