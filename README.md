# Field Book (T-Timeline)

ระบบติดตามโปรเจกต์ที่บันทึก **แผน** และ **สิ่งที่เกิดขึ้นจริง** แยกกัน แล้ววางเทียบกันบน timeline เดียว

Next.js · PostgreSQL · Drizzle · TypeScript — เอกสารออกแบบทั้งหมดอยู่ใน [`CLAUDE.md`](CLAUDE.md), [`PRODUCT.md`](PRODUCT.md), [`DESIGN.md`](DESIGN.md) และ [`docs/`](docs/)

```bash
cp .env.example .env   # แล้วเติมค่าตามหัวข้อด้านล่าง
npm install
npm run db:build       # สร้าง schema ครั้งแรก
npm run db:migrate     # ใส่ migration ที่ยังไม่ได้รัน
npm run dev            # http://localhost:3010
```

---

## Environment variables

ค่าทั้งหมดอยู่ในไฟล์ `.env` ที่รากโปรเจกต์ ใช้ [`.env.example`](.env.example) เป็นแม่แบบ **ห้าม commit `.env`** — `.gitignore` และ `.dockerignore` กันไว้แล้ว ไฟล์นี้จึงไม่หลุดเข้า repo หรือ Docker image

ตัวแปรแบ่งเป็นกลุ่มตาม **ใครเป็นคนอ่าน** แอปเองใช้แค่กลุ่มแรก ที่เหลือเป็นของสคริปต์ เทสต์ และการ deploy

### 1. แอป (จำเป็นทั้ง dev และ production)

| ตัวแปร | จำเป็น | ค่าตัวอย่าง / ค่าเริ่มต้น | ใช้ทำอะไร |
|---|---|---|---|
| `DATABASE_URL` | ✔ | `postgres://fieldbook:รหัส@localhost:5432/fieldbook` | connection string ที่แอปใช้ต่อ PostgreSQL (`src/db/client.ts`) |
| `AUTH_SECRET` | ✔ | สร้างด้วย `openssl rand -base64 32` | กุญแจเซ็น session ของ Auth.js |
| `AUTH_TRUST_HOST` | ✔ เมื่ออยู่หลัง reverse proxy | `true` | ให้ Auth.js เชื่อ host ที่ proxy ส่งต่อมา ถ้าไม่ตั้ง การ sign-in จะล้มเหลว |
| `DOC_ASSET_DIR` | — | `data/doc-assets` | โฟลเดอร์เก็บไฟล์รูปของ Docs ในโปรเจกต์ |
| `WIKI_ASSET_DIR` | — | `data/wiki-assets` | โฟลเดอร์เก็บไฟล์รูปของ Wiki |
| `AUTH_URL` | — | ไม่ต้องตั้ง | URL ของแอป ใช้เมื่อ Auth.js เดา origin ไม่ถูก (สคริปต์เทสต์ `test-user-delete.mjs` ตั้งเอง) |

**`AUTH_SECRET` ต้องคงเดิมตลอด** เปลี่ยนเมื่อไหร่ session ทุกอันใช้ไม่ได้ทันที ทุกคนถูก sign out โดยไม่มีคำเตือน (`docs/spec/08-operations.md` §3)

**`NODE_ENV`** ไม่ต้องตั้งเอง Next.js ตั้งให้ เมื่อเป็น `production` cookie ของ session จะเป็นแบบ `__Secure-` ซึ่งต้องเปิดผ่าน **HTTPS** เท่านั้น

#### โฟลเดอร์ไฟล์ (`DOC_ASSET_DIR`, `WIKI_ASSET_DIR`)

ฐานข้อมูลเก็บแค่ลิงก์ (`/api/doc-assets/<id>`, `/api/wiki-assets/<id>`) และ id/ชื่อไฟล์ ตัวไฟล์จริงอยู่ในสองโฟลเดอร์นี้ แอปเอาข้อมูลจาก DB มาต่อกับโฟลเดอร์ปัจจุบันเอง

