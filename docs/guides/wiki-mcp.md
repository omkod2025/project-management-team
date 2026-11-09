# เชื่อม AI เข้ากับ Wiki ผ่าน MCP

คู่มือนี้อธิบายวิธีให้ผู้ช่วย AI เช่น Claude Code, Claude Desktop, VS Code หรือ Cursor อ่าน Wiki ใน T-Timeline ได้ ถ้าเปิดคู่มือนี้ในแอป ที่อยู่เซิร์ฟเวอร์ในทุกตัวอย่างคือที่อยู่จริงของระบบนี้แล้ว ถ้าอ่านจากไฟล์ใน repo ให้แทนส่วน origin ในตัวอย่างด้วยที่อยู่ของเซิร์ฟเวอร์ เช่น `https://pm.example.com` ส่วน `<secret>` คือ token ที่คุณสร้างเองในขั้นตอนที่ 2

## 1. ระบบนี้คืออะไร

- AI อ่าน Wiki ที่คุณได้รับสิทธิ์ ผ่าน **MCP เท่านั้น** (endpoint `POST <origin>/api/mcp` แบบ Streamable HTTP)
- ทุก token มีเครื่องมืออ่านพื้นฐาน ส่วนการสร้างและแก้ไขต้องเปิดสิทธิ์เพิ่ม ไม่มีการลบหรือ archive ผ่าน MCP
- token หนึ่งอันอ่านได้ **ไม่เกินสิ่งที่เจ้าของ token มองเห็นอยู่ในตอนนี้** ระบบตรวจใหม่ทุกครั้งที่มีการเรียก ถ้าคุณเสียสิทธิ์ใน Wiki ใด token ก็อ่าน Wiki นั้นไม่ได้ทันที
- token อ่านได้เฉพาะ Wiki ที่คุณติ๊กเลือกไว้ตอนสร้างหรือแก้ไข token

## 2. สร้าง token

1. เปิด **Wiki → Tokens / MCP**
2. ในส่วน **New token** ตั้งชื่อ (Label) ให้จำได้ว่าใช้กับเครื่องหรือโปรแกรมไหน เช่น `Work laptop – Claude Code`
3. เลือกสิทธิ์ใน **Optional permissions** ก่อน: Create wiki, Create page หรือ Write wiki แล้วเลือก Wiki ใน **Wikis this token can access**; ไม่เลือกสิทธิ์เพิ่มคืออ่านอย่างเดียว
4. (ไม่บังคับ) เลือกวันหมดอายุใน **Expires** token จะใช้ได้ถึงสิ้นวันนั้นตามเวลากรุงเทพฯ
5. กด **Create token** แล้วกด **Copy** เพื่อคัดลอก token ที่ขึ้นต้นด้วย `pmw_`

> **token จะแสดงเต็มเพียงครั้งเดียว** ระบบไม่ได้เก็บตัว token ไว้ จึงแสดงซ้ำไม่ได้ ถ้าทำหาย ให้ revoke อันเดิมแล้วสร้างใหม่

แต่ละบัญชีมี token ที่ยังใช้งานได้พร้อมกันไม่เกิน 20 อัน

## 3. Claude Code

รันคำสั่งนี้ใน terminal โดยแทน `<secret>` ด้วย token ของคุณ

```bash
claude mcp add --transport http t-timeline-wiki <origin>/api/mcp --header "Authorization: Bearer <secret>"
```

ตรวจว่าเชื่อมต่อได้

```bash
claude mcp list
```

บรรทัด `t-timeline-wiki` ควรขึ้นว่าเชื่อมต่อแล้ว (Connected) ใน Claude Code พิมพ์ `/mcp` เพื่อดูสถานะและรายการเครื่องมือได้

คำสั่งข้างต้นเพิ่มเซิร์ฟเวอร์ให้เฉพาะโปรเจกต์ที่เปิดอยู่ ถ้าต้องการใช้ในทุกโปรเจกต์ ให้เพิ่ม `--scope user`

