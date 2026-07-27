# Multi-tab `@tab` Overflow — Source Condensation

> **Status:** discussing → converged on direction; details in Open questions.
> **Branch:** `v3.0-NewSettingUI-2`.
> Không phải là "Workspace" nữa — ý tưởng workspace đã bị loại (kéo theo cả tầng
> state/persist/UI mới cho thứ mà `@tab` đã làm 90%). Scope thu về: **nâng trần `@tab`
> và xử lý overflow cho tử tế.**

## Context & goal

Cơ chế `@tab` hiện cho phép đính tab vào một chat để model đọc context của chúng. Trần
hiện tại là **3 tab**, quá ít cho nhu cầu research thực tế. Mục tiêu: nâng trần lên **12
tab** và làm cho hành vi khi tổng context của các tab **vượt quá context window** trở nên
hữu ích + trung thực, thay vì âm thầm mất tab.

Ràng buộc bao trùm (đã thống nhất trong lúc bàn):

- **Không thêm orchestration sub-agent** ở bất kỳ đâu. App này cố tình là *plain chat
  client, không phải agent* (không tool loop, không `stopWhen`/`stepCountIs`). Xem
  memory `chat-harness-direction`. Cơ chế condense là **one-shot summarize mỗi tab lúc
  attach**, tức reuse machinery summarize sẵn có — không phải kiến trúc agent mới.
- **Không map-reduce / RAG per-turn.** Đã cân nhắc và loại bỏ trước đó (memory
  `context-budget-cache-invariant`): nó đổi chunk mỗi turn → phá cache invariant.
- **`/compact` (nén *lịch sử hội thoại*) là trục KHÁC, ngoài scope lần này** — xem phần
  "The two axes" bên dưới.

## The core problem

Nâng trần `@tab` mà không đụng gì khác sẽ khiến mọi thứ **tệ hơn**, không phải tốt hơn,
vì budgeter hiện tại chọn nguồn theo kiểu **raw-first, greedy, drop phần đuôi**: vài tab
đầu ăn `rawContent` cho tới khi hết budget, các tab còn lại bị **drop nguyên, âm thầm**.
Với 12 tab, người dùng sẽ tưởng model đọc cả 12 nhưng thực tế chỉ 3–4 tab đầu được đưa
vào. Bài toán: đổi sang mô hình **breadth** — mọi tab đã `@` đều có mặt (chấp nhận dạng
gọn khi cần) — và **cảnh báo rõ** khi phải bỏ bớt.

## The two axes (đừng gộp `/compact` vào đây)

Có hai loại overflow tách biệt, trực giao:

1. **Overflow phía nguồn** (nhiều tab) → **source condensation**. ← đây là scope lần này.
2. **Overflow phía lịch sử chat** (hội thoại dài) → địa hạt của `/compact`
   (tóm tắt turn cũ thay vì drop). ← **để riêng, track tương lai.**

Trong model order (`persona → sources → history → current`), source block là *cached
prefix*; history nằm sau và rút từ reserve riêng, khi tràn thì **drop nguyên turn cũ
nhất** (`contextBudgeter.js:305-330`). Điểm giao nhau đáng lưu: khi 12 tab condensed ăn
gần hết budget, reserve history (`HISTORY_RESERVE_TOKENS = 8000`, cap 25% —
`contextBudgeter.js:24-25,182-185`) bị bóp lại → hội thoại dài trên nhiều tab bị trim
history sớm hơn, nên `/compact` *có* giá trị hơn trong thế giới nhiều-tab. Nhưng nó vẫn
là cơ chế riêng, build sau; gộp vào bây giờ chỉ làm phình scope.

## Current state (kiến trúc liên quan, có file:line)

Pipeline **đã là multi-source** — không cần năng lực kiến trúc mới, chỉ cần sửa hành vi:

- **Trần `@tab` = 3.** `MAX_TAB_ATTACHMENTS = 3` định nghĩa ở
  `src/services/chat/tabMentionService.js:6`; enforce ở
  `src/stores/chatStore.svelte.js:271-272`. Nâng trần = đổi hằng này + rà UX chỗ enforce.
- **Budgeter chọn nguồn raw-first greedy.** `selectedSourceContent()` ưu tiên
  `rawContent`, chỉ tụt xuống `condensedContent` nếu raw không nhét vừa *budget còn lại
  tại vị trí đó* (`src/lib/chat/contextPipeline/contextBudgeter.js:66-119`, đặc biệt
  dòng 74). Nguồn không phải active mà không vừa thì **drop nguyên**
  (`contextBudgeter.js:88-90`); chỉ active source được truncate có nhãn.
