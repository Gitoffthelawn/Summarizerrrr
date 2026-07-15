---
type: research
status: exploration
---

# Nghiên cứu khả thi: Đưa năng lực "agent" vào Summarizerrrr

> Tài liệu **nghiên cứu/khả thi** (không phải plan thực thi theo pha). Ghi lại phân tích
> về việc Summarizerrrr có thể tiến hoá thành một extension có năng lực "agent" hay không,
> đi tới đâu, và với chi phí/rủi ro gì.
>
> Nguồn đối chiếu: tài liệu kiến trúc reverse-engineer extension "Claude in Chrome"
> (`EXTENSION_ARCHITECTURE.md`), đọc trực tiếp code hiện tại của Summarizerrrr
> (`aiSdkAdapter.js`, `chatService.js`, `wxt.config.ts`), và định hướng chat harness đã ghi
> trong memory.
>
> Ngày: 2026-07-14 (cập nhật 2026-07-15: thêm **Cấp B-lite** — điều khiển trang bằng JS
> thuần không cần `debugger`; xem mục 5.2 và bảng ranh giới mục 8) ·
> Trạng thái: thảo luận, chưa quyết định thực thi.

---

## 1. Câu hỏi gốc

> "Với cấu trúc extension của tôi, tương lai có triển khai được tính năng agent không?"

Và câu hỏi chiến lược nảy sinh sau đó:

> Nếu "agent" chỉ để tóm tắt/so sánh nội dung thì `@tab` + skill là đủ rồi — vậy agent
> thật sự **dùng vào việc gì**, và nó có xứng đáng không?

---

## 2. Kết luận điều hành (TL;DR)

1. **Có, khả thi** — và Summarizerrrr ở vị trí thuận lợi **hơn hẳn** một bản viết lại từ
   đầu, vì những mảng khó nhất mà tài liệu gốc liệt kê "phải viết mới" thì **đã có sẵn**.
2. Khoảng cách để thành agent chỉ còn **2 mảng**: (a) vòng lặp tool — *dễ*, vì Vercel AI SDK
   cho gần như miễn phí; (b) perception + action trên trang — *tuỳ tham vọng*; **phần lớn
   làm được bằng JS thuần (`chrome.scripting`), không bắt buộc `debugger`/CDP** (xem mục 8).
3. Có **3 cấp độ** (không phải 2) khác nhau về công sức lẫn rủi ro:
   - **Cấp A — agent nhẹ (tool-use, không điều khiển trang).** Mở rộng nhỏ trên chat
     harness. Nhưng **sweet spot hẹp**: phần lớn việc tóm tắt/so sánh đã giải quyết được
     bằng `@tab` + skill. Chỉ 2 loại việc thật sự cần tới nó.
   - **Cấp B-lite — điều khiển trang bằng JS thuần (`chrome.scripting`).** Không cần
     `debugger`, cross-browser (kể cả Firefox), không đụng store-review đáng sợ. Phủ ~70–80%
     tác vụ đời thường. **Tầng giữa bị bỏ sót ở bản nháp đầu.**
   - **Cấp B đầy đủ — CDP qua `debugger`.** Chỉ cần cho phần khó (trusted event, upload
     file, canvas, screenshot đầy đủ). Chrome/Edge-only, quyền đáng sợ. Bước nhảy *năng lực*
     thật (làm việc hộ, không chỉ đọc hộ), canh bạc lớn hơn nhiều.
4. **Ranh giới quyết định** không phải "A hay B", mà là định vị sản phẩm: Summarizerrrr là
   **"trợ lý đọc/hỏi-đáp trên nội dung"** hay **"agent làm việc trên trình duyệt"**?

---

## 3. Điểm xuất phát — bạn đã có sẵn gì

Tài liệu gốc (mục 12.3) dành phần lớn công sức cho những thứ Summarizerrrr **đã hoàn thành**:

| Tài liệu bảo "phải viết mới" | Trạng thái trong Summarizerrrr |
|---|---|
| Provider abstraction layer (12.3.1) | ✅ Đã có — `aiSdkAdapter.js` + Vercel AI SDK chuẩn hoá tool-calling đa provider |
| Agent loop (12.3.3) | 🟡 Một nửa — `runGeneration` là loop **single-shot**; AI SDK cho tool loop gần như miễn phí |
| Quản lý lịch sử, nén context, screenshot→image block | ✅ `buildContextPipeline`, `conversationRepository`, budget token, checkpoint streaming |
| UI cấu hình provider/model (12.3.5) | ✅ Provider registry, profiles, `featureModelResolver` |
| Skill/persona system | ✅ `skillService`, `personaSnapshot`, `skillInvocation` |

Nói cách khác: các milestone M3, M6, M7 của tài liệu gốc (xây provider adapter + streaming +
usage token đa provider) — **bạn xong hết rồi.**

---

## 4. Khoảng cách thật sự — chỉ 2 mảng

### 4.1. Vòng lặp tool (dễ)

Hiện `runGeneration` (`src/services/chat/chatService.js`) gọi `streamRequest` **đúng một
lần** rồi finalize — single-shot. Để thành agent cần vòng:

```
model → tool_use → execute → tool_result → model → ... (lặp tới khi không còn tool_use)
```

Vercel AI SDK bạn đang dùng cho cái này gần như miễn phí: `streamText`/`generateText` với
`tools` + `stopWhen`/`maxSteps`. Việc cần làm:
- Thêm một biến thể `streamRequest` có `tools`.
- Viết một **tool executor** (router `name → hàm`), đặt ở `background.js` vì nó mới có
  `tabs`/`scripting`/(và `debugger` nếu Cấp B).

### 4.2. Perception + Action trên trang (khó, tuỳ tham vọng)

Đây là mảng **chưa có**:
- `contentService` hiện trích **text thuần** để tóm tắt — chưa có "accessibility tree +
  `ref_id`" (mục 6 tài liệu gốc) để model *thao tác* từng phần tử.
- Manifest hiện có `activeTab, scripting, declarativeNetRequest` nhưng **KHÔNG có
  `debugger`**.

**Quan trọng — không phải cứ có action là cần `debugger`.** Cả perception lẫn *phần lớn*
action làm được bằng **JS thuần inject qua `chrome.scripting`** (quyền bạn đã có). Chỉ một
số ít việc khó mới bắt buộc CDP/`debugger`. Ranh giới chính xác ở **mục 8**. Vì vậy mảng
4.2 được chia thành **Cấp B-lite (JS thuần)** và **Cấp B đầy đủ (CDP)** — xem mục 5.

Cấp A không cần mảng 4.2.

---

## 5. Hai cấp độ agent

### 5.1. Cấp A — agent nhẹ (tool-use, không điều khiển trang)

Tools kiểu đọc/tra cứu/tổng hợp: không cần `debugger`, rủi ro thấp, không đụng store
review, chạy được cross-browser (kể cả Firefox). Là mở rộng tự nhiên của chat harness.

**Nhưng: sweet spot hẹp** — xem mục 6.

### 5.2. Cấp B-lite — điều khiển trang bằng JS thuần (`chrome.scripting`)

Đây là **tầng giữa** bị bỏ sót ở bản nháp đầu. Cả perception (accessibility tree + `ref_id`,
vốn đã là JS inject) lẫn phần lớn action đều làm được **không cần `debugger`**:

- `element.click()` cho nút/link thường (đa số handler React/vanilla nghe `click`).
- Điền input/`<textarea>`: set `.value` (qua native setter — xem gotcha React ở mục 8) rồi
  dispatch `input`/`change`.
- `focus()`, `scrollIntoView()`, đọc DOM, gán `data-ref`, điều hướng qua `location.href`.
- Screenshot toàn viewport bằng `chrome.tabs.captureVisibleTab` (không cần `debugger`).

Ngay cả extension Claude gốc cũng **hybrid**: ở chế độ ref-based, nhiều action gọi
`.click()`/`.focus()` qua eval JS, chỉ rớt xuống CDP khi cần (tài liệu gốc mục 7.3).