```bash
claude mcp add --transport http --scope user t-timeline-wiki <origin>/api/mcp --header "Authorization: Bearer <secret>"
```

ถ้าต้องการลบออก ใช้ `claude mcp remove t-timeline-wiki`

## 4. Claude Desktop

Claude Desktop เชื่อมผ่านสะพาน `mcp-remote` ซึ่งรันด้วย `npx` จึงต้องติดตั้ง Node.js ไว้ในเครื่องก่อน

คำสั่งที่ Claude Desktop จะเรียกให้คือ

```bash
npx -y mcp-remote <origin>/api/mcp --header "Authorization:${WIKI_TOKEN}"
```

เปิดไฟล์ `claude_desktop_config.json` (ใน Claude Desktop ไปที่ **Settings → Developer → Edit Config** ได้) แล้วเพิ่ม `t-timeline-wiki` ใน `mcpServers` ตามตัวอย่าง แทน `<secret>` ด้วย token ของคุณ

```json
{
  "mcpServers": {
    "t-timeline-wiki": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "<origin>/api/mcp",
        "--header",
        "Authorization:${WIKI_TOKEN}"
      ],
      "env": {
        "WIKI_TOKEN": "Bearer <secret>"
      }
    }
  }
}
```

ใน `args` ให้เขียน `Authorization:${WIKI_TOKEN}` ติดกันโดยไม่มีช่องว่าง แล้วใส่คำว่า `Bearer ` ไว้ในค่า `WIKI_TOKEN` แทน เพราะช่องว่างใน `args` ทำให้บางระบบ (โดยเฉพาะ Windows) แยก header ผิด

ตำแหน่งของไฟล์

| ระบบ | ที่อยู่ไฟล์ |
|---|---|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |

บันทึกไฟล์ แล้ว **ปิด Claude Desktop ให้สนิทและเปิดใหม่** (บน Windows ให้ออกจากไอคอนที่ถาด system tray ด้วย) จากนั้นเครื่องมือของ Wiki จะปรากฏในเมนูเครื่องมือของช่องแชต

**claude.ai บนเว็บ (Connectors) ยังใช้ไม่ได้ในเวอร์ชันนี้** เพราะ Connectors ต้องใช้การยืนยันตัวตนแบบ OAuth ซึ่งเซิร์ฟเวอร์นี้ยังไม่รองรับ เซิร์ฟเวอร์นี้รับเฉพาะ Bearer token

## 5. VS Code, Cursor และโปรแกรมอื่นที่รองรับ Streamable HTTP

โปรแกรมเหล่านี้เชื่อมต่อตรงได้ โดยไม่ต้องผ่าน `mcp-remote`

**VS Code** สร้างไฟล์ `.vscode/mcp.json` ในโปรเจกต์ (คีย์บนสุดคือ `servers`)

```json
{
  "servers": {
    "t-timeline-wiki": {
      "type": "http",
      "url": "<origin>/api/mcp",
      "headers": {
        "Authorization": "Bearer <secret>"
      }
    }
  }
}
```

**Cursor** แก้ไฟล์ `~/.cursor/mcp.json` (ใช้กับทุกโปรเจกต์) หรือ `.cursor/mcp.json` ในโปรเจกต์ (คีย์บนสุดคือ `mcpServers`)

```json
{
  "mcpServers": {
    "t-timeline-wiki": {
      "type": "http",
      "url": "<origin>/api/mcp",
      "headers": {
        "Authorization": "Bearer <secret>"
      }
    }
  }
}
```

โปรแกรมอื่นที่รองรับ Streamable HTTP ใช้ค่าเดียวกัน คือ URL `<origin>/api/mcp` และ header `Authorization: Bearer <secret>` ส่วนชื่อคีย์บนสุดของไฟล์ให้ดูจากเอกสารของโปรแกรมนั้น