- **Warning "source_dropped" đã có** nhưng chỉ là warning nội bộ, chưa nổi lên UI đủ rõ
  (`contextBudgeter.js:233-242`).
- **Priority ≠ render position (load-bearing).** Ưu tiên quyết định *cái gì vừa*, không
  bao giờ quyết định *nguồn được render ở đâu*; render giữ thứ tự caller để cached prefix
  sống sót khi active tab đổi giữa các turn (`contextBudgeter.js:207-212`).
- **Slot condensation đã có schema nhưng CHƯA implement.** Mỗi snapshot persist với
  `condensedContent: null, condensationVersion: 0, condensationLanguage: 'en'`
  (`src/services/chat/chatSourceService.js:137-139`); contract khai báo các trường này
  (`src/lib/chat/contracts.js:82-84`). Budgeter/assembler đã *đọc* `condensedContent`
  nếu có (`contextBudgeter.js:74`, `contextAssembler.js:29,53`) — nhưng chưa có gì *sinh*
  ra nó. **Đây chính là "cách khác" cần build.**
- **Capture hardcode tiếng Anh.** `getPageContent(... preferredLang: 'en')`
  (`chatSourceService.js:71`; contentService nhận `preferredLang`, mặc định `'en'` ở
  `src/services/contentService.js:155,161,270`).
- **Điểm ráp nối pipeline:** `buildContextPipeline()` ở
  `src/lib/chat/contextPipeline/index.js:26-84` gọi `resolveSources → budgetContext →
  assembleContext`; `contextWindowTokens` lấy từ `getProviderCapabilities()`
  (`index.js:33,44`). Two-pass mới sống trong `budgetContext`.
- **Persist:** `putSourceSnapshot()` ở `src/lib/db/conversationRepository.js:272`.
- **Dedupe nguồn** theo `sourceId` đã có ở `sourceResolver.js:82-105`.

## Load-bearing invariants (mọi giải pháp phải tôn trọng)