**Ưu:** không cần `debugger`, **cross-browser kể cả Firefox**, không đụng store-review đáng
sợ, phủ ~70–80% tác vụ "bấm cái này, điền cái kia, đọc cái nọ".
**Nhược:** có trần cứng — synthetic event `isTrusted:false`, không upload file, không native
UI/canvas/screenshot đầy đủ. Ranh giới ở **mục 8**.

### 5.3. Cấp B đầy đủ — agent điều khiển trình duyệt qua CDP (kiểu "Claude in Chrome")

Click/gõ/điều hướng/screenshot qua CDP. Cần thêm: quyền `debugger`, port
`accessibility-tree.js`, lớp CDP, approval UX, phantom cursor. Chỉ nâng lên đây cho **phần
JS thuần không làm nổi** (mục 8). Đây là bước nhảy *năng lực* thật — biến extension từ
**đọc hộ** thành **làm việc hộ** trên mọi site. Ràng buộc thực tế ở mục 9.

**Lộ trình hợp lý:** perception (JS) → Cấp B-lite action (JS) → CDP **chỉ cho phần khó**.
Rẻ và ít rủi ro hơn nhiều so với nhảy thẳng vào `debugger`.

---

## 6. Ranh giới quyết định: `@tab` + skill vs. agent loop

Đây là insight trung tâm. Với ví dụ "tóm tắt/so sánh 2 tab", **`@tab` + skill là đủ và
đúng công cụ** — nhét agent loop vào đó chỉ là over-engineering.

| | `@tab` + skill | Agent (tool loop) |
|---|---|---|
| Ai quyết định context | **Người dùng**, chọn trước | **Model**, khám phá lúc chạy |
| Tính chất context | Tĩnh, biết trước | Động, phát hiện dần |
| Số bước | 1 phát | Lặp nhiều bước |
| Khi nào đúng | Biết trước cần gì | **Không** biết trước cần gì |

→ **Cấp A chỉ có giá trị ở những việc rơi vào vế "không biết trước cần gì".** Cụ thể:

1. **Tìm trong chính archive/history của người dùng** — *"Trong mấy trăm bản tóm tắt đã lưu,
   cái nào nói về X?"* Không thể `@` 300 mục. Cần tool `search_archive` query IndexedDB.
   → **Mảnh giá trị lớn nhất & độc nhất của Summarizerrrr** (dữ liệu riêng của người dùng,
   không ai `@` thủ công được).
2. **Đi theo link / đào sâu** — *"Tóm tắt bài này, nếu dẫn nguồn quan trọng thì đọc luôn."*
   Model phát hiện link lúc chạy; người dùng không `@` trước được.
3. **Triage nhiều tab không attach tay** — *"~15 tab về chủ đề này, cái nào đáng đọc?"*
   `list_tabs` + `get_tab_text` để model tự lọc.
4. **Web fetch / cập nhật** — *"Bài này 2 năm trước rồi, có gì mới hơn không?"*
5. **Nhánh điều kiện** — *"Video >30 phút thì tóm theo chương, ngắn thì tóm gọn."*

**Kết luận thẳng thắn về Cấp A:** nếu phần lớn nhu cầu người dùng của một app *tóm tắt* rơi
vào vế "biết trước cần gì" (mà thực tế đúng vậy), thì Cấp A chỉ còn **2 thứ đáng làm**:
- **(1) Hỏi-đáp trên archive của chính mình** (`search_archive`).
- **(2) Fetch/đi theo link web** (`web_fetch`).

Cả hai đều là mở rộng nhỏ trên chat harness hiện tại.

---

## 7. Pattern "tab group" (từ Claude in Chrome)

Quan sát: extension Claude thường **gom tab vào một group** và chỉ thao tác trong group đó.
Đây là thiết kế cố ý (quyền `tabGroups` trong manifest gốc). **Tab group = "khu làm việc"
của agent**, giải quyết 3 việc cùng lúc:

1. **Ranh giới an toàn/phạm vi (quan trọng nhất).** Với `<all_urls>` + `debugger`, agent về
   lý thuyết chạm được mọi tab (ngân hàng, email, ví…). Group bó nó vào tập tab người dùng
   cố ý giao.
