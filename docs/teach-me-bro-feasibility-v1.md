---
type: research
status: exploration
---

# Nghiên cứu khả thi: "teach_me_bro" — dạy Summarizerrrr bằng thao tác thật

> Tài liệu **nghiên cứu/khả thi** (không phải plan thực thi theo pha). Ghi lại phân tích
> về ý tưởng: thu lại thao tác của người dùng trên trình duyệt → xác nhận + hỏi vài câu về
> mục đích → tổng quát hoá thành một skill chứa các thao tác JS tương tác DOM → lưu thành
> skill tái sử dụng.
>
> Đọc cùng: `agent-capability-feasibility-v1.md` (3 cấp agent: A / B-lite / B đầy đủ) —
> tài liệu này áp trực tiếp khung 3 cấp đó vào một tính năng cụ thể.
>
> Nguồn đối chiếu: khảo sát code hiện tại (`skillService.js`, `background.js`,
> `contentService.js`, `wxtStorageService.js`), memory `chat-harness-direction`.
>
> Ngày: 2026-07-17 · Trạng thái: thảo luận, chưa quyết định thực thi.

---

## 1. Câu hỏi gốc

> "Tôi muốn làm tính năng teach_me_bro: nó thu lại thao tác của mình trên browser, xác
> nhận xong thì hỏi vài câu (mục đích làm gì sơ sơ), rồi biến nó thành một skill có các
> thao tác JavaScript tương tác DOM viết sẵn, save thành skill — có khả thi không?"

---

## 2. Kết luận điều hành (TL;DR)

1. **Khả thi** — và toàn bộ nằm gọn trong **Cấp B-lite** (JS thuần qua `chrome.scripting`,
   không cần `debugger`, cross-browser kể cả Firefox).
2. Nhưng đây **không phải một tính năng nhỏ đứng độc lập**. Bản chất của nó là:
   **Cấp B-lite (tool loop + action tools) + một lớp recorder + một flow tổng quát hoá
   bằng LLM.** Recording là 20% dễ; **engine replay đáng tin mới là 80% khó** — và 80% đó
   *trùng* với công sức xây B-lite agent nói chung.
3. Nhìn ngược lại thì rất đáng giá: nếu đằng nào cũng đi B-lite, teach_me_bro là **lớp giá
   trị tự nhiên nhất phía trên nó** — demonstration của người dùng giải đúng điểm yếu
   "agent không biết site lạ, phải mò" (rẻ token hơn, tin cậy hơn exploration).
4. Quyết định thiết kế quan trọng nhất: **skill sinh ra nên là "tri thức cho agent"
   (instruction + selector hints), KHÔNG phải macro JSON cứng.** Macro cứng kiểu Selenium
   IDE giòn khét tiếng — site đổi DOM là gãy; còn instruction cho agent thì model tự thích
   nghi được khi selector chết. Cách này còn tái dùng được nguyên schema skill hiện có
   (vốn là thuần text).
5. Prior art xác nhận pattern "record → generalize → replay" là đúng hướng: Chrome DevTools
   Recorder, Playwright codegen, teach mode của Claude computer-use.

---

## 3. Bốn khâu của tính năng — và độ khó rất không đều

### 3.1. Khâu 1 — Recording (thu thao tác): **dễ**, làm được với quyền hiện có

Inject một recorder content script qua `chrome.scripting` (quyền `scripting` đã có trong
manifest), nghe sự kiện ở **capture phase** (`click`, `input`, `change`, `keydown`,
submit, navigation). Mỗi bước ghi:

- Loại sự kiện + timestamp + URL.
- **Nhiều mỏ neo** của phần tử đích, không chỉ một CSS path: text hiển thị, `aria-label`,
  `role`, `id`, `data-*`, tag, vị trí tương đối. CSS path đơn lẻ rất giòn — nhiều mỏ neo
  là điều kiện để khâu replay (3.4) tìm lại được phần tử.
- Giá trị nhập (với redaction — xem dưới).

**Caveat kỹ thuật (đều giải được, nhưng phải làm từ đầu):**

1. **MV3 service worker chết giữa chừng** → trạng thái "đang recording" + các bước đã thu
   phải nằm ở `storage.session`, không giữ trong biến của background.
2. **Điều hướng qua trang mới** → recorder phải được re-inject sau mỗi navigation
   (`webNavigation` hoặc registered content script động — `registerContentScripts` đã có
   sẵn trong `background.js`).