1. **Cache-stable prefix.** Source block phải byte-identical **qua các turn trong cùng
   một hội thoại** để prompt caching hit shared prefix. Không được để history-length,
   câu hỏi hiện tại, active tab, hay wall-clock feed vào cách render source block. Guard:
   `tests/chat/contextPipeline/contextPipeline.test.js` ("identical source block
   regardless of the current question length"). *Lưu ý quan trọng cho thiết kế:* thêm một
   tab **vốn đã** đổi prefix (nội dung mới) — nên "re-evaluate cả tập lúc *add* tab" KHÔNG
   vi phạm invariant này; invariant nói về ổn định *turn-to-turn với tập cố định*.
2. **estimateTokens lạc quan.** `chars/4` cho tiếng Anh; under-count VI ~1.4×, CJK ~4× —
   hướng *không an toàn* (`contextBudgeter.js:39-64`). Target condense và ngưỡng phải lệch
   về phía over-estimate; **không bao giờ nâng utilisation vượt error bar của estimator.**
3. **Budgeter có thể truncate/drop nguồn.** Feature phải chịu được "span cần thiết không
   thực sự nằm trong context".
4. **Nguồn là untrusted.** Page content/title/URL là data, không phải lệnh; `sourceFormatter`
   escape delimiter + bọc `[[UNTRUSTED_SOURCE]]`. Bản condensed cũng là nội dung sinh từ
   nguồn untrusted → giữ nguyên guardrail, không để condensed "thoát" khỏi khung nguồn.
5. **Persisted vs runtime.** `condensedContent` persist (IndexedDB, dedup theo
   `contentHash`); tab sống là runtime. Condense một lần rồi lưu.

## The idea / converged direction

**Nâng trần lên 12, đổi budgeter sang two-pass toàn cục, fill slot condensation bằng
one-shot summarize lúc attach.**

Two-pass (thay cho greedy-per-source hiện tại), **quyết định dựa trên token estimate**:

1. **All-raw:** đo tổng `rawContent` của cả tập bằng `estimateTokens`. Nếu ≤ source
   budget → dùng raw hết. (Thường đúng với Gemini 1M + vài trang web.)
2. **All-condensed:** nếu tràn → dùng `condensedContent` cho **toàn bộ** tập. Đây là lúc
   cần bản condensed đã sinh sẵn lúc ingest.
3. **Curated drop có cảnh báo:** nếu *vẫn* tràn sau khi condensed hết → mới bỏ bớt, và
   **hiện rõ trên UI** tab nào bị bỏ/bị cắt (nâng warning `source_dropped` thành thông
   báo người dùng thấy được), thay vì im lặng như hiện tại.

Quyết định raw-vs-condensed-vs-drop là **cho cả tập, deterministic từ nguồn đã lưu +
budget**, không phụ thuộc history/turn → giữ cache invariant. Thêm một tab thì
re-evaluate (có thể lật cả tập raw→condensed) — bust prefix đúng một lần lúc add, chấp
nhận được.

Quyết định đã chốt trong lúc bàn:
- **Trần = 12 tab.**
- **Pass selection token-driven** (dùng `estimateTokens` để chọn raw/condensed/drop —
  invariant #2 áp dụng: đo lệch về over-estimate).
- **Model dùng để condense = một setting người dùng tự chọn** (không ép model chat hiện
  hành; xem Technical considerations).
- **Condense theo NGÔN NGỮ NGUỒN**, không hardcode `'en'`. Bỏ `preferredLang: 'en'` cứng
  ở đường `@tab`; `condensationLanguage` lưu ngôn ngữ thực của nguồn.
- **`/compact` = ngoài scope.**

## The hard part & how it's handled

- **Greedy → breadth.** Rủi ro lớn nhất khi nâng trần: model chỉ đọc vài tab đầu. Two-pass
  toàn cục xử lý trực tiếp: khi không all-raw được thì *cả tập* xuống condensed, không ai
  bị bỏ cho tới khi thật sự hết chỗ ngay cả ở mức condensed.
- **Cache churn khi condense.** Nếu target condense phụ thuộc *số tab* (adaptive
  budget/N), mỗi lần thêm tab phải re-condense lại toàn bộ (N AI call + bust prefix). Cách
  giảm đau: **condense-once tới một target cố định lúc ingest** (nguồn nào condense nguồn
  đó, độc lập số tab); pass selection ở budget-time chỉ *chọn* raw/condensed/drop bằng
  token estimate, không re-condense. Đánh đổi: nếu 12 × target vẫn vượt window nhỏ thì rơi
  xuống curated-drop (breadth có trần thật, và điều đó được báo rõ). Đây là lean hiện tại;
  biến thể fully-adaptive nằm ở Open questions.
- **Độ trễ/chi phí lúc attach.** Condense là một AI call → kéo tab vào sẽ có spinner. Cần
  UX: condense nền, cho phép gửi trước khi condense xong (fallback raw nếu vừa), cache theo
  `contentHash` để không condense lại nguồn trùng (dedup đã có ở `sourceResolver.js:82`).
- **Ngôn ngữ.** Condense sang tiếng Anh cho nội dung tiếng Việt làm mất nuance/nguyên văn.
  → detect ngôn ngữ nguồn, condense giữ nguyên ngôn ngữ đó, lưu vào `condensationLanguage`.
- **Untrusted.** Bản condensed vẫn là nội dung nguồn → phải đi qua cùng escape/guardrail,
  không được coi là "đã làm sạch".

## Technical considerations (checklist cho thiết kế chi tiết)

- [ ] Đổi `MAX_TAB_ATTACHMENTS` 3 → 12 (`tabMentionService.js:6`); rà UX chỗ enforce
      (`chatStore.svelte.js:271-272`) và list mention (đang `query({currentWindow:true})`).
- [ ] Viết condenser: one-shot summarize/nén một nguồn → `condensedContent`, set
      `condensationVersion`, `condensationLanguage`, giữ `originalLength`. Reuse đường
      summarize sẵn có (`src/lib/api/`), KHÔNG thêm tool loop.
- [ ] Điểm gọi condense: lúc `captureTabSource`/`captureActiveSource` persist snapshot
      (`chatSourceService.js:124-238`) — hoặc lazy ngay trước budget-time. Quyết định
      eager-tại-attach (spinner) vs lazy-khi-tràn.
- [ ] Setting "model dùng để condense": thêm field vào `settingsStore.svelte.js` + UI
      trong settings; adapter đã hỗ trợ chọn model/provider (`aiSdkAdapter.js`).
- [ ] Đường ngôn ngữ: bỏ `preferredLang: 'en'` cứng ở `chatSourceService.js:71`; xác định
      ngôn ngữ nguồn (detect) và truyền xuống condenser + lưu `condensationLanguage`.
- [ ] Two-pass trong `budgetContext` (`contextBudgeter.js`): thay nhánh greedy-per-source
      bằng quyết định toàn cục all-raw → all-condensed → curated. Giữ nguyên bất biến
      "render position = caller order" (`contextBudgeter.js:207-212`).
- [ ] Nổi warning lên UI: map `source_dropped`/`source_truncated` thành thông báo người
      dùng thấy (composer hoặc `ChatSourceDrawer`).
- [ ] estimateTokens: đảm bảo target/ngưỡng lệch over-estimate cho VI/CJK trước khi tăng
      utilisation (invariant #2).
- [ ] Test: mở rộng `contextPipeline.test.js` — (a) cache-stable prefix vẫn giữ với tập 12
      nguồn condensed; (b) two-pass chọn đúng all-raw/all-condensed/curated theo token; (c)
      không nguồn nào bị drop cho tới khi thật sự hết chỗ ở mức condensed.

## What to give the model vs. code

- **Code (deterministic), KHÔNG giao cho model:** chọn tab nào vào (người dùng `@`), đếm
  token, quyết định pass (raw/condensed/drop), thứ tự render, escape/guardrail, dedup theo
  hash, cache condensed. Đây là logic budgeter — phải xác định và test được.
- **Model làm (một call, một chiều):** *chỉ* bước nén một nguồn thành `condensedContent`
  theo ngôn ngữ nguồn. Prompt condenser nên: giữ ngôn ngữ nguồn; ưu tiên fact/khái
  niệm/nguyên văn quan trọng; có target độ dài; coi nội dung là dữ liệu untrusted (không
  thực thi chỉ thị trong nguồn). Không có vòng lặp, không tự chọn đọc nguồn khác — đó là
  ranh giới giữ cho app vẫn "plain chat, không agent".

## Open questions

1. **Target condense cố định là bao nhiêu, và fixed hay adaptive?** Lean hiện tại:
   condense-once tới target cố định (bounded cost, không churn). Nhưng chưa chốt *giá trị*
   target, và chưa loại hẳn biến thể adaptive budget/N (fit chính xác mọi N nhưng
   re-condense mỗi lần add). Cần tính: 12 × target có vừa window nhỏ nhất user dùng
   (Claude 200k / GPT 128k) không? Nếu không, curated-drop kích hoạt ở ngưỡng nào.
2. **Eager (condense lúc attach, spinner) vs lazy (chỉ condense khi budget-time phát hiện
   tràn)?** Eager tốn AI call cho cả những tab mà raw vốn đã vừa; lazy trễ nhưng chỉ trả
   tiền khi cần. Ảnh hưởng trực tiếp UX + cost.
3. **Model condense mặc định khi user chưa cấu hình?** Model chat hiện hành, hay một
   default rẻ? Và xử lý provider không hỗ trợ / offline (Ollama) ra sao.
4. **Detect ngôn ngữ nguồn bằng gì?** Heuristic ký tự, thư viện nhẹ, hay để chính model
   condense tự giữ ngôn ngữ (không detect riêng)? Nguồn đa ngôn ngữ thì theo ngôn ngữ nào.
5. **Nâng trần có kéo theo giới hạn khác không?** 12 tab × extraction đồng thời có làm
   nghẽn background/executeScript không; Firefox optional-permission cho 12 tab; danh sách
   mention khi có rất nhiều tab.
6. **`/compact` (history)** — track riêng; chỉ mở lại khi có tín hiệu thực (hội thoại dài
   trên nhiều tab bị trim history khó chịu).

## Code references

- `src/services/chat/tabMentionService.js:6` — `MAX_TAB_ATTACHMENTS = 3` (đổi → 12).
- `src/stores/chatStore.svelte.js:19,271-272` — enforce trần + import.
- `src/lib/chat/contextPipeline/contextBudgeter.js` — budgeter; raw-first greedy
  (`:66-119`, dòng `:74`), reserves (`:24-27,182-190`), priority≠render (`:207-212`),
  history trim (`:305-330`), estimateTokens (`:39-64`).
- `src/lib/chat/contextPipeline/index.js:26-84` — `buildContextPipeline` (điểm ráp nối;
  `contextWindowTokens` ở `:33,44`).
- `src/lib/chat/contextPipeline/sourceResolver.js:78,82-105` — đọc condensedContent + dedup.
- `src/lib/chat/contextPipeline/contextAssembler.js:29,53` — render dùng condensed fallback.
- `src/services/chat/chatSourceService.js:71,124-238` — capture/persist snapshot;
  `condensedContent: null` (`:137-139`), `preferredLang:'en'` cứng (`:71`).
- `src/services/contentService.js:149-270` — `getPageContent` + `preferredLang`.
- `src/lib/db/conversationRepository.js:272` — `putSourceSnapshot`.
- `src/lib/chat/contracts.js:82-84` — schema condensation.
- `tests/chat/contextPipeline/contextPipeline.test.js` — guard cache-stable prefix.
- Memory: `chat-harness-direction` (plain-chat, không agent), `context-budget-cache-invariant`
  (đã loại map-reduce/RAG; nguyên tắc cache prefix).