2. **Bề mặt đồng thuận trực quan.** Nhóm tab tô màu = "đây chính xác là những tab đang bị
   đụng vào". Kết hợp con trỏ phantom → người dùng luôn thấy agent làm gì, ở đâu.
3. **Working set ổn định về kỹ thuật.** Vòng lặp cần một tập tab xác định để thao tác đa
   bước, thay vì bám "activeTab" luôn thay đổi.

Thường agent còn **mở tab/group mới** thay vì chiếm tab đang đọc — tách "trình duyệt của
bạn" khỏi "khu làm việc của agent".

**Cần trung thực:** group là **quy ước chính sách (policy), không phải sandbox cứng.**
`chrome.debugger` vẫn attach được bất kỳ tab nào extension có quyền; cái giữ agent trong
group là **logic của chính agent**, không phải Chrome ép ở tầng OS. Nên nó là lớp
containment tốt cho UX + giảm rủi ro vô ý, không phải hàng rào chống code độc.

**Với Summarizerrrr:** nếu đi Cấp B, đây là pattern **rất đáng bê nguyên** — nó làm combo
đáng sợ `debugger` + `<all_urls>` trở nên *dễ chấp nhận*: "Summarizerrrr chỉ điều khiển các
tab trong nhóm bạn giao, không đụng phần còn lại." Gần như là điều kiện cần để một
agent-extension được tin dùng.

---

## 8. Ranh giới JS thuần vs. CDP — cái gì cần `debugger`, cái gì không

Đây là mục quyết định **Cấp B-lite tới đâu thì phải nâng lên Cấp B đầy đủ**.

| Việc | JS thuần (`chrome.scripting`) | Bắt buộc CDP (`debugger`) |
|---|---|---|
| Đọc DOM, sinh accessibility tree + `ref_id` | ✅ | – |
| `click()` nút/link thường | ✅ (đa số) | – |
| Điền `input`/`<textarea>` | ✅ (xem gotcha React dưới) | – |
| Cuộn, `focus()`, đọc text, điều hướng | ✅ | – |
| **Sự kiện "trusted"** (`isTrusted:true`) | ❌ synthetic luôn `false` | ✅ |
| **Upload `<input type=file>`** | ❌ chặn vì bảo mật | ✅ `DOM.setFileInputFiles` |
| **Native UI**: `<select>` xổ, date picker, `alert/confirm`, hộp chọn file | ❌ | ✅ |
| **Canvas / game / video** (không có DOM ngữ nghĩa) → click theo toạ độ | ❌ | ✅ (chế độ "computer") |
| **Bàn phím thật** (shortcut, IME, keyCode chuẩn) | ⚠️ chập chờn | ✅ `Input.dispatchKeyEvent` |
| **Screenshot** | ⚠️ chỉ `tabs.captureVisibleTab` (toàn viewport, không per-element/khuất) | ✅ `Page.captureScreenshot` đầy đủ |
| **Drag-drop HTML5 thật** | ❌ rất khó giả | ✅ |
| **Site chống bot** dò synthetic event | ❌ bị chặn | ✅ khó phân biệt input thật |

**Điểm đau lớn nhất của JS thuần** là `isTrusted:false`: nhiều site nhạy cảm (đăng nhập,
thanh toán, upload, anti-bot) *cố tình* bỏ qua sự kiện không trusted. Đó là ranh giới thật
giữa "chạy được trên site hiền" và "chạy được mọi nơi".

> **Gotcha React (bắt buộc biết nếu điền form):** set `input.value = x` trực tiếp bị React
> nuốt mất. Phải dùng native setter:
> `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, x)` rồi
> mới dispatch `input`. Cái này quyết định "điền form được hay không".

---

## 9. Caveat kỹ thuật (không bỏ qua)

1. **Firefox.** `chrome.debugger`/CDP là **Chromium-only**. Summarizerrrr đa trình duyệt →
   **Cấp B đầy đủ chỉ chạy Chrome/Edge**; Firefox tối đa tới **Cấp B-lite (JS thuần)**. Cấp
   A thì cross-browser bình thường.