- เว้นว่างได้ตอน dev — ไฟล์จะไปอยู่ใน `data/` ของโปรเจกต์
- ถ้าตั้ง ให้ใช้ **path แบบเต็ม** (ขึ้นต้นด้วย `/`)
- **ห้ามเป็นโฟลเดอร์เดียวกัน** ทั้งสองระบบตั้งชื่อไฟล์แบบเดียวกัน การลบรูปฝั่งหนึ่งอาจไปโดนอีกฝั่ง ไม่ควรวางซ้อนกันด้วย (เช่น `/srv/assets` กับ `/srv/assets/wiki`) วางเป็นโฟลเดอร์คู่กันดีที่สุด แต่จะอยู่คนละที่หรือคนละดิสก์ก็ได้
- **backup สองโฟลเดอร์นี้คู่กับ dump ของฐานข้อมูลทุกครั้ง** กู้แต่ DB รูปทุกรูปจะหาย

### 2. สคริปต์ฐานข้อมูลและเทสต์ e2e (`PG*`)

สคริปต์ `npm run db:*` และเทสต์ e2e คุยกับ PostgreSQL ผ่าน `psql`/`pg` โดยตรง จึงใช้ตัวแปรมาตรฐานของ PostgreSQL ไม่ใช่ `DATABASE_URL` ให้ชี้ฐานข้อมูลเดียวกัน

| ตัวแปร | ค่าตัวอย่าง |
|---|---|
| `PGHOST` | `localhost` |
| `PGPORT` | `5432` (หรือ `5433` ถ้าใช้ `docker-compose.yml`) |
| `PGUSER` | `fieldbook` |
| `PGPASSWORD` | รหัสผ่านของ user นั้น |
| `PGDATABASE` | `fieldbook` |

ถ้าไม่มี PostgreSQL ในเครื่อง `docker compose up -d` จะเปิด PostgreSQL 18 ที่ port **5433** ใช้ค่า user/database `fieldbook` และรหัสผ่านตามที่เขียนใน `docker-compose.yml` — ตั้ง `DATABASE_URL` และ `PG*` ให้ตรงกับค่านั้น

### 3. ClickUp (ใช้ครั้งเดียวตอนย้ายข้อมูล)

ใช้แค่ `npm run clickup:extract` ไม่จำเป็นสำหรับการรันแอป และไม่ต้องมีบน server

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `CLICKUP_TOKEN` | API token ของ ClickUp |
| `CLICKUP_TEAM_ID` | id ของ workspace (UI เรียกว่า Workspace แต่ API v2 เรียกว่า team) |

### 4. เทสต์ (ตั้งตอนรันเทสต์เท่านั้น)