3. **Redaction ngay lúc ghi, không phải lúc lưu:** field `type=password`, autocomplete
   `cc-*`/`one-time-code`… không bao giờ được ghi giá trị. Đây là ranh giới an toàn cứng
   (khớp mục 9.4 của doc v1).

### 3.2. Khâu 2 — Xác nhận + hỏi mục đích: **dễ, và là phần "ngon" nhất**

Sau khi dừng ghi, đưa chuỗi bước thô cho model → model **tự sinh câu hỏi** dựa trên thao
tác ("mục đích của chuỗi này là gì?", "'hanoi weather' bạn gõ là giá trị cố định hay tham
số mỗi lần chạy sẽ khác?", "bước mở tab X có cần thiết không?"). Người dùng trả lời hoặc
nhập gợi ý tự do. Từ đó model **tổng quát hoá**:

- Giá trị nhập nào trở thành tham số `{param}` của skill.
- Bước nào cốt lõi, bước nào tình cờ (scroll vu vơ, click nhầm).
- Đặt tên + mô tả skill.

Đây là **generation một phát** (một-hai lượt hỏi đáp), không cần agent loop — hoàn toàn
trong khả năng của chat harness hiện tại.

### 3.3. Khâu 3 — Lưu thành skill: **có đường sẵn, nhưng có một vênh khái niệm**

Khảo sát code: skill hiện tại là **thuần instruction text**.

- Schema (`src/lib/chat/skills/skillService.js`): `{ id, name, instruction, pinned,
  version, sourceMode }` — không có chỗ cho "bước thực thi".
- Lưu ở `chatUserSkills` trong WXT `local:settings`; đường tạo/sửa skill người dùng
  (`createUserSkill`, `saveSkill`, `validateSkillDraft`) **đã chạy sẵn**, có UI ở
  `SkillsPage.svelte`.
- Khi invoke, skill chỉ đóng góp một block instruction vào system prompt
  (`formatSkillInvocation` trong `contextPipeline/sourceFormatter.js`) — không tool,
  không bước cấu trúc.

Hai hướng giải quyết vênh này:

| | (a) Macro JSON cứng + executor tuần tự | (b) Skill = tri thức cho agent |
|---|---|---|
| Dạng lưu | `[{action:'click', selector:...}, ...]` | Instruction markdown + selector hints: *"1. Bấm nút 'Đăng bài' (thường `button[aria-label=Post]`). 2. Điền `{content}` vào ô soạn thảo…"* |
| Khi selector chết | Gãy, dừng | Agent tìm lại phần tử qua accessibility tree |
| Cần gì để chạy | Executor riêng, kiểu skill mới | Agent loop + action tools B-lite (đằng nào cũng cần cho B-lite) |
| Khớp schema hiện có | Không — cần artifact type mới | **Có — vẫn là text**, cùng lắm thêm `type: 'automation'` |
| Prior art | Selenium IDE (giòn khét tiếng) | Triết lý skill của chat harness (memory `chat-harness-direction`) |

→ **Khuyến nghị mạnh: hướng (b).** Bản ghi thao tác là *tài liệu hướng dẫn có toạ độ*,
agent là người thực thi có khả năng thích nghi. Hướng (a) chỉ đáng cân nhắc về sau như
"fast path" tối ưu (thử selector ghi sẵn trước, fail thì rơi về agent).

### 3.4. Khâu 4 — Replay: **khó thật — và chính là Cấp B-lite**

Đây là nơi toàn bộ mục 8/9 của doc v1 áp nguyên:

- **`isTrusted:false`** — site nhạy cảm (đăng nhập, thanh toán, anti-bot) bỏ qua synthetic
  event. Trần cứng của B-lite; chấp nhận "chạy trên site hiền".
- **Gotcha React native setter** — quyết định "điền form được hay không".
- **Chờ đợi**: SPA re-render, network, element xuất hiện muộn → cần `waitFor` primitives,
  không chỉ bắn event mù.
- **Selector rot** — site cập nhật DOM theo thời gian; đây là lý do tồn tại của thiết kế
  "nhiều mỏ neo" (3.1) + agent fallback (3.3b).
- **Approval UX cho hành động ghi từ ngày đầu** (submit, mua hàng…) — mục 9.4 doc v1:
  JS thuần vẫn thao tác ghi được, "không có debugger" không có nghĩa là an toàn.

---

## 4. Tài sản đã có sẵn trong code (khảo sát 2026-07-17)

| Tài sản | Trạng thái |
|---|---|
| `injectScript` / `executeFunction` — wrapper `scripting.executeScript` tổng quát (`src/entrypoints/background.js:149-171`) | ✅ Có sẵn, **hiện không có caller nào** — primitive thực thi JS trên trang đang "ngủ" |
| `public/accessibility-tree.js` + `semantic-extractor.js` | ✅ Nền perception đã có (hiện chỉ dùng đọc) |
| `registerContentScripts` / `unregisterContentScripts` động (`background.js`) | ✅ Dùng được cho việc re-inject recorder |
| `skillService` + `chatUserSkills` + UI tạo/sửa skill | ✅ Đường lưu skill người dùng đã chạy |
| Provider abstraction + streaming + budget context | ✅ (như doc v1 mục 3) |
| Recorder (capture event + mỏ neo phần tử) | ❌ Chưa có — viết mới |
| Bộ action tool B-lite (`find_element`, `click`, `fill`, `waitFor`…) | ❌ Chưa có |
| Tool loop trong `runGeneration` | ❌ Chưa có (doc v1 mục 4.1 — AI SDK cho gần miễn phí) |
| Approval UX cho hành động ghi | ❌ Chưa có |
| Kiểu skill "automation" (flag/field phân biệt) | ❌ Chưa có (nhưng nhỏ nếu đi hướng 3.3b) |

---

## 5. Framing chiến lược

teach_me_bro **tiền giả định** hai mảng của doc v1: tool loop (mục 4.1) và action tools
B-lite (mục 5.2). Nó không phải lối tắt né B-lite — nó là **lý do tốt nhất để đi B-lite**:

- Agent B-lite "trần" phải tự mò site lạ → nhiều bước thăm dò, tốn token, dễ sai.
- Với demonstration, người dùng đã vẽ sẵn bản đồ: agent chỉ cần *làm theo có thích nghi*.
  Ít bước hơn, đáng tin hơn, và người dùng hiểu chính xác skill làm gì (vì họ vừa tự tay
  làm mẫu).
- Đây cũng là mảnh khớp với định vị "trợ lý cá nhân hoá" — skill do chính người dùng dạy,
  chạy trên site *của họ*, là dữ liệu riêng không ai sao chép được (cùng logic với
  `search_archive` ở doc v1 mục 6).

**Thứ tự xây khuyến nghị** (mỗi bước tự đứng được, không phải canh bạc một cục):

```
1. Tool loop trong runGeneration        (nhỏ — AI SDK có sẵn)
2. Action tools B-lite + approval UX     (lõi — dùng được độc lập, chưa cần recorder)
3. Recorder + redaction                  (độc lập, chỉ cần scripting)
4. Flow Q&A tổng quát hoá + sinh skill   (ghép 2+3, ra teach_me_bro)
```

Cross-browser toàn tuyến, kể cả Firefox — không đụng `debugger`, không đụng store review
đáng sợ (doc v1 mục 9.3).

---

## 6. Câu hỏi mở cần chốt trước khi viết plan thực thi

1. **Dạng lưu bước**: thuần instruction text (3.3b) ngay từ đầu, hay text + block
   structured steps đính kèm làm "fast path"? (Khuyến nghị: text-only ở v1, đơn giản nhất.)
2. **Phạm vi site**: chấp nhận trần "site hiền" của B-lite, hay có site mục tiêu nào của
   người dùng đã biết là chống synthetic event?
3. **Replay bán tự động ở v1?** — người dùng bấm approve từng bước ghi (an toàn nhất, UX
   chậm hơn) vs. approve một lần cho cả chuỗi trừ hành động ghi. Ngưỡng approval đặt đâu?
4. **Recording UX**: nút start/stop ở đâu (side panel? FAB?), có hiển thị live danh sách
   bước đang thu không?

---

## 7. Tham chiếu

- `docs/agent-capability-feasibility-v1.md` — khung 3 cấp agent; mục 5.2 (B-lite), mục 8
  (ranh giới JS thuần vs CDP), mục 9.4 (an toàn ghi).
- `src/lib/chat/skills/skillService.js` — schema skill, `createUserSkill`.
- `src/entrypoints/background.js:149-171` — `injectScript`/`executeFunction` (đang ngủ).
- `src/services/contentService.js` — inject accessibility-tree/semantic-extractor hiện tại.
- Memory `chat-harness-direction` — triết lý skill = instruction, không phải code.
- Prior art: Chrome DevTools Recorder, Playwright codegen, Claude computer-use teach mode.