2. **Tool-calling không đều giữa provider.** Gemini/OpenAI/Claude/Groq/OpenRouter hỗ trợ
   tốt; **Ollama/LM Studio/model local hên xui**. Cần gate "provider có hỗ trợ tools không"
   — giống cách đã gate `providerSupportsStreaming` và reasoning.
3. **Store review.** Quyền `debugger` + `<all_urls>` làm người dùng lẫn reviewer Chrome Web
   Store cảnh giác. **Cấp A và Cấp B-lite tránh được** (không xin `debugger`); chỉ Cấp B đầy
   đủ mới phải đối mặt.
4. **An toàn ghi.** Ngay từ **Cấp B-lite** đã cần approval UX trước hành động ghi (submit
   form, mua hàng…) + giữ redaction password/thẻ (mục 6.2 tài liệu gốc). Chưa có lớp này —
   và JS thuần *vẫn* thao tác ghi được, nên đừng nghĩ "không có debugger thì an toàn".

---

## 10. Điểm chèn vào code hiện tại

- **Điểm rẽ nhánh:** `runGeneration` trong `src/services/chat/chatService.js`. Nếu skill/mode
  bật tool → dùng request có tool loop thay cho `defaultStreamRequest`.
- **Tool executor đặt ở `background.js`** — nó mới có `tabs`/`scripting` (và `debugger` nếu
  lên Cấp B đầy đủ). Side panel gọi qua messaging như hiện tại.
- Kiến trúc "content script đọc → background điều phối → side panel hiển thị" của
  Summarizerrrr **đã đúng hình dạng agent** — không cần đảo lộn.

---

## 11. Khuyến nghị & câu hỏi mở

**Khuyến nghị:** Đừng làm agent vì "nghe hay". Quyết định theo định vị sản phẩm — và nhớ có
**3 nấc**, không phải 2:

- Nếu muốn dừng ở **trợ lý đọc/hỏi-đáp trên nội dung** → chỉ cần thêm **2 tool** ở Cấp A:
  `search_archive` (giá trị lớn nhất, độc nhất) và `web_fetch`. Rẻ, an toàn, cross-browser.
- Nếu muốn **thao tác trang cơ bản** (điền/bấm/đọc form trên site hiền) → **Cấp B-lite bằng
  JS thuần** là điểm dừng chi phí/rủi ro tốt nhất: cross-browser, không `debugger`, không đụng
  store-review. Vẫn cần approval UX + redaction ngay từ đây.
- Chỉ khi cần **thao tác mọi site** (trusted event, upload, canvas, chống bot) → **Cấp B đầy
  đủ (CDP/`debugger`)**, chấp nhận Chrome/Edge-only + tab-group scoping. Canh bạc lớn nhất.

**Câu hỏi mở cần chốt trước khi viết plan thực thi:**
1. Định vị: "đọc hộ", "thao tác trang cơ bản", hay "thao tác mọi site"?
2. Nếu Cấp A: chỉ `search_archive` + `web_fetch`, hay còn tool nào khác đủ giá trị?
3. Nếu thao tác trang: dừng ở **B-lite (JS thuần, cross-browser)** có đủ cho use case của
   bạn không, hay bắt buộc cần B đầy đủ (chấp nhận Chrome/Edge-only)?
4. Ngưỡng approval cho hành động ghi đặt ở đâu? (cần **ngay từ B-lite**, không chỉ B đầy đủ)

---

## 12. Tham chiếu

- `EXTENSION_ARCHITECTURE.md` — reverse-engineer "Claude in Chrome" (perception §6, CDP §7,
  bộ tool §8, kế hoạch viết lại §12).
- `src/services/chat/chatService.js` — `runGeneration` (điểm chèn), single-shot hiện tại.
- `src/lib/api/aiSdkAdapter.js` — provider abstraction đã có.
- `wxt.config.ts` — permissions hiện tại (có `activeTab/scripting/declarativeNetRequest`,
  **chưa có** `debugger`/`tabGroups`).
- Memory `chat-harness-direction` — định hướng chat harness (skills, `@tab`, thin system
  prompt).