## 6. เครื่องมืออ่านพื้นฐานทั้ง 4 ตัว

| เครื่องมือ | ข้อมูลที่ส่ง | ได้อะไรกลับมา |
|---|---|---|
| `list_wikis` | ไม่มี | Wiki ที่ token อ่านได้ พร้อม id ชื่อ คำอธิบาย และจำนวนหน้า |
| `list_pages` | `wiki_id` | โครงหน้าของ Wiki นั้นตามลำดับในต้นไม้ (id, slug, ชื่อ, ระดับ 1–3) |
| `read_page` | `page_id` หรือ `wiki_id` คู่กับ `slug` | เนื้อหาหน้าเป็น **Markdown** |
| `search` | `query` และไม่บังคับ `wiki_id`, `limit` (สูงสุด 20) | หน้าที่ตรงกับคำค้น พร้อมข้อความตัวอย่าง |

`read_page` ส่งเนื้อหากลับเป็น Markdown แผนภาพจะมาเป็น **ซอร์สของ Mermaid** ในบล็อก `` ```mermaid `` ไม่ใช่รูปภาพ AI จึงอ่านโครงสร้างของแผนภาพได้ คำค้นใน `search` ทุกคำต้องตรง และค้นคำไทยกลางคำได้

ไม่ต้องเรียกเครื่องมือเอง พิมพ์ถามเป็นภาษาธรรมดาแล้ว AI จะเลือกเครื่องมือให้ เช่น

- "ค้นใน wiki ว่าตั้งค่า NVR ยังไง"
- "มี wiki อะไรให้อ่านบ้าง"
- "สรุปหน้า การติดตั้งกล้อง เป็นข้อ ๆ"
- "อธิบายแผนภาพในหน้า ขั้นตอนอนุมัติ ว่าแต่ละขั้นทำอะไร"

### สิทธิ์เพิ่มและเครื่องมือเขียน

สิทธิ์เป็นชุดเดียวต่อ token ใช้กับทุก Wiki ที่เลือก และต้องไม่เกินสิทธิ์ปัจจุบันของเจ้าของ token

| สิทธิ์ | เครื่องมือ | ข้อมูลที่ส่ง |
|---|---|---|
| `create_wiki` / Create wiki | `create_wiki` | `title`, ไม่บังคับ `description` |
| `create_page` / Create page | `create_page` | `wiki_id`, `title`, `markdown`, ไม่บังคับ `parent_id`, `slug` |
| `write_wiki` / Write wiki | `update_wiki` | `wiki_id`, `title` หรือ `description` อย่างน้อยหนึ่งรายการ |
| `write_wiki` / Write wiki | `update_page` | `page_id`, `updatedAt`, เลือก `markdown` หรือ `rich_content` หนึ่งรายการ, ไม่บังคับ `title` |

- Create wiki ใช้ได้แม้ยังไม่เลือก Wiki ใหม่จะเป็นของเจ้าของ token และเพิ่มเข้า scope ของ token ที่สร้างเท่านั้น ถ้าผูก scope ไม่สำเร็จจะไม่เหลือ Wiki ที่สร้างค้าง
- Create page รวมเนื้อหาเริ่มต้น แต่ไม่ให้แก้หน้าภายหลัง ต้องมี Write wiki เพิ่ม การสร้าง Wiki ไม่ให้สิทธิ์สร้างหน้าหรือแก้ไขโดยอัตโนมัติ
- Write wiki แก้หน้าที่มีอยู่ได้เมื่อผู้ใช้เขียน Wiki นั้นได้ ส่วนชื่อและคำอธิบาย Wiki ต้องมีสิทธิ์เจ้าของหรือ install admin; ส่ง `description` เป็นข้อความว่างเพื่อล้างคำอธิบาย
- ก่อนแก้หน้า อ่านด้วย `read_page` แล้วส่ง `updatedAt` ที่ได้กลับไป หากได้ `E_DOC_CONFLICT` ต้องอ่านใหม่และพิจารณาการแก้ไขก่อนส่งซ้ำ ระบบไม่เขียนทับงานผู้อื่นให้
- ถ้าหน้าใช้ rich content ให้อ่านด้วย `include_rich_content: true` แล้วแก้สตริง `rich_content` ที่คืนมา ซึ่งเป็นรูปแบบ `fieldbook-rich-v1:` พร้อม JSON tree ระบบจะตรวจรูปแบบก่อนบันทึก การส่ง Markdown ที่เปลี่ยนไปแทน rich page จะถูกปฏิเสธเพื่อป้องกันหัวข้อ toggle และรูปแบบสูญหาย ส่วนการส่ง Markdown เดิมกลับไปจะคง rich body เดิม; หน้า Markdown ปกติใช้ `markdown` ตามเดิม
- เครื่องมือเขียนจะปรากฏเมื่อ token มีสิทธิ์นั้น Client บางตัวอาจต้องโหลดรายการ tools ใหม่ แต่ server ตรวจสิทธิ์ใหม่ทุกคำขออยู่เสมอ
- การเรียก create ซ้ำอาจสร้างรายการซ้ำ ไม่ควร retry อัตโนมัติเมื่อยังไม่ทราบผลครั้งก่อน
- Token เดิมยังอ่านอย่างเดียวจนกว่าเจ้าของจะเพิ่มสิทธิ์ใน Edit โดยใช้ secret เดิมได้ การเลือก token จาก Wiki settings เปลี่ยนเฉพาะ scope
- ไม่มีเครื่องมือลบ, archive, restore, เปลี่ยนเจ้าของ, สมาชิก, ลิงก์สาธารณะ, ย้ายหน้า หรือ upload ไฟล์

## 7. แก้ปัญหา

| อาการ | สาเหตุและวิธีแก้ |
|---|---|
| `401` | token ผิด ถูก revoke หมดอายุแล้ว หรือบัญชีของคุณถูกปิด ให้สร้าง token ใหม่ |
| `429` | เรียกเกิน 60 ครั้งต่อนาทีต่อ token รอประมาณ 1 นาทีแล้วลองใหม่ |
| `Not found.` | token ไม่ครอบคลุม Wiki นั้น หรือคุณเสียสิทธิ์ใน Wiki นั้นไปแล้ว |
| Wiki ที่ต้องการไม่ขึ้นใน `list_wikis` | ไปที่ **Tokens / MCP** กด **Edit** ที่ token แล้วติ๊ก Wiki นั้น ถ้าไม่มี Wiki นั้นให้ติ๊ก ให้ขอสิทธิ์จากเจ้าของ Wiki |
| เชื่อมต่อไม่ได้เลย | ตรวจว่า URL ลงท้ายด้วย `/api/mcp` และค่า header ขึ้นต้นด้วย `Bearer ` (มีช่องว่างหนึ่งช่องตามหลัง) |

## 8. ความปลอดภัย

- **อย่า commit token ลง git** ไฟล์ `.vscode/mcp.json` และ `.cursor/mcp.json` ในโปรเจกต์มักถูก commit ไปด้วยโดยไม่ตั้งใจ ให้เพิ่มลง `.gitignore` หรือใช้ไฟล์ระดับผู้ใช้แทน
- ใช้ **token หนึ่งอันต่อหนึ่งเครื่องหรือหนึ่งโปรแกรม** เมื่อเครื่องหายหรือเลิกใช้ จะ revoke ได้เฉพาะอันนั้น
- **revoke token ที่ไม่ใช้แล้ว** ที่ **Tokens / MCP** การ revoke มีผลทันทีและย้อนกลับไม่ได้
- ผู้ดูแลระบบ (admin) เห็นและ revoke token ได้ทุกอัน แต่ไม่เห็นตัว token เต็มของใคร