| ตัวแปร | ค่าเริ่มต้น | ใช้ทำอะไร |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3010` | URL ของแอปที่เทสต์ e2e ยิงเข้า (ต้องเปิด `npm run dev` ไว้) |
| `E2E_INSTALL_ADMIN_PASSWORD` | — | รหัสผ่านของ `admin@cit.com` ถ้าบัญชีนี้มีอยู่แล้ว ถ้าไม่ตั้ง เทสต์ส่วนที่ต้องใช้ install admin (wiki, MCP, house style) จะถูกข้าม |
| `UPDATE_CALENDAR_LOOK` | — | ตั้งเป็น `1` เพื่อบันทึกหน้าตา Calendar ใหม่เป็น fixture แทนการเทียบ (`npm run test:calendar-look`) ใช้เมื่อตั้งใจเปลี่ยนหน้าตาเท่านั้น |
| `E2E_ISOLATED_PEOPLE` | — | เปิดเทสต์การลบผู้ใช้ ซึ่งต้องรันบนฐานข้อมูลแยก — `scripts/test-user-delete.mjs` ตั้งค่านี้ให้เอง |
| `PEOPLE_TEST_APP_DIR` | — | โฟลเดอร์แอปสำหรับเทสต์เดียวกันนั้น สคริปต์ตั้งเอง ไม่ต้องตั้งมือ |

### 5. Production

Deploy ผ่าน GitHub Actions (`.github/workflows/release.yml`) ซึ่ง SSH เข้า server แล้วรัน container `fieldbook-app` ค่าแบ่งเป็นสองที่

**ก. ไฟล์ `.env` บน server** อยู่ใน `DEPLOY_PATH` ถ้าไม่มีไฟล์นี้ deploy จะหยุด ต้องมีอย่างน้อย

```bash
DATABASE_URL=postgres://...
AUTH_SECRET=...        # ค่าเดิมตลอด อย่าสุ่มใหม่ตอน deploy
AUTH_TRUST_HOST=true
```

ไม่ต้องใส่ `DOC_ASSET_DIR` / `WIKI_ASSET_DIR` ในไฟล์นี้ — workflow ส่ง `/app/data/doc-assets` และ `/app/data/wiki-assets` (path ภายใน container) ให้เอง

**ข. GitHub secrets** ตั้งที่ **Settings → Environments → production** (หรือเป็น repository secret)

| Secret | ใช้ทำอะไร |
|---|---|
| `DEPLOY_SSH_USER`, `DEPLOY_SSH_KEY` | user และ private key สำหรับ SSH เข้า server |
| `DEPLOY_PATH` | โฟลเดอร์บน server ที่มีไฟล์ `.env` ข้างต้น |
| `DEPLOY_PORT` | port บน server ที่เปิดให้แอป (ตัวเลขเท่านั้น) map เข้า port 3000 ของ container |
| `ASSET_DIR` | path เต็มบน server สำหรับไฟล์รูปของ Docs → mount เป็น `/app/data/doc-assets` |
| `WIKI_ASSET_DIR` | path เต็มบน server สำหรับไฟล์รูปของ Wiki → mount เป็น `/app/data/wiki-assets` |
| `GHCR_USERNAME`, `GHCR_PULL_TOKEN` | สิทธิ์ดึง image จาก GitHub Container Registry |

ตัวอย่างตั้งจาก command line

```bash
gh secret set WIKI_ASSET_DIR --env production --body "/srv/fieldbook/wiki-assets"
```

ไม่ต้องสร้างโฟลเดอร์หรือ `chown` เอง — workflow สร้างและให้สิทธิ์ user ของแอป (UID/GID 1001) ทุกครั้งที่ deploy ถ้าขาด `ASSET_DIR` หรือ `WIKI_ASSET_DIR` deploy จะหยุดพร้อมข้อความ `Missing GitHub secret: ...`

#### เปลี่ยน `ASSET_DIR` / `WIKI_ASSET_DIR` ภายหลัง

แก้ secret แล้ว deploy ตามปกติ workflow เห็นว่า path ที่ container เดิม mount ไม่ตรงกับค่าใหม่ จะหยุด container, คัดลอกไฟล์เดิมไปพักที่ `DEPLOY_PATH/*-assets-backup.XXXXXX` แล้วคัดลอกเข้าโฟลเดอร์ใหม่ด้วย `cp -an` (ไม่ทับไฟล์ที่มีอยู่) ฐานข้อมูลไม่ต้องแก้

- เป็นการ **คัดลอก ไม่ใช่ย้าย** — โฟลเดอร์เดิมและโฟลเดอร์ backup ยังอยู่ ลบเองหลังตรวจว่ารูปเปิดได้ครบ
- อัปเดตสคริปต์ backup ให้ชี้ path ใหม่
- ตรวจ mount หลัง deploy:

  ```bash
  docker inspect --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' fieldbook-app
  ```

#### `APP_PORT`

ใช้กับ `docker-compose.production.yml` เท่านั้น (ค่าเริ่มต้น `3000`) การ deploy ปัจจุบันใช้ `DEPLOY_PORT` ของ workflow แทน
